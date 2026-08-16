import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { Duplex } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { createCloudHypervisorBackend } from './backend'
import { createGuestAgentCore, type GuestAgentHandlers } from './guest-agent'
import { buildDeskLaunchPlan, type DeskLaunchPlan } from './plan'
import type { GuestEventMessage } from './protocol'

type FakeChild = ChildProcess & { killedWith: NodeJS.Signals[] }

function fakeChild(options: { exitOnKill?: boolean; exitImmediately?: boolean } = {}): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.killedWith = []
  child.kill = ((signal: NodeJS.Signals = 'SIGTERM') => {
    child.killedWith.push(signal)
    if (options.exitOnKill) queueMicrotask(() => child.emit('exit', null, signal))
    return true
  }) as ChildProcess['kill']
  if (options.exitImmediately) queueMicrotask(() => child.emit('exit', 0, null))
  return child
}

const guestHandlers: GuestAgentHandlers = {
  exec: async (call) => ({
    exitCode: 0,
    signal: null,
    stdout: `ran ${call.command}`,
    stderr: '',
    truncated: false,
  }),
  jobStart: async () => ({ jobId: 'job-1' }),
  jobSignal: async () => undefined,
  screenStart: async () => undefined,
  screenStop: async () => undefined,
  observe: async () => ({ png: '', width: 1, height: 1, a11y: null, windows: [], focused: null }),
  input: async () => undefined,
  a11yInvoke: async () => undefined,
  launch: async () => undefined,
  clipboardRead: async () => ({ text: 'copied' }),
  clipboardWrite: async () => undefined,
  framesStart: async () => undefined,
  framesStop: async () => undefined,
  handoverBegin: async () => ({ url: 'https://relay.example/session' }),
  handoverEnd: async () => undefined,
  capabilities: async () => ({ virtioGpu: false }),
}

interface FakeVsock {
  connect: (socketPath: string) => Duplex
  handshakes: string[]
  connectedPaths: string[]
  pushEvent: (event: GuestEventMessage) => void
}

function fakeVsock(handlers: GuestAgentHandlers): FakeVsock {
  const handshakes: string[] = []
  const connectedPaths: string[] = []
  let active: { push: (chunk: Buffer) => void; core: ReturnType<typeof createGuestAgentCore> } | null = null

  const connect = (socketPath: string): Duplex => {
    connectedPaths.push(socketPath)
    const core = createGuestAgentCore(handlers)
    let handshaken = false
    let banner = ''
    const duplex = new Duplex({
      read() {
        // Data is pushed from the fake guest side as it becomes available.
      },
      write(chunk: Buffer, _encoding, callback) {
        if (!handshaken) {
          banner += chunk.toString('latin1')
          const newline = banner.indexOf('\n')
          if (newline !== -1) {
            handshakes.push(banner.slice(0, newline))
            handshaken = true
            duplex.push(Buffer.from('OK 5252\n'))
            const rest = banner.slice(newline + 1)
            if (rest.length > 0) feed(Buffer.from(rest, 'latin1'))
          }
          callback()
          return
        }
        feed(chunk)
        callback()
      },
    })
    const feed = (chunk: Buffer) => {
      core.handleChunk(chunk).then(
        (frames) => {
          for (const frame of frames) duplex.push(frame)
        },
        (error: unknown) => {
          duplex.destroy(error instanceof Error ? error : new Error(String(error)))
        },
      )
    }
    active = { push: (chunk) => duplex.push(chunk), core }
    return duplex
  }

  return {
    connect,
    handshakes,
    connectedPaths,
    pushEvent: (event) => {
      const connection = active
      if (!connection) throw new Error('no active fake vsock connection')
      connection.push(connection.core.encodeEvent(event))
    },
  }
}

const allPathsExist = () => true

function makePlan(options: { withOverlayCreate?: boolean } = {}): DeskLaunchPlan {
  return buildDeskLaunchPlan(
    {
      deskId: 'agent-1',
      kernelPath: '/images/vmlinux',
      baseImagePath: '/images/base.qcow2',
      overlayPath: '/images/overlays/agent-1.qcow2',
      vsockCid: 42,
    },
    {
      pathExists: options.withOverlayCreate
        ? (path) => path !== '/images/overlays/agent-1.qcow2'
        : allPathsExist,
      deviceExists: allPathsExist,
    },
  )
}

test('boots by creating the overlay, spawning the VMM, and handshaking the vsock socket', async () => {
  const spawned: { command: string; args: readonly string[] }[] = []
  const children: FakeChild[] = [
    fakeChild({ exitImmediately: true }),
    fakeChild({ exitOnKill: true }),
  ]
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: (command, args) => {
      spawned.push({ command, args })
      const child = children.shift()
      assert.ok(child)
      return child
    },
    connect: vsock.connect,
    connectTimeoutMs: 1_000,
    connectRetryDelayMs: 1,
  })

  const machine = await backend.boot(makePlan({ withOverlayCreate: true }))
  assert.equal(spawned.length, 2)
  assert.equal(spawned[0]?.command, '/usr/bin/qemu-img')
  assert.equal(spawned[1]?.command, '/usr/bin/cloud-hypervisor')
  assert.deepEqual(vsock.handshakes, ['CONNECT 5252'])
  assert.deepEqual(vsock.connectedPaths, ['/run/appkit-desk/desk-agent-1.vsock'])

  const result = await machine.request({ op: 'exec', command: '/usr/bin/uname' })
  assert.deepEqual(result, {
    exitCode: 0,
    signal: null,
    stdout: 'ran /usr/bin/uname',
    stderr: '',
    truncated: false,
  })
  await machine.shutdown()
})

test('guest-reported errors reject the request without dropping the connection', async () => {
  const vsock = fakeVsock({
    ...guestHandlers,
    clipboardRead: async () => {
      throw new Error('no clipboard manager')
    },
  })
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
  })
  const machine = await backend.boot(makePlan())

  await assert.rejects(machine.request({ op: 'clipboard-read' }), /no clipboard manager/)
  assert.deepEqual(await machine.request({ op: 'ping' }), { pong: true })
  await machine.shutdown()
})

test('unsolicited guest events reach subscribers until they unsubscribe', async () => {
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
  })
  const machine = await backend.boot(makePlan())

  const seen: GuestEventMessage[] = []
  const unsubscribe = machine.subscribe((event) => {
    seen.push(event)
  })
  vsock.pushEvent({ event: 'job-exit', jobId: 'job-1', exitCode: 0, signal: null })
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], { event: 'job-exit', jobId: 'job-1', exitCode: 0, signal: null })

  unsubscribe()
  vsock.pushEvent({ event: 'job-exit', jobId: 'job-2', exitCode: 1, signal: null })
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
  assert.equal(seen.length, 1)
  await machine.shutdown()
})

test('shutdown terminates the VMM and fails all later requests', async () => {
  const child = fakeChild({ exitOnKill: true })
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => child,
    connect: vsock.connect,
    connectRetryDelayMs: 1,
  })
  const machine = await backend.boot(makePlan())

  await machine.shutdown()
  assert.deepEqual(child.killedWith, ['SIGTERM'])
  await assert.rejects(machine.request({ op: 'ping' }), /no longer connected/)
})

test('refuses to boot anywhere but Linux', async () => {
  const backend = createCloudHypervisorBackend({
    platform: 'darwin',
    launcher: () => fakeChild(),
    connect: fakeVsock(guestHandlers).connect,
  })
  await assert.rejects(backend.boot(makePlan()), /requires Linux/)
})

test('a failing overlay creation step fails the boot with its stderr', async () => {
  const failing = fakeChild()
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => failing,
    connect: fakeVsock(guestHandlers).connect,
  })
  const pending = backend.boot(makePlan({ withOverlayCreate: true }))
  queueMicrotask(() => failing.emit('exit', 1, null))
  await assert.rejects(pending, /overlay creation for desk agent-1 exited with code 1/)
})
