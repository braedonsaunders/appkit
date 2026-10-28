import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Duplex } from 'node:stream'
import type { DeskBackend, DeskProcessLauncher } from './backend'
import { DeskError } from './plan'
import { GUEST_AGENT_VSOCK_PORT } from './protocol'
import {
  attemptHandshake, connectWithRetry, createGuestMachine, defaultConnect, drainOutput,
  errorMessage, runToCompletion, terminate, watchExit,
} from './machine'

/** A signed helper is supplied by the host; it is not downloaded or executed at install time. */
export interface VirtualizationBackendOptions {
  helperPath: string
  launcher?: DeskProcessLauncher
  connect?: (socketPath: string) => Duplex
  connectTimeoutMs?: number
  /** Existing file for the guest serial console; omit to disable it. */
  consoleLogPath?: string
  requestTimeoutMs?: number
  guestAgentPort?: number
  platform?: NodeJS.Platform
}

export function createVirtualizationBackend(options: VirtualizationBackendOptions): DeskBackend {
  if (options.consoleLogPath && !isAbsolute(options.consoleLogPath)) throw new DeskError('consoleLogPath must be an absolute path.')
  if (!isAbsolute(options.helperPath)) throw new DeskError('helperPath must be an absolute path.')
  const launcher: DeskProcessLauncher = options.launcher ?? ((command, args, { identity }) => spawn(command, [...args], {
    stdio: ['pipe', 'pipe', 'pipe'], uid: identity?.uid, gid: identity?.gid,
  }))
  const timeout = options.connectTimeoutMs ?? 30_000
  return {
    hypervisor: 'virtualization',
    vmmPath: options.helperPath,
    async boot(plan, hooks) {
      if (plan.hypervisor !== 'virtualization') throw new DeskError('Virtualization backend requires a virtualization plan.')
      if ((options.platform ?? process.platform) !== 'darwin') throw new DeskError('Virtualization requires macOS.')
      if (plan.overlay.create) await runToCompletion(launcher(plan.overlay.create.command, plan.overlay.create.args, { identity: plan.launcherIdentity }), `overlay creation for desk ${plan.deskId}`)
      await mkdir(dirname(plan.vsock.socketPath), { recursive: true, mode: 0o700 })
      const child = launcher(options.helperPath, [], { identity: plan.launcherIdentity })
      const exit = watchExit(child)
      const log = drainOutput(child, 8192, ['stderr'])
      if (!child.stdin || !child.stdout) {
        await terminate(child, exit, 2000)
        throw new DeskError('Virtualization helper requires piped stdin and stdout.')
      }
      const input = child.stdin
      // A helper exit may close stdin while a write is in flight.
      input.on('error', () => undefined)
      const pending = new Map<string, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        let message: Record<string, unknown>
        try { message = JSON.parse(line) as Record<string, unknown> } catch { return }
        if (!message || typeof message !== 'object' || typeof message.id !== 'string') return
        const entry = pending.get(message.id)
        if (!entry) return
        pending.delete(message.id); clearTimeout(entry.timer)
        if (message.ok === true && message.result && typeof message.result === 'object') entry.resolve(message.result as Record<string, unknown>)
        else entry.reject(new DeskError(String(message.error ?? 'Helper request failed.')))
      })
      void exit.promise.then(() => {
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new DeskError(`Virtualization helper exited: ${log.tail()}`)) }
        pending.clear(); lines.close()
      })
      function call(op: string, fields: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        if (exit.done) return Promise.reject(new DeskError('Virtualization helper exited.'))
        const id = randomUUID()
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(id); reject(new DeskError(`Virtualization helper ${op} timed out.`)) }, timeout)
          pending.set(id, { resolve, reject, timer })
          input.write(`${JSON.stringify({ ...fields, id, op })}\n`, (error) => {
            if (error) { const entry = pending.get(id); if (entry) { clearTimeout(entry.timer); pending.delete(id); reject(error) } }
          })
        })
      }
      const stop = async () => {
        try { if (!exit.done) await call('stop') } finally { await terminate(child, exit, 2000) }
      }
      try {
        const identifierPath = join(plan.snapshot.dir, 'machine-id')
        const identifier = plan.snapshot.restoring ? await readFile(identifierPath, 'utf8') : undefined
        const boot = await call('boot', {
          kernel: plan.kernelPath, initrd: plan.initramfsPath, cmdline: plan.kernelCmdline,
          ...(options.consoleLogPath ? { consoleLog: options.consoleLogPath } : {}),
          disk: plan.overlay.path, memoryMb: plan.memoryMb, vcpus: plan.vcpus,
          vsockSocket: plan.vsock.socketPath, portSocket: plan.ports.socketPath,
          ...(plan.snapshot.restoring ? { restoreFrom: join(plan.snapshot.dir, 'state'), machineIdentifier: identifier } : {}),
          network: { ...plan.network, macAddress: plan.network.mac },
        })
        if (typeof boot.machineIdentifier !== 'string') throw new DeskError('Helper did not return a machine identifier.')
        const machineIdentifier = boot.machineIdentifier
        if (plan.snapshot.restoring) {
          if (!hooks?.onRestored) throw new DeskError('Restore requires snapshot invalidation before resume.')
          await hooks.onRestored()
          await call('resume')
        }
        const connectAgent = (abandoned?: () => boolean) => connectWithRetry({
          connect: options.connect ?? defaultConnect, now: Date.now, socketPath: plan.vsock.socketPath,
          port: options.guestAgentPort ?? GUEST_AGENT_VSOCK_PORT, timeoutMs: timeout, retryDelayMs: 100,
          attemptTimeoutMs: 5000, exited: exit, abandoned,
        })
        const stream = await connectAgent()
        return createGuestMachine({
          deskId: plan.deskId, exit, stream, reconnect: connectAgent, reconnectWindowMs: timeout,
          now: Date.now, idFactory: randomUUID, requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
          stop,
          connect: (port) => attemptHandshake(options.connect ?? defaultConnect, plan.ports.socketPath, port, 5000),
          ...(boot.saveRestore === true ? {
            park: async (dir: string) => {
              try {
                await call('save', { path: join(dir, 'state') })
                await writeFile(join(dir, 'machine-id'), machineIdentifier, { mode: 0o600 })
              } finally { await stop() }
            },
          } : {}),
        })
      } catch (error) {
        await terminate(child, exit, 2000)
        throw new DeskError(`Virtualization desk ${plan.deskId} failed: ${errorMessage(error)}${log.tail() ? ` (${log.tail()})` : ''}`)
      }
    },
  }
}
