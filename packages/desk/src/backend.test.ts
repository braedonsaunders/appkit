import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { Duplex } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import {
  createCloudHypervisorBackend,
  DeskRequestFateUnknownError,
  type DeskConnectionChange,
} from './backend'
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
  videoStart: async () => undefined,
  videoStop: async () => undefined,
  handoverBegin: async () => ({ url: 'https://relay.example/session' }),
  handoverEnd: async () => undefined,
  capabilities: async () => ({ virtioGpu: false }),
}

interface FakeVsock {
  connect: (socketPath: string) => Duplex
  handshakes: string[]
  connectedPaths: string[]
  pushEvent: (event: GuestEventMessage) => void
  /** Kill the live connection the way a restarting guest agent would. */
  drop: () => Promise<void>
}

function fakeVsock(handlers: GuestAgentHandlers): FakeVsock {
  const handshakes: string[] = []
  const connectedPaths: string[] = []
  let active: { duplex: Duplex; core: ReturnType<typeof createGuestAgentCore> } | null = null

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
    active = { duplex, core }
    return duplex
  }

  return {
    connect,
    handshakes,
    connectedPaths,
    pushEvent: (event) => {
      const connection = active
      if (!connection) throw new Error('no active fake vsock connection')
      connection.duplex.push(connection.core.encodeEvent(event))
    },
    drop: async () => {
      const connection = active
      if (!connection) throw new Error('no active fake vsock connection')
      // Resolve only once the host has seen the close, so a test that acts
      // next is acting on a machine that already knows it is disconnected.
      await new Promise<void>((resolvePromise) => {
        connection.duplex.once('close', () => setImmediate(resolvePromise))
        connection.duplex.destroy()
      })
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
  assert.equal(spawned[0]?.command, 'cp')
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

test('a handshake nobody is behind is retried, not trusted', async () => {
  // Cloud Hypervisor answers CONNECT with OK even when the guest is still
  // booting and nothing is listening, then closes the socket a moment later.
  // Trusting that banner leaves a desk permanently dead with a healthy guest
  // behind it, so the first attempt here does exactly that and the backend
  // must move on rather than adopt the corpse.
  const real = fakeVsock(guestHandlers)
  let attempt = 0
  const connect = (socketPath: string): Duplex => {
    attempt += 1
    if (attempt === 1) {
      const hollow = new Duplex({
        read() {},
        write(chunk: Buffer, _encoding, callback) {
          // Answer the handshake, then close without a guest ever replying.
          if (chunk.toString('latin1').startsWith('CONNECT')) {
            hollow.push(Buffer.from('OK 1073741824\n', 'latin1'))
            setTimeout(() => hollow.destroy(), 5)
          }
          callback()
        },
      })
      return hollow
    }
    return real.connect(socketPath)
  }

  const backend = createCloudHypervisorBackend({
    launcher: () => fakeChild({ exitOnKill: true }),
    connect,
    platform: 'linux',
    connectTimeoutMs: 2_000,
    connectRetryDelayMs: 1,
    handshakeTimeoutMs: 200,
  })
  // The retry between the hollow attempt and the real one is an unref'd timer;
  // see holdLoopOpen for why waiting on one needs a ref'd handle of its own.
  const machine = await holdLoopOpen('the boot to retry past a hollow handshake', backend.boot(makePlan()))
  assert.ok(attempt >= 2, 'the hollow connection should have been retried')
  assert.deepEqual(await machine.request({ op: 'ping' }), { pong: true })
  await machine.shutdown()
})

/**
 * How long a wait may take before it is called a hang. Generous: it is a
 * deadlock detector, not a schedule the tests are held to.
 */
const WAIT_CEILING_MS = 30_000

/**
 * Await something only the package's own timers can advance.
 *
 * Every timer on the connect and reconnect path is deliberately unref'd — a
 * desk waiting to reach its guest must never hold the host process open. The
 * consequence for a TEST is that between two attempts nothing in the event
 * loop is ref'd at all, so node is free to drain it; node:test then reports
 * whatever the test is awaiting as "Promise resolution is still pending but
 * the event loop has already resolved" and cancels the rest of the FILE.
 * Whether that happens is decided by what else the runner happens to hold
 * open, which is why this file passed on Node 26 locally and aborted on Node
 * 22 in CI — and why it aborted at a different test each time.
 *
 * So a test that waits on those timers holds one ref'd handle of its own for
 * exactly as long as it waits. The same handle turns a wait that can never
 * end into a named failure instead of a silent hang, and it is always
 * cleared, so no wait here can outlive the test that started it.
 */
async function holdLoopOpen<T>(label: string, work: Promise<T>): Promise<T> {
  let guard: NodeJS.Timeout | undefined
  const stalled = new Promise<never>((_resolvePromise, rejectPromise) => {
    guard = setTimeout(() => {
      rejectPromise(new Error(`timed out waiting for ${label}`))
    }, WAIT_CEILING_MS)
  })
  try {
    return await Promise.race([work, stalled])
  } finally {
    clearTimeout(guard)
  }
}

interface ConnectionWatch {
  changes: DeskConnectionChange[]
  /**
   * The first change with this state, whenever it arrived — before this call
   * or after it. A promise is created only for an outcome a test actually
   * asks for, so no test ever leaves one behind that cannot settle.
   */
  waitFor: (state: DeskConnectionChange['state']) => Promise<DeskConnectionChange>
}

function watchConnection(machine: {
  onConnectionChange?: (listener: (change: DeskConnectionChange) => void) => () => void
}): ConnectionWatch {
  const changes: DeskConnectionChange[] = []
  const waiters: { state: DeskConnectionChange['state']; settle: (change: DeskConnectionChange) => void }[] = []
  assert.ok(machine.onConnectionChange, 'the default backend reports connection changes')
  machine.onConnectionChange((change) => {
    changes.push(change)
    for (const waiter of waiters.splice(0)) {
      if (waiter.state === change.state) waiter.settle(change)
      else waiters.push(waiter)
    }
  })
  return {
    changes,
    waitFor: (state) => {
      const already = changes.find((change) => change.state === state)
      if (already) return Promise.resolve(already)
      return holdLoopOpen(
        `a "${state}" connection change`,
        new Promise<DeskConnectionChange>((resolvePromise) => {
          waiters.push({ state, settle: resolvePromise })
        }),
      )
    },
  }
}

test('a connection lost mid-lease is re-established and the desk keeps working', async () => {
  // The whole point: a guest agent restart, a dropped bridge or a transient
  // vsock error must not cost the rest of the lease. The guest behind this
  // connection is fine; only the channel to it went away.
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 2_000,
  })
  const machine = await backend.boot(makePlan())
  assert.deepEqual(await machine.request({ op: 'ping' }), { pong: true })

  const watcher = watchConnection(machine)
  await vsock.drop()

  // A request that arrives DURING the reconnect waits for it rather than
  // being told the desk is gone.
  assert.deepEqual(await machine.request({ op: 'ping' }), { pong: true })
  const change = await watcher.waitFor('reconnected')
  assert.equal(change.state, 'reconnected')
  assert.equal(vsock.connectedPaths.length, 2)
  // And the replacement was proved with a ping, exactly as the first was.
  assert.deepEqual(vsock.handshakes, ['CONNECT 5252', 'CONNECT 5252'])
  await machine.shutdown()
})

test('a request in flight when the connection drops is told its fate is unknown', async () => {
  // The guest may already have run it — sent the mail, landed the click — so
  // it is neither retried nor reported as a plain failure.
  const vsock = fakeVsock({
    ...guestHandlers,
    exec: () => new Promise(() => undefined),
  })
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 2_000,
  })
  const machine = await backend.boot(makePlan())

  // Settled eagerly: the rejection arrives from a socket event, and a handler
  // attached later would make this an unhandled rejection first.
  const inFlight = machine
    .request({ op: 'exec', command: '/usr/bin/send-mail' })
    .then<unknown, unknown>(
      (result) => result,
      (error: unknown) => error,
    )
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
  await vsock.drop()

  const outcome = await inFlight
  assert.ok(outcome instanceof DeskRequestFateUnknownError)
  assert.match(outcome.message, /may or may not have run it/)
  // The desk itself is fine; only that one request is in doubt.
  assert.deepEqual(await machine.request({ op: 'ping' }), { pong: true })
  await machine.shutdown()
})

test('event subscribers keep receiving after a reconnect', async () => {
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 2_000,
  })
  const machine = await backend.boot(makePlan())
  const seen: GuestEventMessage[] = []
  machine.subscribe((event) => {
    seen.push(event)
  })

  const watcher = watchConnection(machine)
  await vsock.drop()
  await watcher.waitFor('reconnected')

  vsock.pushEvent({ event: 'job-exit', jobId: 'job-7', exitCode: 0, signal: null })
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
  assert.deepEqual(seen, [{ event: 'job-exit', jobId: 'job-7', exitCode: 0, signal: null }])
  await machine.shutdown()
})

test('shutdown is never followed by a reconnect', async () => {
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect: vsock.connect,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 2_000,
  })
  const machine = await backend.boot(makePlan())
  const watcher = watchConnection(machine)

  await machine.shutdown()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
  assert.equal(vsock.connectedPaths.length, 1)
  assert.deepEqual(watcher.changes, [])
  await assert.rejects(machine.request({ op: 'ping' }), /no longer connected/)
})

test('a desk whose VMM has exited is lost, not retried', async () => {
  // Reconnecting is only cheap because the VMM is still there. Once it is
  // gone the desk needs a fresh boot, and retrying against a corpse would
  // hide that for the whole reconnect window.
  const child = fakeChild()
  const vsock = fakeVsock(guestHandlers)
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => child,
    connect: vsock.connect,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 2_000,
  })
  const machine = await backend.boot(makePlan())
  const watcher = watchConnection(machine)

  child.emit('exit', 1, null)
  await vsock.drop()

  const change = await watcher.waitFor('lost')
  assert.equal(change.state, 'lost')
  assert.match(change.reason, /the VMM exited/)
  assert.equal(vsock.connectedPaths.length, 1)
  await assert.rejects(machine.request({ op: 'ping' }), /no longer connected/)
})

test('a reconnect gives up at its bound rather than spinning forever', async () => {
  // The bound is a deadline, so the CLOCK is what this test drives — not a
  // real window on a machine of unknown speed. The second failed attempt
  // moves time past the window, and the give-up is then exact: two attempts,
  // whether this runs on a quiet laptop or a loaded CI box.
  const vsock = fakeVsock(guestHandlers)
  const clock = { value: 1_000_000 }
  let reachable = true
  let attempts = 0
  const connect = (socketPath: string): Duplex => {
    if (reachable) return vsock.connect(socketPath)
    attempts += 1
    if (attempts === 2) clock.value += 5_000
    throw new Error('ENOENT: no such vsock socket')
  }
  const backend = createCloudHypervisorBackend({
    platform: 'linux',
    launcher: () => fakeChild({ exitOnKill: true }),
    connect,
    now: () => clock.value,
    connectRetryDelayMs: 1,
    reconnectRetryDelayMs: 1,
    reconnectWindowMs: 1_000,
  })
  const machine = await backend.boot(makePlan())
  const watcher = watchConnection(machine)

  reachable = false
  await vsock.drop()
  const change = await watcher.waitFor('lost')

  assert.match(change.reason, /could not get it back/)
  assert.equal(attempts, 2, 'it retried, and stopped the moment its window was gone')
  await assert.rejects(machine.request({ op: 'ping' }), /no longer connected/)
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
