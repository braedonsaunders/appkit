/**
 * The backend port and its default Cloud Hypervisor implementation.
 *
 * `DeskBackend` is the seam that keeps the package testable without a
 * hypervisor: the host asks a backend to boot a `DeskLaunchPlan` and gets a
 * `DeskMachine` — a request/response channel to the in-guest agent plus an
 * event subscription. CI and non-KVM developer machines inject an in-memory
 * fake; production uses `cloudHypervisorBackend`, whose process-spawning glue
 * is deliberately thin because everything that can be pure lives in the plan
 * builder and the protocol module.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import { Buffer } from 'node:buffer'
import type { Duplex } from 'node:stream'
import { DeskError, type DeskLaunchPlan, type DeskLauncherIdentity } from './plan'
import {
  encodeFrame,
  FrameDecoder,
  GUEST_AGENT_VSOCK_PORT,
  parseHostBoundMessage,
  type GuestCommand,
  type GuestEventMessage,
  type HostBoundMessage,
} from './protocol'

/** A booted microVM as the host sees it: one desk, one guest-agent channel. */
export interface DeskMachine {
  readonly deskId: string
  /**
   * Send one request to the in-guest agent and await its correlated result.
   * Rejects with `DeskError` when the guest reports an error, the request
   * times out, or the connection is gone.
   */
  request(command: GuestCommand, options?: { timeoutMs?: number }): Promise<unknown>
  /** Subscribe to unsolicited guest events (job exits, frames, focus changes). */
  subscribe(listener: (event: GuestEventMessage) => void): () => void
  /** Stop the VM. Idempotent; resolves once the VMM process has exited. */
  shutdown(): Promise<void>
}

export interface DeskBackend {
  boot(plan: DeskLaunchPlan): Promise<DeskMachine>
}

export type DeskProcessLauncher = (
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity },
) => ChildProcess

export interface CloudHypervisorBackendOptions {
  /** Spawns the VMM and image tooling; injectable for tests. */
  launcher?: DeskProcessLauncher
  /** Opens the host side of the vsock Unix socket; injectable for tests. */
  connect?: (socketPath: string) => Duplex
  platform?: NodeJS.Platform
  idFactory?: () => string
  requestTimeoutMs?: number
  connectTimeoutMs?: number
  connectRetryDelayMs?: number
  killGraceMs?: number
  guestAgentPort?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000
const DEFAULT_CONNECT_RETRY_DELAY_MS = 100
const DEFAULT_KILL_GRACE_MS = 2_000
const HANDSHAKE_LINE_LIMIT = 128

export function createCloudHypervisorBackend(
  options: CloudHypervisorBackendOptions = {},
): DeskBackend {
  const launcher = options.launcher ?? defaultLauncher
  const connect = options.connect ?? defaultConnect
  const platform = options.platform ?? process.platform
  const idFactory = options.idFactory ?? randomUUID
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
  const connectRetryDelayMs = options.connectRetryDelayMs ?? DEFAULT_CONNECT_RETRY_DELAY_MS
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS
  const guestAgentPort = options.guestAgentPort ?? GUEST_AGENT_VSOCK_PORT

  async function boot(plan: DeskLaunchPlan): Promise<DeskMachine> {
    if (platform !== 'linux') {
      throw new DeskError(`The AppKit desk requires Linux; received ${platform}.`)
    }
    if (plan.overlay.create) {
      await runToCompletion(
        launcher(plan.overlay.create.command, plan.overlay.create.args, {
          identity: plan.launcherIdentity,
        }),
        `overlay creation for desk ${plan.deskId}`,
      )
    }

    const child = launcher(plan.vmm.command, plan.vmm.args, { identity: plan.launcherIdentity })
    const exit = watchExit(child)
    let stream: Duplex
    try {
      stream = await connectWithRetry({
        connect,
        socketPath: plan.vsock.socketPath,
        port: guestAgentPort,
        timeoutMs: connectTimeoutMs,
        retryDelayMs: connectRetryDelayMs,
        exited: exit,
      })
    } catch (error) {
      await terminate(child, exit, killGraceMs)
      throw error instanceof DeskError
        ? error
        : new DeskError(`Could not reach the guest agent for desk ${plan.deskId}: ${errorMessage(error)}`)
    }
    return createMachine({
      deskId: plan.deskId,
      child,
      exit,
      stream,
      idFactory,
      requestTimeoutMs,
      killGraceMs,
    })
  }

  return { boot }
}

/** The default backend: real Cloud Hypervisor over a real vsock socket. */
export const cloudHypervisorBackend: DeskBackend = createCloudHypervisorBackend()

function createMachine(options: {
  deskId: string
  child: ChildProcess
  exit: ExitWatcher
  stream: Duplex
  idFactory: () => string
  requestTimeoutMs: number
  killGraceMs: number
}): DeskMachine {
  const { deskId, child, exit, stream, idFactory, requestTimeoutMs, killGraceMs } = options
  const decoder = new FrameDecoder()
  const pending = new Map<
    string,
    { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()
  const listeners = new Set<(event: GuestEventMessage) => void>()
  let closed = false

  function failAll(error: DeskError): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function close(error: DeskError): void {
    if (closed) return
    closed = true
    failAll(error)
    stream.destroy()
  }

  stream.on('data', (chunk: Buffer) => {
    let values: unknown[]
    try {
      values = decoder.push(chunk)
    } catch (error) {
      close(new DeskError(`Guest agent protocol violation on desk ${deskId}: ${errorMessage(error)}`))
      return
    }
    for (const value of values) {
      let message: HostBoundMessage
      try {
        message = parseHostBoundMessage(value)
      } catch (error) {
        close(new DeskError(`Guest agent sent a malformed message on desk ${deskId}: ${errorMessage(error)}`))
        return
      }
      if ('id' in message) {
        const entry = pending.get(message.id)
        if (!entry) continue
        pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.ok) entry.resolve(message.result)
        else entry.reject(new DeskError(`Guest agent error on desk ${deskId}: ${message.error}`))
      } else {
        for (const listener of [...listeners]) listener(message)
      }
    }
  })
  stream.once('close', () => {
    close(new DeskError(`Guest agent connection closed on desk ${deskId}.`))
  })
  stream.once('error', (error: Error) => {
    close(new DeskError(`Guest agent connection failed on desk ${deskId}: ${error.message}`))
  })

  return {
    deskId,
    request(command, requestOptions = {}) {
      if (closed) {
        return Promise.reject(new DeskError(`Desk ${deskId} is no longer connected.`))
      }
      const id = idFactory()
      const timeoutMs = requestOptions.timeoutMs ?? requestTimeoutMs
      return new Promise<unknown>((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          rejectPromise(new DeskError(`Guest request ${command.op} timed out on desk ${deskId}.`))
        }, timeoutMs)
        timer.unref()
        pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
        stream.write(encodeFrame({ ...command, id }))
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async shutdown() {
      close(new DeskError(`Desk ${deskId} is shutting down.`))
      await terminate(child, exit, killGraceMs)
    },
  }
}

interface ExitWatcher {
  done: boolean
  promise: Promise<void>
}

function watchExit(child: ChildProcess): ExitWatcher {
  const watcher: ExitWatcher = { done: false, promise: Promise.resolve() }
  watcher.promise = new Promise<void>((resolvePromise) => {
    const settle = () => {
      watcher.done = true
      resolvePromise()
    }
    child.once('exit', settle)
    child.once('error', settle)
  })
  return watcher
}

async function terminate(child: ChildProcess, exit: ExitWatcher, killGraceMs: number): Promise<void> {
  if (exit.done) return
  child.kill('SIGTERM')
  const forceKill = setTimeout(() => {
    if (!exit.done) child.kill('SIGKILL')
  }, killGraceMs)
  forceKill.unref()
  await exit.promise
  clearTimeout(forceKill)
}

function runToCompletion(child: ChildProcess, label: string): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', (error) => {
      rejectPromise(new DeskError(`${label} failed to start: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const detail = stderr.trim()
      rejectPromise(
        new DeskError(
          `${label} exited with code ${code ?? 'unknown'}`
            + `${signal ? ` (${signal})` : ''}${detail ? `: ${detail}` : '.'}`,
        ),
      )
    })
  })
}

/**
 * Cloud Hypervisor exposes guest vsock ports through a host Unix socket with
 * a line-oriented preamble: the client writes `CONNECT <port>\n` and the VMM
 * answers `OK <assigned>\n` before the byte stream becomes the guest
 * connection. The VMM creates the socket during boot, so connection attempts
 * retry until the deadline.
 */
async function connectWithRetry(options: {
  connect: (socketPath: string) => Duplex
  socketPath: string
  port: number
  timeoutMs: number
  retryDelayMs: number
  exited: ExitWatcher
}): Promise<Duplex> {
  const deadline = Date.now() + options.timeoutMs
  let lastFailure = 'the guest agent never answered'
  while (Date.now() <= deadline) {
    if (options.exited.done) {
      throw new DeskError('The VMM exited before the guest agent came up.')
    }
    try {
      return await attemptHandshake(options.connect, options.socketPath, options.port)
    } catch (error) {
      lastFailure = errorMessage(error)
    }
    await delay(options.retryDelayMs)
  }
  throw new DeskError(
    `Timed out connecting to the guest agent at ${options.socketPath}: ${lastFailure}`,
  )
}

function attemptHandshake(
  connect: (socketPath: string) => Duplex,
  socketPath: string,
  port: number,
): Promise<Duplex> {
  return new Promise<Duplex>((resolvePromise, rejectPromise) => {
    let stream: Duplex
    try {
      stream = connect(socketPath)
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
      return
    }
    let banner = ''
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      stream.destroy()
      rejectPromise(error)
    }
    const onData = (chunk: Buffer) => {
      banner += chunk.toString('latin1')
      const newline = banner.indexOf('\n')
      if (newline === -1) {
        if (banner.length > HANDSHAKE_LINE_LIMIT) {
          fail(new DeskError('vsock handshake reply exceeded the line limit.'))
        }
        return
      }
      const line = banner.slice(0, newline)
      const rest = banner.slice(newline + 1)
      stream.off('data', onData)
      stream.off('error', fail)
      if (!line.startsWith('OK ')) {
        fail(new DeskError(`vsock handshake was refused: ${line}`))
        return
      }
      settled = true
      if (rest.length > 0) stream.unshift(Buffer.from(rest, 'latin1'))
      resolvePromise(stream)
    }
    stream.on('data', onData)
    stream.once('error', fail)
    stream.write(`CONNECT ${port}\n`)
  })
}

function defaultLauncher(
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity },
): ChildProcess {
  return spawn(command, [...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    uid: options.identity?.uid,
    gid: options.identity?.gid,
  })
}

function defaultConnect(socketPath: string): Duplex {
  return createConnection(socketPath)
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    timer.unref()
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
