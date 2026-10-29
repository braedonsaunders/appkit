import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertOverlayReflink,
  createDeskHost,
  verifyDeskHost,
  verifyOverlayReflink,
  type DeskHostOptions,
  type DeskStartOptions,
} from './host'
import type { DeskBackend, DeskConnectionChange, DeskMachine } from './backend'
import { DEFAULT_KERNEL_CMDLINE, type DeskLaunchPlan } from './plan'
import type { GuestCommand, GuestEventMessage } from './protocol'
import type { DeskAuditEntry, DeskEvent, DeskPorts, WindowInfo } from './events'

const focusedWindow: WindowInfo = { id: 'w1', title: 'Files', appId: 'org.xfce.Thunar' }

interface FakeMachine {
  machine: DeskMachine
  requests: GuestCommand[]
  emit: (event: GuestEventMessage) => void
  /** Drive the transport underneath the host, as the real backend does. */
  announce: (change: DeskConnectionChange) => void
  readonly shutdowns: number
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function nextTurn(): Promise<void> {
  return new Promise((resolvePromise) => setImmediate(resolvePromise))
}

function fakeMachine(deskId: string, shutdown?: () => Promise<void>): FakeMachine {
  const requests: GuestCommand[] = []
  const listeners = new Set<(event: GuestEventMessage) => void>()
  const watchers = new Set<(change: DeskConnectionChange) => void>()
  let jobCounter = 0
  let shutdowns = 0
  const machine: DeskMachine = {
    deskId,
    async request(command) {
      requests.push(command)
      switch (command.op) {
        case 'ping':
          return { pong: true }
        case 'capabilities':
          return { virtioGpu: true }
        case 'exec':
          return {
            exitCode: 0,
            signal: null,
            stdout: `ran ${command.command}`,
            stderr: '',
            truncated: false,
          }
        case 'job-start':
          jobCounter += 1
          return { jobId: `job-${jobCounter}` }
        case 'observe':
          return {
            png: Buffer.from('pixels').toString('base64'),
            width: 1280,
            height: 900,
            a11y: null,
            windows: [focusedWindow],
            focused: focusedWindow,
          }
        case 'handover-begin':
          return { url: 'https://relay.example/handover/1' }
        case 'clipboard-read':
          return { text: 'clipboard contents' }
        default:
          return {}
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onConnectionChange(listener) {
      watchers.add(listener)
      return () => {
        watchers.delete(listener)
      }
    },
    async shutdown() {
      shutdowns += 1
      await shutdown?.()
    },
  }
  return {
    machine,
    requests,
    emit: (event) => {
      for (const listener of [...listeners]) listener(event)
    },
    announce: (change) => {
      for (const watcher of [...watchers]) watcher(change)
    },
    get shutdowns() {
      return shutdowns
    },
  }
}

function fakeBackendFactory(options: {
  beforeBoot?: (plan: DeskLaunchPlan, index: number) => Promise<void>
  shutdown?: (plan: DeskLaunchPlan, index: number) => Promise<void>
} = {}) {
  const machines: FakeMachine[] = []
  const plans: DeskLaunchPlan[] = []
  const backend: DeskBackend = {
    async boot(plan) {
      plans.push(plan)
      const index = plans.length - 1
      await options.beforeBoot?.(plan, index)
      const machine = fakeMachine(plan.deskId, () => options.shutdown?.(plan, index) ?? Promise.resolve())
      machines.push(machine)
      return machine.machine
    },
  }
  return { backend, machines, plans }
}

function makeHost(overrides: {
  capacity?: number
  idleSuspendMs?: number
  defaultLeaseMs?: number
  policy?: DeskPorts['policy']
  backend?: DeskBackend
  kernelCmdline?: string
  minFreeBytes?: number
  freeBytes?: (path: string) => Promise<number>
  trimOnSuspend?: boolean
} = {}) {
  const events: DeskEvent[] = []
  const audits: DeskAuditEntry[] = []
  const clock = { value: 1_000_000 }
  const factory = fakeBackendFactory()
  /** Every overlay path the host asked to reclaim, in order. */
  const removed: string[] = []
  const host = createDeskHost({
    imageRoot: '/images',
    backend: overrides.backend ?? factory.backend,
    ...(overrides.kernelCmdline === undefined ? {} : { kernelCmdline: overrides.kernelCmdline }),
    ports: {
      policy: overrides.policy,
      onEvent: (event) => {
        events.push(event)
      },
      audit: (entry) => {
        audits.push(entry)
      },
    },
    capacity: overrides.capacity,
    idleSuspendMs: overrides.idleSuspendMs,
    defaultLeaseMs: overrides.defaultLeaseMs,
    now: () => clock.value,
    pathExists: () => true,
    deviceExists: () => true,
    removeOverlay: async (path) => {
      removed.push(path)
    },
    ...(overrides.minFreeBytes === undefined ? {} : { minFreeBytes: overrides.minFreeBytes }),
    ...(overrides.freeBytes === undefined ? {} : { freeBytes: overrides.freeBytes }),
    ...(overrides.trimOnSuspend === undefined ? {} : { trimOnSuspend: overrides.trimOnSuspend }),
  })
  return { host, events, audits, clock, removed, ...factory }
}

function startOptions(deskId: string): DeskStartOptions {
  return {
    deskId,
    baseImage: '/images/base.qcow2',
    overlayPath: `/images/overlays/${deskId}.qcow2`,
  }
}

function kinds(events: DeskEvent[]): string[] {
  return events.map((event) => event.kind)
}

test('starts a desk, executes a command over the guest channel, and records it', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))

  const snapshot = await handle.exec({ command: '/usr/bin/uname', args: ['-a'] })
  assert.equal(snapshot.exitCode, 0)
  assert.equal(snapshot.stdout, 'ran /usr/bin/uname')
  assert.equal(snapshot.deskId, 'agent-1')

  assert.deepEqual(kinds(context.events), ['shell_command'])
  const event = context.events[0]
  assert.ok(event?.kind === 'shell_command')
  assert.equal(event.command, '/usr/bin/uname')
  assert.deepEqual(event.args, ['-a'])
  assert.equal(event.exitCode, 0)

  const stats = context.host.stats()
  assert.equal(stats.resident, 1)
  assert.equal(stats.queued, 0)
  assert.notEqual(stats.lastStartedAt, null)
})

test('starting a desk that is already resident returns the same handle without a second boot', async () => {
  const context = makeHost()
  const first = await context.host.start(startOptions('agent-1'))
  const second = await context.host.start(startOptions('agent-1'))
  assert.equal(first, second)
  assert.equal(context.plans.length, 1)
})

test('threads kernelCmdline from DeskHostOptions into the launch plan, defaulting when omitted', async () => {
  const withDefault = makeHost()
  await withDefault.host.start(startOptions('agent-1'))
  assert.equal(withDefault.plans[0]?.kernelCmdline, DEFAULT_KERNEL_CMDLINE)

  const withOverride = makeHost({ kernelCmdline: 'root=/dev/vda3 rw quiet' })
  await withOverride.host.start(startOptions('agent-1'))
  assert.equal(withOverride.plans[0]?.kernelCmdline, 'root=/dev/vda3 rw quiet')
})

test('uses per-desk kernel and initramfs without changing another desk', async () => {
  const context = makeHost()
  await context.host.start({ ...startOptions('split'), kernelPath: '/images/split/vmlinux', initramfsPath: '/images/split/initrd' })
  await context.host.start(startOptions('legacy'))
  assert.equal(context.plans[0]?.kernelPath, '/images/split/vmlinux')
  assert.equal(context.plans[0]?.initramfsPath, '/images/split/initrd')
  assert.equal(context.plans[1]?.kernelPath, '/images/vmlinux')
})

test('discovers a default initramfs installed after host construction', async () => {
  let installed = false
  const factory = fakeBackendFactory()
  const host = createDeskHost({
    imageRoot: '/images', backend: factory.backend,
    ports: { onEvent: () => {}, audit: () => {} },
    pathExists: (path) => path === '/images/initrd' ? installed : true,
    deviceExists: () => true,
  })
  installed = true
  await host.start(startOptions('agent-late-image'))
  assert.equal(factory.plans[0]?.initramfsPath, '/images/initrd')
  await host.shutdown('agent-late-image')
})

test('queues starts beyond the capacity cap and admits them FIFO as desks suspend', async () => {
  const context = makeHost({ capacity: 1 })
  await context.host.start(startOptions('agent-a'))
  const pendingB = context.host.start(startOptions('agent-b'))
  const pendingC = context.host.start(startOptions('agent-c'))

  const queuedStats = context.host.stats()
  assert.equal(queuedStats.resident, 1)
  assert.equal(queuedStats.queued, 2)
  assert.equal(queuedStats.capacity, 1)
  assert.equal(context.plans.length, 1)

  await context.host.suspend('agent-a')
  const handleB = await pendingB
  assert.equal(handleB.deskId, 'agent-b')
  assert.equal(context.host.stats().queued, 1)
  assert.deepEqual(context.plans.map((plan) => plan.deskId), ['agent-a', 'agent-b'])

  await context.host.suspend('agent-b')
  const handleC = await pendingC
  assert.equal(handleC.deskId, 'agent-c')
  assert.equal(context.host.stats().queued, 0)
})

test('suspends an idle desk on sweep and keep-alive jobs die with the lease', async () => {
  const context = makeHost({ idleSuspendMs: 1_000, defaultLeaseMs: 60_000 })
  const handle = await context.host.start(startOptions('agent-1'))

  const job = await handle.exec({ command: '/usr/bin/watcher', keepAlive: true })
  assert.equal(job.status, 'running')
  assert.equal(handle.jobs().length, 1)

  context.clock.value += 1_000
  assert.equal(await context.host.sweep(), 1)

  assert.equal(context.host.stats().resident, 0)
  assert.equal(context.host.stats().suspended, 1)
  assert.equal(context.machines[0]?.shutdowns, 1)
  assert.deepEqual(kinds(context.events), ['job_start', 'job_exit'])
  const exitEvent = context.events[1]
  assert.ok(exitEvent?.kind === 'job_exit')
  assert.equal(exitEvent.signal, 'SIGKILL')
  await assert.rejects(handle.exec({ command: '/bin/true' }), /not resident/)
})

test('renewing the lease and activity both defer the idle suspend', async () => {
  const context = makeHost({ idleSuspendMs: 1_000, defaultLeaseMs: 2_000 })
  const handle = await context.host.start(startOptions('agent-1'))

  context.clock.value += 900
  handle.renewLease(60_000)
  context.clock.value += 900
  assert.equal(await context.host.sweep(), 0)
  assert.equal(context.host.stats().resident, 1)

  context.clock.value += 200
  assert.equal(await context.host.sweep(), 1)
  assert.equal(context.host.stats().resident, 0)
})

test('an expired lease suspends the desk even when it stays active', async () => {
  const context = makeHost({ idleSuspendMs: 60_000, defaultLeaseMs: 1_000 })
  const handle = await context.host.start(startOptions('agent-1'))
  context.clock.value += 500
  await handle.exec({ command: '/bin/true' })
  context.clock.value += 500
  assert.equal(await context.host.sweep(), 1)
})

test('a suspended desk resumes from its stored options and old handles stay dead', async () => {
  const context = makeHost()
  const first = await context.host.start(startOptions('agent-1'))
  await context.host.suspend('agent-1')
  await assert.rejects(first.exec({ command: '/bin/true' }), /not resident/)

  const resumed = await context.host.resume('agent-1')
  assert.notEqual(resumed, first)
  const snapshot = await resumed.exec({ command: '/bin/true' })
  assert.equal(snapshot.exitCode, 0)
  assert.equal(context.plans.length, 2)
  assert.equal(context.plans[1]?.overlay.path, '/images/overlays/agent-1.qcow2')

  await assert.rejects(context.host.resume('agent-unknown'), /Unknown desk/)
})

test('concurrent starts for one desk coalesce into one boot and one handle', async () => {
  const bootEntered = deferred<void>()
  const releaseBoot = deferred<void>()
  const factory = fakeBackendFactory({
    async beforeBoot(_plan, index) {
      if (index !== 0) return
      bootEntered.resolve()
      await releaseBoot.promise
    },
  })
  const context = makeHost({ backend: factory.backend })

  const firstStart = context.host.start(startOptions('agent-1'))
  await bootEntered.promise
  const secondStart = context.host.start(startOptions('agent-1'))
  await nextTurn()

  assert.equal(factory.plans.length, 1, 'the second start must join the first transition')
  releaseBoot.resolve()
  const [first, second] = await Promise.all([firstStart, secondStart])
  assert.equal(first, second)
  assert.equal(factory.machines.length, 1)
})

test('concurrent resumes for one suspended desk coalesce into one boot and one handle', async () => {
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend })
  await context.host.start(startOptions('agent-1'))
  await context.host.suspend('agent-1')

  const [first, second] = await Promise.all([
    context.host.resume('agent-1'),
    context.host.resume('agent-1'),
  ])

  assert.equal(first, second)
  assert.equal(factory.plans.length, 2, 'initial boot plus exactly one resumed boot')
  assert.equal(factory.machines.length, 2)
})

test('connection-loss teardown finishes shutdown before a simultaneous resume boots', async () => {
  const shutdownEntered = deferred<void>()
  const releaseShutdown = deferred<void>()
  const factory = fakeBackendFactory({
    async shutdown(_plan, index) {
      if (index !== 0) return
      shutdownEntered.resolve()
      await releaseShutdown.promise
    },
  })
  const context = makeHost({ backend: factory.backend, trimOnSuspend: false })
  const original = await context.host.start(startOptions('agent-1'))
  const originalMachine = factory.machines[0]
  assert.ok(originalMachine)

  originalMachine.announce({
    state: 'lost',
    deskId: 'agent-1',
    reason: 'guest connection could not be recovered',
  })
  await shutdownEntered.promise

  const resumedPromise = context.host.resume('agent-1')
  await nextTurn()
  assert.equal(factory.plans.length, 1, 'no replacement may boot while the old VMM still runs')
  assert.equal(context.host.stats().suspended, 0, 'a running VMM is not yet suspended')

  releaseShutdown.resolve()
  const resumed = await resumedPromise
  assert.equal(factory.plans.length, 2)
  assert.equal(originalMachine.shutdowns, 1)
  assert.notEqual(resumed, original)
  assert.equal((await resumed.exec({ command: '/bin/true' })).exitCode, 0)
})

test('a reconnect is visible to an operator and ends the streams the guest lost', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  const machine = context.machines[0]
  assert.ok(machine)

  const iterator = screen.frames({ fps: 10 })[Symbol.asyncIterator]()
  machine.emit({
    event: 'frame',
    seq: 1,
    width: 800,
    height: 600,
    data: Buffer.from('one').toString('base64'),
    format: 'png',
  })
  await iterator.next()
  await screen.input.click(10, 10)

  machine.announce({
    state: 'reconnected',
    deskId: 'agent-1',
    reason: 'the guest agent connection closed on desk agent-1',
    downtimeMs: 1_200,
    reconnects: 1,
  })

  // Visible: a desk that flaps must be findable from stats alone.
  const stats = context.host.stats()
  assert.equal(stats.reconnects, 1)
  assert.equal(stats.lastReconnectDeskId, 'agent-1')
  assert.ok(stats.lastReconnectAt)
  assert.match(stats.lastError ?? '', /reconnected to its guest agent after 1200ms/)

  // The guest's capture did not come back with the channel, so the consumer
  // is told the stream is over instead of waiting on frames forever.
  assert.equal((await iterator.next()).done, true)
  // And the screen and pixel space it was aiming in are no longer trusted.
  await assert.rejects(screen.input.click(10, 10), /no screen running/)
  // The compositor is not assumed to have survived the guest-agent restart.
  // A fresh start must reach the guest rather than return the stale handle
  // forever, while keeping that handle stable for existing consumers.
  assert.equal(handle.screen.running, false)
  const restarted = await handle.screen.start({ width: 1280, height: 900 })
  assert.equal(restarted, screen)
  assert.equal(handle.screen.running, true)
  assert.deepEqual(
    machine.requests.filter((request) => request.op === 'screen-start').map((request) => request.op),
    ['screen-start', 'screen-start'],
  )
  assert.equal((await restarted.observe()).width, 1280)
  // The desk itself is still usable, which is the entire point.
  assert.equal((await handle.exec({ command: '/bin/true' })).exitCode, 0)
})

test('a desk whose guest is lost for good is retired so the next resume boots a fresh one', async () => {
  const context = makeHost({ capacity: 1 })
  const handle = await context.host.start(startOptions('agent-1'))
  const machine = context.machines[0]
  assert.ok(machine)

  machine.announce({
    state: 'lost',
    deskId: 'agent-1',
    reason: 'Desk agent-1 lost its guest agent connection and could not get it back: timed out',
  })
  await new Promise((resolvePromise) => setImmediate(resolvePromise))

  // Left resident it would answer every call for the rest of the lease with
  // "no longer connected", and resume() would hand back the same dead handle.
  assert.equal(machine.shutdowns, 1)
  assert.equal(context.host.stats().resident, 0)
  assert.match(context.host.stats().lastError ?? '', /could not get it back/)
  await assert.rejects(handle.exec({ command: '/bin/true' }), /not resident/)

  const resumed = await context.host.resume('agent-1')
  assert.equal(context.machines.length, 2)
  assert.equal((await resumed.exec({ command: '/bin/true' })).exitCode, 0)
})

test('a boot failure surfaces in stats and releases the capacity slot', async () => {
  const failingBackend: DeskBackend = {
    async boot() {
      throw new Error('KVM ioctl failed')
    },
  }
  const context = makeHost({ backend: failingBackend, capacity: 1 })
  await assert.rejects(context.host.start(startOptions('agent-1')), /KVM ioctl failed/)
  const stats = context.host.stats()
  assert.equal(stats.resident, 0)
  assert.match(stats.lastError ?? '', /KVM ioctl failed/)
})

test('the screen opens and closes as a service on the running machine', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  assert.equal(handle.screen.running, false)

  await handle.screen.start({ width: 1280, height: 900 })
  assert.equal(handle.screen.running, true)
  await handle.screen.stop()
  assert.equal(handle.screen.running, false)

  assert.deepEqual(kinds(context.events), ['screen_open', 'screen_close'])
  const requestOps = context.machines[0]?.requests.map((request) => request.op)
  assert.deepEqual(requestOps, ['screen-start', 'screen-stop'])
})

test('coordinate input is enforced against the pixel space of the most recent view', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })

  await assert.rejects(screen.input.click(10, 20), /frame of reference/)

  const observation = await screen.observe()
  assert.equal(observation.width, 1280)
  assert.equal(observation.height, 900)
  assert.deepEqual(observation.png, Buffer.from('pixels'))

  await screen.input.click(1279, 899, 'left', 2)
  await assert.rejects(screen.input.click(1280, 899), /outside the most recent view/)
  await assert.rejects(screen.input.move(10, 900), /outside the most recent view/)
  await assert.rejects(screen.input.drag({ x: 5, y: 5 }, { x: 6, y: 1200 }), /outside/)

  const clickEvent = context.events.find((event) => event.kind === 'click')
  assert.ok(clickEvent?.kind === 'click')
  assert.equal(clickEvent.x, 1279)
  assert.equal(clickEvent.y, 899)
  assert.equal(clickEvent.clicks, 2)
  const clickRequest = context.machines[0]?.requests.find(
    (request) => request.op === 'input' && request.input.type === 'click',
  )
  assert.deepEqual(clickRequest, {
    op: 'input',
    input: { type: 'click', x: 1279, y: 899, button: 'left', clicks: 2 },
  })
})

test('input injected during a handover reaches the guest but never the recorded events', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  await screen.observe()

  const { url } = await screen.handover.begin({ ttlMs: 60_000, actor: 'operator@example.com' })
  assert.equal(url, 'https://relay.example/handover/1')
  assert.equal(screen.handover.active, true)

  await screen.input.type('hunter2-super-secret')
  await screen.input.key('Enter')
  await screen.input.click(10, 10)
  await screen.launch('org.mozilla.firefox')
  await assert.rejects(screen.clipboard.read(), /masked while a handover is active/)

  context.clock.value += 2_000
  await screen.handover.end()
  assert.equal(screen.handover.active, false)

  // The guest received every injected event; the transport is not the mask.
  const inputOps = context.machines[0]?.requests.filter((request) => request.op === 'input') ?? []
  assert.equal(inputOps.length, 3)

  // The recording port saw only the boundaries — no keystrokes, no clicks.
  const recorded = kinds(context.events)
  assert.deepEqual(
    recorded.filter((kind) => kind !== 'window_focus' && kind !== 'screen_open'),
    ['handover_begin', 'handover_end'],
  )
  assert.ok(!JSON.stringify(context.events).includes('hunter2'))

  // The audit port carries actor and duration, nothing else.
  assert.deepEqual(context.audits.map((entry) => entry.kind), ['handover_begin', 'handover_end'])
  const end = context.audits[1]
  assert.ok(end?.kind === 'handover_end')
  assert.equal(end.actor, 'operator@example.com')
  assert.equal(end.durationMs, 2_000)
  assert.equal(end.reason, 'ended')

  // After the handover ends, recording resumes.
  await screen.input.type('back to work')
  assert.ok(kinds(context.events).includes('type'))
})

test('a delivered frame anchors coordinates, so a viewer can click what it is shown', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })

  // Nothing has been shown yet, so there is no pixel space to aim in.
  await assert.rejects(screen.input.click(10, 10), /frame of reference/)

  // Watching frames is the other way to be shown the screen — and a live
  // viewer is shown frames, never observe(). One frame anchors the space.
  const iterator = screen.frames({ fps: 10 })[Symbol.asyncIterator]()
  const machine = context.machines[0]
  assert.ok(machine)
  machine.emit({ event: 'frame', seq: 1, width: 800, height: 600, data: Buffer.from('one').toString('base64'), format: 'png' })
  await iterator.next()

  await screen.input.click(10, 10)
  // And it is the frame's bounds that are enforced, not the screen's.
  await assert.rejects(screen.input.click(900, 10), /outside the most recent view/)
})

test('a lossy frame carries its format and anchors coordinates exactly as a lossless one does', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })

  const iterator = screen.frames({ fps: 30, format: 'jpeg' })[Symbol.asyncIterator]()
  const machine = context.machines[0]
  assert.ok(machine)

  // The request the guest sees carries the asked-for format.
  const started = machine.requests.find((request) => request.op === 'frames-start')
  assert.ok(started?.op === 'frames-start')
  assert.equal(started.format, 'jpeg')

  machine.emit({
    event: 'frame',
    seq: 1,
    width: 800,
    height: 600,
    data: Buffer.from('one').toString('base64'),
    format: 'jpeg',
  })
  const first = await iterator.next()
  assert.equal(first.value?.format, 'jpeg')

  // Lossy pixels are still a true-size view of the screen, so they anchor.
  await screen.input.click(10, 10)
  await assert.rejects(screen.input.click(900, 10), /outside the most recent view/)
})

test('a video chunk anchors coordinates, so a viewer driving by video can click what it sees', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })

  // Nothing has been shown yet, so there is no pixel space to aim in.
  await assert.rejects(screen.input.click(10, 10), /frame of reference/)

  const iterator = screen.video({ fps: 30 })[Symbol.asyncIterator]()
  const machine = context.machines[0]
  assert.ok(machine)
  const started = machine.requests.find((request) => request.op === 'video-start')
  assert.ok(started?.op === 'video-start')
  assert.equal(started.fps, 30)

  machine.emit({
    event: 'video-chunk',
    seq: 1,
    kind: 'init',
    codec: 'avc1.42C020',
    width: 800,
    height: 600,
    keyframe: false,
    data: Buffer.from('ftypmoov').toString('base64'),
  })
  const first = await iterator.next()
  assert.equal(first.value?.kind, 'init')
  assert.equal(first.value?.codec, 'avc1.42C020')

  // The stream's own dimensions are the space a click is aimed in — the same
  // contract observe() and frames() carry, and the reason a video viewer is
  // not refused for never having observed.
  await screen.input.click(10, 10)
  await assert.rejects(screen.input.click(900, 10), /outside the most recent view/)

  // A resolution change re-asserts the anchor rather than leaving the old one.
  machine.emit({
    event: 'video-chunk',
    seq: 2,
    kind: 'media',
    codec: 'avc1.42C020',
    width: 1280,
    height: 900,
    keyframe: true,
    data: Buffer.from('moofmdat').toString('base64'),
  })
  const second = await iterator.next()
  assert.equal(second.value?.keyframe, true)
  await screen.input.click(900, 10)
})

test('video is not emitted to a recording consumer while a handover is active', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  await screen.observe()

  const iterator = screen.video({ fps: 30 })[Symbol.asyncIterator]()
  const machine = context.machines[0]
  assert.ok(machine)
  const chunk = (seq: number): GuestEventMessage => ({
    event: 'video-chunk',
    seq,
    kind: 'media',
    codec: 'avc1.42C020',
    width: 1280,
    height: 900,
    keyframe: true,
    data: Buffer.from(`chunk-${seq}`).toString('base64'),
  })

  machine.emit(chunk(1))
  const first = await iterator.next()
  assert.equal(first.value?.seq, 1)

  await screen.handover.begin({ ttlMs: 60_000 })
  machine.emit(chunk(2))
  await screen.handover.end()
  machine.emit(chunk(3))

  const second = await iterator.next()
  // Chunk 2 fell inside the handover and was never delivered.
  assert.equal(second.value?.seq, 3)

  // Ending the stream tells the guest to stop encoding, rather than leaving an
  // encoder running for nobody.
  await iterator.return?.()
  assert.ok(machine.requests.some((request) => request.op === 'video-stop'))
})

test('frames are not emitted to a recording consumer while a handover is active', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  await screen.observe()

  const iterator = screen.frames({ fps: 10 })[Symbol.asyncIterator]()
  const machine = context.machines[0]
  assert.ok(machine)

  machine.emit({ event: 'frame', seq: 1, width: 1280, height: 900, data: Buffer.from('one').toString('base64'), format: 'png' })
  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.equal(first.value?.seq, 1)

  await screen.handover.begin({ ttlMs: 60_000 })
  machine.emit({ event: 'frame', seq: 2, width: 1280, height: 900, data: Buffer.from('two').toString('base64'), format: 'png' })
  await screen.handover.end()
  machine.emit({ event: 'frame', seq: 3, width: 1280, height: 900, data: Buffer.from('three').toString('base64'), format: 'png' })

  const second = await iterator.next()
  assert.equal(second.done, false)
  // Frame 2 fell inside the handover and was never delivered.
  assert.equal(second.value?.seq, 3)
  await iterator.return?.()
})

test('a handover past its ttl is ended by the sweep and audited as expired', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  await screen.handover.begin({ ttlMs: 1_000, actor: 'operator@example.com' })

  context.clock.value += 1_001
  await context.host.sweep()

  assert.equal(screen.handover.active, false)
  const end = context.audits[1]
  assert.ok(end?.kind === 'handover_end')
  assert.equal(end.reason, 'expired')
  assert.equal(context.host.stats().resident, 1)
})

test('suspension revokes an active handover before the machine goes down', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const screen = await handle.screen.start({ width: 1280, height: 900 })
  await screen.handover.begin({ ttlMs: 60_000 })

  await context.host.suspend('agent-1')
  const end = context.audits[1]
  assert.ok(end?.kind === 'handover_end')
  assert.equal(end.reason, 'revoked')
  assert.ok(context.machines[0]?.requests.some((request) => request.op === 'handover-end'))
})

test('background jobs report their guest exit and leave the running list', async () => {
  const context = makeHost()
  const handle = await context.host.start(startOptions('agent-1'))
  const job = await handle.exec({ command: '/usr/bin/serve', args: ['--port', '8080'], keepAlive: true })
  assert.equal(handle.jobs().length, 1)

  context.machines[0]?.emit({ event: 'job-exit', jobId: job.jobId, exitCode: 0, signal: null })
  assert.equal(handle.jobs().length, 0)
  assert.deepEqual(kinds(context.events), ['job_start', 'job_exit'])
})

test('policy hooks deny execution, screens, and handovers before the guest is reached', async () => {
  const context = makeHost({
    policy: {
      allowExec: ({ command }) => command !== '/usr/bin/forbidden',
      allowScreen: () => false,
      allowHandover: () => false,
    },
  })
  const handle = await context.host.start(startOptions('agent-1'))

  await assert.rejects(handle.exec({ command: '/usr/bin/forbidden' }), /Policy denied exec/)
  await handle.exec({ command: '/usr/bin/allowed' })
  await assert.rejects(handle.screen.start({ width: 800, height: 600 }), /Policy denied opening a screen/)
  assert.ok(!context.machines[0]?.requests.some((request) => request.op === 'screen-start'))
})

test('verifyDeskHost reports capability booleans from a throwaway probe VM', async () => {
  const factory = fakeBackendFactory()
  const verification = await verifyDeskHost({
    kernelPath: '/images/vmlinux',
    baseImagePath: '/images/base.qcow2',
    scratchDir: '/scratch',
    backend: factory.backend,
    platform: 'linux',
    pathExists: () => true,
    deviceExists: () => true,
  })
  assert.deepEqual(verification, {
    supported: true,
    vmmPath: '/usr/bin/cloud-hypervisor',
    kvm: true,
    vsock: true,
    virtioGpu: true,
  })
  assert.equal(factory.machines[0]?.shutdowns, 1)
  assert.match(factory.plans[0]?.deskId ?? '', /^verify-/)
})

test('verifyDeskHost reports an absent KVM device without booting anything', async () => {
  const untouchableBackend: DeskBackend = {
    async boot() {
      throw new Error('should not boot')
    },
  }
  const verification = await verifyDeskHost({
    kernelPath: '/images/vmlinux',
    baseImagePath: '/images/base.qcow2',
    backend: untouchableBackend,
    platform: 'linux',
    pathExists: () => true,
    deviceExists: () => false,
  })
  assert.deepEqual(verification, {
    supported: false,
    vmmPath: '/usr/bin/cloud-hypervisor',
    kvm: false,
    vsock: false,
    virtioGpu: false,
  })
})

test('verifyDeskHost distinguishes an unreachable guest agent from an unusable host', async () => {
  const deafMachine: DeskMachine = {
    deskId: 'probe',
    async request() {
      throw new Error('vsock never answered')
    },
    subscribe: () => () => undefined,
    shutdown: async () => undefined,
  }
  const verification = await verifyDeskHost({
    kernelPath: '/images/vmlinux',
    baseImagePath: '/images/base.qcow2',
    scratchDir: '/scratch',
    backend: { boot: async () => deafMachine },
    platform: 'linux',
    pathExists: () => true,
    deviceExists: () => true,
  })
  assert.equal(verification.supported, false)
  assert.equal(verification.kvm, true)
  assert.equal(verification.vsock, false)
  assert.equal(verification.virtioGpu, false)
})

test('verifyDeskHost throws when the host itself is unusable', async () => {
  await assert.rejects(
    verifyDeskHost({
      kernelPath: '/images/vmlinux',
      baseImagePath: '/images/base.qcow2',
      platform: 'darwin',
      pathExists: () => true,
      deviceExists: () => true,
    }),
    /requires Linux/,
  )
  await assert.rejects(
    verifyDeskHost({
      kernelPath: '/images/vmlinux',
      baseImagePath: '/images/base.qcow2',
      platform: 'linux',
      pathExists: (path) => path !== '/usr/bin/cloud-hypervisor',
      deviceExists: () => true,
    }),
    /Cloud Hypervisor was not found/,
  )
  await assert.rejects(
    verifyDeskHost({
      kernelPath: '/images/vmlinux',
      baseImagePath: '/images/base.qcow2',
      scratchDir: '/scratch',
      backend: {
        async boot() {
          throw new Error('nested virtualization is disabled')
        },
      },
      platform: 'linux',
      pathExists: () => true,
      deviceExists: () => true,
    }),
    /could not boot a probe VM/,
  )
})

test('destroying a desk reclaims its overlay', async () => {
  const context = makeHost()
  await context.host.start(startOptions('agent-1'))

  await context.host.destroy('agent-1')

  assert.deepEqual(context.removed, ['/images/overlays/agent-1.qcow2'])
})

test('suspending a desk KEEPS its overlay, because the overlay is the suspended desk', async () => {
  const context = makeHost()
  await context.host.start(startOptions('agent-1'))

  await context.host.suspend('agent-1')
  assert.deepEqual(context.removed, [], 'suspend must never touch the disk')

  // And the desk is still resumable onto the very same disk.
  await context.host.resume('agent-1')
  assert.deepEqual(context.removed, [])
  assert.equal(context.plans.length, 2)
  assert.equal(context.plans[1]?.overlay.path, '/images/overlays/agent-1.qcow2')
})

test('the idle/lease sweep suspends without reclaiming any overlay', async () => {
  const context = makeHost({ idleSuspendMs: 1_000 })
  await context.host.start(startOptions('agent-1'))

  context.clock.value += 5_000
  const swept = await context.host.sweep()

  assert.equal(swept, 1)
  assert.deepEqual(context.removed, [], 'a swept desk is suspended, not destroyed')
})

test('destroy reclaims the overlay only after the machine has stopped', async () => {
  const context = makeHost()
  await context.host.start(startOptions('agent-1'))
  const machine = context.machines[0]
  assert.ok(machine)

  await context.host.destroy('agent-1')

  // Unlinking under a live VMM would leave the guest writing an orphaned
  // inode, so the shutdown must have happened before the reclaim.
  assert.equal(machine.shutdowns, 1)
  assert.deepEqual(context.removed, ['/images/overlays/agent-1.qcow2'])
})

test('destroying an unknown desk reclaims nothing', async () => {
  const context = makeHost()
  await context.host.destroy('never-existed')
  assert.deepEqual(context.removed, [])
})

test('a desk is refused when the overlay filesystem is below its headroom floor', async () => {
  const context = makeHost({
    minFreeBytes: 10_000_000_000,
    freeBytes: async () => 1_000_000_000,
  })

  await assert.rejects(
    () => context.host.start(startOptions('agent-1')),
    /below the 10000000000-byte floor/,
  )
  // Refused before anything booted: no plan, no VM, no half-made overlay.
  assert.equal(context.plans.length, 0)
})

test('a desk is admitted when the overlay filesystem has headroom', async () => {
  const context = makeHost({
    minFreeBytes: 1_000_000_000,
    freeBytes: async () => 40_000_000_000,
  })

  await context.host.start(startOptions('agent-1'))
  assert.equal(context.plans.length, 1)
})

test('an unreadable filesystem fails the free-space check OPEN rather than refusing the desk', async () => {
  const context = makeHost({
    minFreeBytes: 1_000_000_000,
    freeBytes: async () => {
      throw new Error('statfs exploded')
    },
  })

  await context.host.start(startOptions('agent-1'))
  assert.equal(context.plans.length, 1)
  assert.match(String(context.host.stats().lastError), /statfs exploded/)
})

test('a failed unlink still drops the record and is reported rather than thrown', async () => {
  const events: DeskEvent[] = []
  const factory = fakeBackendFactory()
  const host = createDeskHost({
    imageRoot: '/images',
    backend: factory.backend,
    ports: { onEvent: (event) => events.push(event), audit: () => undefined },
    pathExists: () => true,
    deviceExists: () => true,
    removeOverlay: async () => {
      throw new Error('device or resource busy')
    },
  })
  await host.start(startOptions('agent-1'))

  await host.destroy('agent-1')

  assert.match(String(host.stats().lastError), /Overlay was not reclaimed for agent-1/)
  // The desk is gone from the ledger even though its file survived, so it
  // cannot be leased again while a stale disk sits there.
  await assert.rejects(() => host.resume('agent-1'), /Unknown desk/)
})

test('the reflink probe reports support when cp --reflink=always succeeds', async () => {
  const attempts: Array<[string, string]> = []
  const check = await verifyOverlayReflink({
    overlayDirectory: tmpdir(),
    idFactory: () => 'probe',
    copy: async (source, destination) => {
      attempts.push([source, destination])
    },
  })

  assert.equal(check.supported, true)
  assert.equal(attempts.length, 1)
  assert.match(String(attempts[0]?.[0]), /\.reflink-probe-probe$/)
})

test('the reflink probe reports NO support when cp refuses to clone, carrying the reason', async () => {
  const check = await verifyOverlayReflink({
    overlayDirectory: tmpdir(),
    idFactory: () => 'probe',
    copy: async () => {
      throw new Error('failed to clone: Operation not supported')
    },
  })

  assert.equal(check.supported, false)
  assert.match(check.detail, /Operation not supported/)
})

test('the reflink probe cleans up both of its files whichever way it goes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reflink-'))
  try {
    await verifyOverlayReflink({
      overlayDirectory: directory,
      idFactory: () => 'probe',
      copy: async (_source, destination) => {
        await writeFile(destination, 'clone')
      },
    })
    assert.deepEqual(await readdir(directory), [], 'probe files must not be left behind')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('asserting reflink support throws loudly, naming the cost, on a filesystem without it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reflink-'))
  try {
    await assert.rejects(
      () =>
        assertOverlayReflink({
          overlayDirectory: directory,
          idFactory: () => 'probe',
          copy: async () => {
            throw new Error('Operation not supported')
          },
        }),
      process.platform === 'darwin' ? /does not support cloning/ : /FULL-COPY the base image/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('asserting reflink support passes through the check on a filesystem with it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reflink-'))
  try {
    const check = await assertOverlayReflink({
      overlayDirectory: directory,
      idFactory: () => 'probe',
      copy: async () => undefined,
    })
    assert.equal(check.supported, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('an unwritable overlay directory is reported as a broken deployment, not as a missing reflink', async () => {
  await assert.rejects(
    () =>
      verifyOverlayReflink({
        overlayDirectory: '/definitely/not/a/real/directory',
        idFactory: () => 'probe',
        copy: async () => undefined,
      }),
    /could not be written to, so reflink support could not be determined/,
  )
})

test('end to end on a real filesystem: suspend preserves the overlay and its contents, destroy unlinks it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desk-overlays-'))
  const overlayPath = join(directory, 'agent-1.raw')
  try {
    const factory = fakeBackendFactory()
    // No removeOverlay override: this exercises the real rm() the host ships with.
    const host = createDeskHost({
      imageRoot: '/images',
      backend: factory.backend,
      ports: { onEvent: () => undefined, audit: () => undefined },
      pathExists: () => true,
      deviceExists: () => true,
    })
    const options: DeskStartOptions = {
      deskId: 'agent-1',
      baseImage: '/images/base.raw',
      overlayPath,
    }
    // Stand in for the disk a booted desk would have written.
    await writeFile(overlayPath, 'the desk’s persistent state')

    await host.start(options)
    await host.suspend('agent-1')
    assert.equal(
      await readFile(overlayPath, 'utf8'),
      'the desk’s persistent state',
      'a suspended desk must come back to the same disk, byte for byte',
    )

    await host.resume('agent-1')
    assert.equal(await readFile(overlayPath, 'utf8'), 'the desk’s persistent state')

    await host.destroy('agent-1')
    assert.deepEqual(await readdir(directory), [], 'destroy must leave nothing behind')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a desk is trimmed in the guest just before it suspends, so freed blocks go back to the host', async () => {
  const context = makeHost()
  await context.host.start(startOptions('agent-1'))
  const machine = context.machines[0]
  assert.ok(machine)

  await context.host.suspend('agent-1')

  const trim = machine.requests.find((request) => request.op === 'exec')
  assert.ok(trim?.op === 'exec', 'suspend must ask the guest to trim')
  assert.equal(trim.command, '/usr/sbin/fstrim')
  assert.deepEqual(trim.args, ['/'])
  // Trim while the guest is still there to answer, not after it is gone.
  assert.equal(machine.shutdowns, 1)
})

test('the sweep trims too, since an idle-suspended desk is the common way a desk parks', async () => {
  const context = makeHost({ idleSuspendMs: 1_000 })
  await context.host.start(startOptions('agent-1'))
  const machine = context.machines[0]
  assert.ok(machine)

  context.clock.value += 5_000
  await context.host.sweep()

  assert.ok(machine.requests.some((request) => request.op === 'exec'))
})

test('a guest that cannot be trimmed still suspends promptly, with the failure reported', async () => {
  const factory = fakeBackendFactory()
  const failing: DeskBackend = {
    async boot(plan) {
      const machine = await factory.backend.boot(plan)
      return {
        ...machine,
        async request(command) {
          if (command.op === 'exec') throw new Error('guest is wedged')
          return machine.request(command)
        },
      }
    },
  }
  const context = makeHost({ backend: failing })
  await context.host.start(startOptions('agent-1'))

  await context.host.suspend('agent-1')

  assert.match(String(context.host.stats().lastError), /Trim before suspend failed for agent-1/)
  assert.equal(context.host.stats().resident, 0, 'the desk must still have suspended')
})

test('trimming can be turned off for a guest that has no fstrim', async () => {
  const context = makeHost({ trimOnSuspend: false })
  await context.host.start(startOptions('agent-1'))
  const machine = context.machines[0]
  assert.ok(machine)

  await context.host.suspend('agent-1')

  assert.equal(machine.requests.some((request) => request.op === 'exec'), false)
})

// --- parking with memory, and the one rule that makes it safe ----------------
//
// Parking used to mean `machine.shutdown()`: the VM stopped and only the disk
// survived. Nothing inside the guest lived between runs, so an agent that
// installed a daemon and believed it was watching something continuously was
// wrong about its own machine, and the cold boot on every scheduled occurrence
// was — from inside the guest — indistinguishable from a failing host.
//
// A memory snapshot fixes that and introduces one hazard: the image is valid
// only against the disk it was taken with. Every test below exists to pin the
// handling of that hazard rather than the happy path.

/** A host with snapshot parking on, and full visibility of the snapshot files. */
function makeParkingHost(
  options: {
    snapshotExists?: boolean
    park?: () => Promise<void>
    hookSupport?: boolean
    host?: Pick<DeskHostOptions, 'readSnapshotShares' | 'isDirectory'>
  } = {},
) {
  let shutdowns = 0
  const made: string[] = []
  const removedSnapshots: string[] = []
  const parked: string[] = []
  const synced: string[] = []
  const plans: DeskLaunchPlan[] = []
  const audits: DeskAuditEntry[] = []
  let snapshotExists = options.snapshotExists ?? false

  const backend: DeskBackend = {
    async boot(plan, hooks) {
      plans.push(plan)
      if (plan.snapshot.restoring) {
        // The real backend calls this while the guest is restored and PAUSED.
        await hooks?.onRestored?.()
      }
      const fake = fakeMachine(plan.deskId, async () => {
        shutdowns += 1
      })
      const machine = fake.machine
      return {
        ...machine,
        ...(options.hookSupport ? { supportsPausedParkHook: true as const } : {}),
        async request(command: Parameters<typeof machine.request>[0]) {
          if ((command as { command?: string }).command === 'sync') synced.push(plan.deskId)
          return machine.request(command)
        },
        async park(dir: string, hooks?: import('./backend').DeskParkHooks) {
          if (options.park) await options.park()
          await hooks?.onPaused?.()
          parked.push(dir)
        },
      }
    },
  }

  const clock = { value: 1_000_000 }
  const host = createDeskHost({
    imageRoot: '/images',
    backend,
    parkWithMemory: true,
    cpuSignature: async () => 'cpu',
    readSnapshotSignature: async () => 'cpu',
    writeSnapshotSignature: async () => {},
    ports: { onEvent: () => {}, audit: (entry) => audits.push(entry) },
    now: () => clock.value,
    // Everything exists except the snapshot, which the test controls.
    pathExists: (path) => (path.endsWith('.snapshot') ? snapshotExists : true),
    deviceExists: () => true,
    removeOverlay: async () => {},
    makeSnapshotDir: async (path) => {
      made.push(path)
      snapshotExists = true
    },
    removeSnapshot: async (path) => {
      removedSnapshots.push(path)
      snapshotExists = false
    },
    trimOnSuspend: false,
    ...options.host,
  })
  return {
    host,
    clock,
    plans,
    audits,
    made,
    removedSnapshots,
    parked,
    synced,
    hasSnapshot: () => snapshotExists,
    shutdowns: () => shutdowns,
  }
}

test('explicit suspend prepares only on a capable backend after sync', async () => {
  const context = makeParkingHost({ hookSupport: true })
  await context.host.start(startOptions('agent-park'))
  const steps: string[] = []
  await context.host.suspend('agent-park', {
    beforePark: async () => { assert.deepEqual(context.synced, ['agent-park']); steps.push('prepare') },
    onPaused: async () => { steps.push('paused') },
  })
  assert.deepEqual(steps, ['prepare', 'paused'])
  const unsupported = makeParkingHost()
  await unsupported.host.start(startOptions('agent-park'))
  let error: unknown
  await unsupported.host.suspend('agent-park', { beforePark: async () => assert.fail('unsupported'), onPausedError: value => { error = value } })
  assert.match(String(error), /unavailable/)
  assert.equal(unsupported.parked.length, 1)
})

test('failed preparation skips paused hook but retains normal parking', async () => {
  const context = makeParkingHost({ hookSupport: true })
  await context.host.start(startOptions('agent-park'))
  let error: unknown
  await context.host.suspend('agent-park', { beforePark: async () => { throw new Error('prepare') }, onPaused: async () => assert.fail('unprepared'), onPausedError: value => { error = value } })
  assert.match(String(error), /prepare/)
  assert.equal(context.parked.length, 1)
})

test('parking a desk keeps its memory, and syncs the guest first', async () => {
  const context = makeParkingHost()
  await context.host.start(startOptions('agent-park'))
  await context.host.suspend('agent-park')

  assert.deepEqual(context.parked, ['/images/overlays/agent-park.snapshot'], 'the VM was parked, not shut down')
  assert.deepEqual(context.made, ['/images/overlays/agent-park.snapshot'], 'into a directory created for it')
  // A paused guest holds dirty pages that exist only in memory. Without this the
  // disk alone is mid-transaction, which matters on every discarded snapshot.
  assert.deepEqual(context.synced, ['agent-park'], 'the guest filesystem was flushed before it stopped')
})

test('resuming restores the snapshot and destroys it before the guest can write', async () => {
  const context = makeParkingHost({ snapshotExists: true })
  await context.host.start(startOptions('agent-resume'))

  const plan = context.plans[0]
  assert.ok(plan)
  assert.equal(plan.snapshot.restoring, true, 'the desk resumed rather than cold booted')
  assert.equal(plan.hypervisor, 'cloud-hypervisor')
  assert.ok(plan.vmm.args.includes('--restore'), 'with a restoring argv')
  assert.equal(plan.vmm.args.includes('--kernel'), false, 'and no kernel — the snapshot carries the config')
  // resume=false is the whole safety property: the guest comes back paused so
  // the snapshot can be destroyed while nothing is able to write.
  assert.ok(
    plan.vmm.args.some((arg) => arg.includes('resume=false')),
    'restored paused, not running',
  )
  assert.deepEqual(
    context.removedSnapshots,
    ['/images/overlays/agent-resume.snapshot'],
    'and the snapshot was destroyed during the boot, not after it',
  )
  assert.equal(context.hasSnapshot(), false, 'so no memory image outlives the disk it belongs to')
})

test('a snapshot that will not restore is discarded and the desk cold boots', async () => {
  // A snapshot that cannot come back is worse than none: it would make the desk
  // unbootable for as long as it sat there.
  const context = makeParkingHost({ snapshotExists: true })
  let attempt = 0
  const failing: DeskBackend = {
    async boot(plan, hooks) {
      attempt += 1
      context.plans.push(plan)
      if (plan.snapshot.restoring) throw new Error('snapshot is corrupt')
      await hooks?.onRestored?.()
      return fakeMachine(plan.deskId, () => Promise.resolve()).machine
    },
  }
  const host = createDeskHost({
    imageRoot: '/images',
    backend: failing,
    parkWithMemory: true,
    ports: { onEvent: () => {}, audit: () => {} },
    pathExists: () => true,
    deviceExists: () => true,
    removeOverlay: async () => {},
    removeSnapshot: async (path) => {
      context.removedSnapshots.push(path)
    },
    trimOnSuspend: false,
  })

  const handle = await host.start(startOptions('agent-bad-snap'))
  assert.equal(attempt, 2, 'the restore was tried, then a cold boot')
  assert.ok(
    context.removedSnapshots.includes('/images/overlays/agent-bad-snap.snapshot'),
    'the unusable snapshot was removed rather than left to fail again',
  )
  // The desk is genuinely usable, not merely booted.
  const ran = await handle.exec({ command: '/bin/true', args: [] })
  assert.equal(ran.exitCode, 0)
  // Discarding is safe precisely because a failed restore never ran the guest,
  // so the disk is still as the pre-park sync left it.
  assert.equal(host.stats().lastError?.includes('cold booted'), true, 'and it said so')
})

test('a destroyed desk takes its snapshot with it', async () => {
  // The worst state this feature can produce: a snapshot outliving its overlay.
  // The next desk under that id gets a FRESH disk and would restore a previous
  // desk's RAM on top of it.
  const context = makeParkingHost()
  await context.host.start(startOptions('agent-gone'))
  await context.host.destroy('agent-gone')

  assert.ok(
    context.removedSnapshots.includes('/images/overlays/agent-gone.snapshot'),
    'destroy reclaims the snapshot alongside the overlay',
  )
})

test('shutdown restarts a desk cold: synced and stopped, never parked, overlay kept', async () => {
  const context = makeParkingHost()
  await context.host.start(startOptions('agent-restart'))
  await context.host.shutdown('agent-restart')

  assert.deepEqual(context.parked, [], 'no memory image was written')
  assert.equal(context.shutdowns(), 1, 'the VM was shut down')
  assert.deepEqual(context.synced, ['agent-restart'], 'after flushing the guest, since the disk is all that remains')
  assert.equal(context.hasSnapshot(), false)

  // The desk is still known and resumable: a restart, not a destroy.
  await context.host.resume('agent-restart')
  assert.equal(context.plans.at(-1)?.snapshot.restoring, false, 'and it comes back from a cold boot')
})

test('shutdown discards a parked desk\'s memory so its next resume cold boots', async () => {
  const context = makeParkingHost()
  await context.host.start(startOptions('agent-parked'))
  await context.host.suspend('agent-parked')
  assert.equal(context.hasSnapshot(), true, 'parked with memory first')

  await context.host.shutdown('agent-parked')
  assert.ok(context.removedSnapshots.includes('/images/overlays/agent-parked.snapshot'))
  assert.equal(context.hasSnapshot(), false)

  await context.host.resume('agent-parked')
  assert.equal(context.plans.at(-1)?.snapshot.restoring, false, 'the next boot is cold')
  await context.host.shutdown('never-started')
})

test('parking stays off unless a deployment asks for it', async () => {
  // Turning it on costs a snapshot the size of guest RAM per parked desk, so the
  // library default must not change behaviour for a host that has not sized for
  // it — the old shutdown path is still exactly what happens.
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend })
  await context.host.start(startOptions('agent-plain'))
  await context.host.suspend('agent-plain')

  const machine = factory.machines[0]
  assert.ok(machine)
  assert.equal(machine.shutdowns, 1, 'the default is still a shutdown')
})

test('CPU incompatibility detection is specific', async () => {
  const { isIncompatibleCpuSnapshotError } = await import('./host')
  assert.equal(isIncompatibleCpuSnapshotError(new Error('Detected incompatible CPUID entry')), true)
  assert.equal(isIncompatibleCpuSnapshotError(new Error('CPUID unavailable')), false)
})

test('CPU signature mismatch skips restore and emits a typed fallback', async () => {
  const factory = fakeBackendFactory()
  const events: DeskEvent[] = []
  const removed: string[] = []
  const host = createDeskHost({ imageRoot: '/images', backend: factory.backend, parkWithMemory: true,
    ports: { onEvent: (event) => events.push(event), audit: () => {} },
    pathExists: () => true, deviceExists: () => true, trimOnSuspend: false,
    readSnapshotSignature: async () => 'old', cpuSignature: async () => 'new',
    removeSnapshot: async (path) => { removed.push(path) },
  })
  await host.start(startOptions('cpu-test'))
  assert.equal(factory.plans.length, 1)
  assert.equal(factory.plans[0]?.snapshot.restoring, false)
  assert.equal(removed.length, 1)
  assert.equal(host.stats().snapshotCpuFallbacks, 1)
  assert.equal(host.stats().lastError, null)
  assert.ok(events.some((event) => event.kind === 'snapshot_cpu_fallback' && event.reason === 'signature_mismatch'))
  await host.suspend('cpu-test')
})

test('a CPUID restore failure cold boots and does not set lastError', async () => {
  const plans: DeskLaunchPlan[] = []
  const host = createDeskHost({ imageRoot: '/images', parkWithMemory: true,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: () => true, deviceExists: () => true,
    readSnapshotSignature: async () => null, removeSnapshot: async () => {}, trimOnSuspend: false,
    backend: { async boot(plan) { plans.push(plan); if (plan.snapshot.restoring) throw new Error('Detected incompatible CPUID entry'); return fakeMachine(plan.deskId).machine } },
  })
  await host.start(startOptions('cpu-failure'))
  assert.deepEqual(plans.map((plan) => plan.snapshot.restoring), [true, false])
  assert.equal(host.stats().lastSnapshotCpuFallback?.reason, 'incompatible_cpuid')
  assert.equal(host.stats().lastError, null)
  await host.suspend('cpu-failure')
})

test('guest TCP streams use the assigned address and close on suspend', async () => {
  const { PassThrough } = await import('node:stream')
  const factory = fakeBackendFactory()
  const stream = new PassThrough()
  const calls: Array<[string, number]> = []
  const host = createDeskHost({ imageRoot: '/images', backend: factory.backend, ports: { onEvent: () => {}, audit: () => {} },
    pathExists: () => true, deviceExists: () => true, trimOnSuspend: false,
    connectGuest: async (address, port) => { calls.push([address, port]); return stream },
  })
  const desk = await host.start({ ...startOptions('relay'), network: { guestAddress: '172.30.0.2' } })
  assert.equal(await desk.connect(14500), stream)
  assert.deepEqual(calls, [['172.30.0.2', 14500]])
  await assert.rejects(desk.connect(65536), /port/)
  await host.suspend('relay')
  assert.equal(stream.destroyed, true)
})

test('a parked desk is restored with the shares it was parked with, and cold boots with new ones', async () => {
  const parked = [{ tag: 'store', path: '/srv/store', readOnly: true }]
  const now = [...parked, { tag: 'depot', path: '/srv/depot', readOnly: false }]
  const context = makeParkingHost({
    snapshotExists: true,
    host: { readSnapshotShares: async () => parked, isDirectory: () => true },
  })
  await context.host.start({ ...startOptions('agent-shares'), shares: now })
  assert.equal(context.plans[0]?.snapshot.restoring, true)
  // The snapshot holds its devices: the share added since cannot join it.
  assert.deepEqual(context.plans[0]?.shares.map((share) => share.tag), ['store'])

  await context.host.shutdown('agent-shares')
  await context.host.resume('agent-shares')
  assert.equal(context.plans[1]?.snapshot.restoring, false)
  assert.deepEqual(context.plans[1]?.shares.map((share) => share.tag), ['store', 'depot'])
})

test('a parked share whose directory is gone fails the restore clearly, and the desk cold boots', async () => {
  const context = makeParkingHost({
    snapshotExists: true,
    host: {
      readSnapshotShares: async () => [{ tag: 'old', path: '/srv/removed', readOnly: true }],
      isDirectory: (path) => path !== '/srv/removed',
    },
  })
  await context.host.start({ ...startOptions('agent-gone'), shares: [{ tag: 'store', path: '/srv/store', readOnly: true }] })
  assert.equal(context.plans.length, 1, 'no restore was attempted')
  assert.equal(context.plans[0]?.snapshot.restoring, false)
  assert.deepEqual(context.plans[0]?.shares.map((share) => share.tag), ['store'])
  assert.deepEqual(context.removedSnapshots, ['/images/overlays/agent-gone.snapshot'])
  assert.match(
    context.host.stats().lastError ?? '',
    /could not resume from its snapshot and was cold booted: its restore, with the shares it was parked with, could not be planned: shares\[0\]\.path is not an existing directory: \/srv\/removed/,
  )
})


test('resident pause fences handles and resumes before teardown guest commands', async () => {
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend })
  const handle = await context.host.start(startOptions('resident-pause'))
  const fake = factory.machines[0]!
  const calls: string[] = []
  fake.machine.pause = async () => { calls.push('pause') }
  fake.machine.resume = async () => { calls.push('resume') }
  const request = fake.machine.request.bind(fake.machine)
  fake.machine.request = async (command, options) => { calls.push(command.op); return request(command, options) }
  assert.equal(context.host.canPause('resident-pause'), true)
  await context.host.pause('resident-pause')
  await assert.rejects(handle.exec({ command: '/bin/true' }), /not resident/)
  assert.equal(context.host.stats().resident, 1)
  assert.equal(await context.host.resume('resident-pause'), handle)
  await context.host.pause('resident-pause')
  await context.host.suspend('resident-pause')
  assert.deepEqual(calls.slice(0, 4), ['pause', 'resume', 'pause', 'resume'])
  assert.ok(calls.slice(4).includes('exec'), 'guest trim occurs after resume')
})

test('unsupported pause and failed resume preserve the resident desk', async () => {
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend })
  const handle = await context.host.start(startOptions('pause-failure'))
  assert.equal(context.host.canPause('pause-failure'), false)
  await assert.rejects(context.host.pause('pause-failure'), /cannot be paused/)
  const machine = factory.machines[0]!.machine
  machine.pause = async () => undefined
  machine.resume = async () => { throw new Error('resume failed') }
  await context.host.pause('pause-failure')
  await assert.rejects(context.host.suspend('pause-failure'), /resume failed/)
  await assert.rejects(handle.exec({ command: '/bin/true' }), /not resident/)
  assert.equal(context.host.stats().resident, 1)
  machine.resume = async () => undefined
  await context.host.suspend('pause-failure')
})

test('sweep waits for pause before resuming and suspending the desk', async () => {
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend, idleSuspendMs: 1000 })
  await context.host.start(startOptions('pause-sweep'))
  const machine = factory.machines[0]!.machine
  const gate = deferred<void>()
  const order: string[] = []
  machine.pause = async () => { order.push('pause-start'); await gate.promise; order.push('pause-end') }
  machine.resume = async () => { order.push('resume') }
  const pausing = context.host.pause('pause-sweep')
  context.clock.value += 2000
  const sweeping = context.host.sweep()
  await nextTurn()
  assert.deepEqual(order, ['pause-start'])
  gate.resolve()
  await pausing
  assert.equal(await sweeping, 1)
  assert.deepEqual(order, ['pause-start', 'pause-end', 'resume'])
})


test('a paused resident desk can renew its lease', async () => {
  const factory = fakeBackendFactory()
  const context = makeHost({ backend: factory.backend, idleSuspendMs: 60_000, defaultLeaseMs: 1_000 })
  const handle = await context.host.start(startOptions('paused-lease'))
  const machine = factory.machines[0]!.machine
  machine.pause = async () => undefined
  machine.resume = async () => undefined
  await context.host.pause('paused-lease')
  context.clock.value += 900
  handle.renewLease(2_000)
  context.clock.value += 200
  assert.equal(await context.host.sweep(), 0)
  await context.host.suspend('paused-lease')
  assert.throws(() => handle.renewLease(1000), /not resident/)
})

test('a desk can select TCP or vsock for each service connection', async () => {
  const { PassThrough } = await import('node:stream')
  const paths: string[] = []
  const backend: DeskBackend = { async boot(plan) {
    const machine = fakeMachine(plan.deskId).machine
    machine.connect = async () => { paths.push('vsock'); return new PassThrough() }
    return machine
  } }
  const host = createDeskHost({ imageRoot: '/images', backend, ports: { onEvent: () => {}, audit: () => {} },
    pathExists: () => true, deviceExists: () => true, trimOnSuspend: false,
    connectGuest: async () => { paths.push('tcp'); return new PassThrough() },
  })
  const desk = await host.start({ ...startOptions('choice'), network: { guestAddress: '192.0.2.2' } })
  const tcp = await desk.connect(14700, { transport: 'tcp' })
  const vsock = await desk.connect(14700, { transport: 'vsock' })
  assert.deepEqual(paths, ['tcp', 'vsock'])
  await host.suspend('choice')
  assert.equal(tcp.destroyed, true)
  assert.equal(vsock.destroyed, true)
})

test('copy-on-write restore retires the snapshot before boot and retains its source until the VMM stops', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desk-cow-'))
  const snapshot = join(directory, 'cow.snapshot')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(snapshot))
  await writeFile(join(snapshot, 'memory-ranges'), 'memory')
  let source = ''
  const stopped = deferred<void>()
  const backend: DeskBackend = {
    async boot(plan, hooks) {
      source = plan.snapshot.dir
      assert.notEqual(source, snapshot)
      assert.match(source, /\.snapshot\.source-/)
      assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'memory')
      await assert.rejects(readFile(join(snapshot, 'memory-ranges')), /ENOENT/)
      assert.equal(plan.hypervisor, 'cloud-hypervisor')
      assert.ok(plan.vmm.args.some((arg) => arg.includes('memory_restore_mode=copyonwrite')))
      await hooks?.onRestored?.()
      return fakeMachine(plan.deskId, () => stopped.promise).machine
    },
  }
  const host = createDeskHost({ imageRoot: directory, parkWithMemory: true, memoryRestoreMode: 'copyonwrite', backend,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: (path) => path === snapshot || !path.endsWith('.snapshot'),
    deviceExists: () => true, readSnapshotShares: async () => [], readSnapshotSignature: async () => null,
    trimOnSuspend: false,
  })
  try {
    await host.start({ deskId: 'cow', baseImage: join(directory, 'base'), overlayPath: join(directory, 'cow.raw') })
    const suspending = host.suspend('cow')
    await nextTurn()
    assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'memory')
    stopped.resolve()
    await suspending
    await assert.rejects(readFile(join(source, 'memory-ranges')), /ENOENT/)
  } finally { stopped.resolve(); await rm(directory, { recursive: true, force: true }) }
})

test('failed copy-on-write restore never replays or deletes the retired source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desk-cow-fail-'))
  const snapshot = join(directory, 'cow.snapshot')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(snapshot))
  await writeFile(join(snapshot, 'memory-ranges'), 'memory')
  let source = ''
  let boots = 0
  const backend: DeskBackend = { async boot(plan) {
    boots++
    if (plan.snapshot.restoring) { source = plan.snapshot.dir; throw new Error('restore failed') }
    return fakeMachine(plan.deskId).machine
  } }
  const host = createDeskHost({ imageRoot: directory, parkWithMemory: true, memoryRestoreMode: 'copyonwrite', backend,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: (path) => path === snapshot || !path.endsWith('.snapshot'),
    deviceExists: () => true, readSnapshotShares: async () => [], readSnapshotSignature: async () => null, trimOnSuspend: false,
  })
  try {
    await host.start({ deskId: 'cow', baseImage: join(directory, 'base'), overlayPath: join(directory, 'cow.raw') })
    assert.equal(boots, 2)
    assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'memory')
    await assert.rejects(readFile(join(snapshot, 'memory-ranges')), /ENOENT/)
    await host.suspend('cow')
    assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'memory')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('copy-on-write source is retained until park completes and the new snapshot survives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'desk-cow-park-'))
  const snapshot = join(directory, 'cow.snapshot')
  const fs = await import('node:fs/promises')
  await fs.mkdir(snapshot)
  await writeFile(join(snapshot, 'memory-ranges'), 'old')
  let source = ''
  const gate = deferred<void>()
  const backend: DeskBackend = { async boot(plan, hooks) {
    source = plan.snapshot.dir
    await hooks?.onRestored?.()
    const machine = fakeMachine(plan.deskId).machine
    machine.park = async (dir) => {
      assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'old')
      await writeFile(join(dir, 'memory-ranges'), 'new')
      await gate.promise
    }
    return machine
  } }
  const host = createDeskHost({ imageRoot: directory, parkWithMemory: true, memoryRestoreMode: 'copyonwrite', backend,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: (path) => path === snapshot || !path.endsWith('.snapshot'),
    deviceExists: () => true, readSnapshotShares: async () => [], readSnapshotSignature: async () => null,
    cpuSignature: async () => 'cpu', writeSnapshotSignature: async () => {}, trimOnSuspend: false,
  })
  try {
    await host.start({ deskId: 'cow', baseImage: join(directory, 'base'), overlayPath: join(directory, 'cow.raw') })
    const park = host.suspend('cow')
    await nextTurn()
    assert.equal(await readFile(join(source, 'memory-ranges'), 'utf8'), 'old')
    gate.resolve()
    await park
    assert.equal(await readFile(join(snapshot, 'memory-ranges'), 'utf8'), 'new')
    await assert.rejects(readFile(join(source, 'memory-ranges')), /ENOENT/)
  } finally { gate.resolve(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('attachment identity is durable before park and mismatches fail before CoW retirement', async () => {
  const fs = await import('node:fs/promises')
  const { createHash } = await import('node:crypto')
  const directory = await mkdtemp(join(tmpdir(), 'desk-attachment-'))
  const image = join(directory, 'image.raw')
  const snapshot = join(directory, 'attached.snapshot')
  await writeFile(image, 'image bytes')
  const attachment = { path: image, sha256: createHash('sha256').update('image bytes').digest('hex'), kind: 'block' as const }
  let booted = 0
  const backend: DeskBackend = { async boot(plan) {
    booted++
    const machine = fakeMachine(plan.deskId).machine
    machine.park = async (dir) => {
      assert.deepEqual(JSON.parse(await readFile(join(dir, 'attachments.json'), 'utf8')), [attachment])
      await writeFile(join(dir, 'memory-ranges'), 'memory')
    }
    return machine
  } }
  const options = { deskId: 'attached', baseImage: join(directory, 'base'), overlayPath: join(directory, 'attached.raw'), readOnlyAttachments: [attachment] }
  const host = createDeskHost({ imageRoot: directory, parkWithMemory: true, memoryRestoreMode: 'copyonwrite', backend,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: (path) => path === snapshot ? requireExists(path) : true,
    deviceExists: () => true, readSnapshotShares: async () => [], readSnapshotSignature: async () => null,
    cpuSignature: async () => 'cpu', writeSnapshotSignature: async () => {}, trimOnSuspend: false,
  })
  function requireExists(path: string) { return existsSync(path) }
  try {
    await host.start(options)
    await host.suspend('attached')
    await assert.rejects(host.start({ ...options, readOnlyAttachments: [] }), /identity does not match/)
    assert.equal(booted, 1)
    assert.equal(await readFile(join(snapshot, 'memory-ranges'), 'utf8'), 'memory')
    await writeFile(image, 'tampered')
    await assert.rejects(host.start(options), /digest mismatch/)
    assert.equal(await readFile(join(snapshot, 'memory-ranges'), 'utf8'), 'memory')
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

test('snapshot preparation failure cannot release a desk until shutdown succeeds', async () => {
  let stops = 0
  let removed = 0
  const factory = fakeBackendFactory({ shutdown: async () => { stops++; if (stops === 1) throw new Error('stop failed') } })
  const host = createDeskHost({ imageRoot: '/images', backend: { async boot(plan) {
    const machine = await factory.backend.boot(plan)
    machine.park = async () => { throw new Error('must not park') }
    return machine
  } }, parkWithMemory: true, trimOnSuspend: false,
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: () => true, deviceExists: () => true,
    makeSnapshotDir: async () => { throw new Error('disk full') },
    removeSnapshot: async () => {}, removeOverlay: async () => { removed++ },
  })
  await host.start(startOptions('failed-stop'))
  await assert.rejects(host.suspend('failed-stop'), /could not stop/)
  assert.equal(host.stats().resident, 1)
  await assert.rejects(host.resume('failed-stop'), /has not stopped/)
  await host.destroy('failed-stop')
  assert.equal(stops, 2)
  assert.equal(removed, 1)
  assert.equal(host.stats().resident, 0)
})

test('copy-on-write refuses parked virtio-fs shares before snapshot retirement or VM boot', async () => {
  let boots = 0, retired = 0, removed = 0
  const host = createDeskHost({ imageRoot: '/images', parkWithMemory: true, memoryRestoreMode: 'copyonwrite',
    backend: { async boot(plan) { boots++; return fakeMachine(plan.deskId).machine } },
    ports: { onEvent: () => {}, audit: () => {} }, pathExists: () => true, deviceExists: () => true,
    readSnapshotShares: async () => [{ tag: 'depot', path: '/depot', readOnly: true }],
    readSnapshotSignature: async () => 'old-cpu', cpuSignature: async () => 'new-cpu',
    retireSnapshot: async () => { retired++ }, removeSnapshot: async () => { removed++ },
  })
  await assert.rejects(host.start(startOptions('share-cow')), /parked snapshot has virtio-fs shares/)
  assert.equal(boots, 0)
  assert.equal(retired, 0)
  assert.equal(removed, 0)
})

test('strict restore failure leaves a durable fence and never cold boots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-strict-'))
  try {
    const overlay = join(root, 'child.raw')
    const snapshot = join(root, 'child.snapshot')
    await import('node:fs/promises').then(fs => fs.mkdir(snapshot))
    let attempts = 0
    const backend: DeskBackend = { async boot() { attempts++; throw new Error('restore failed') } }
    const options: DeskHostOptions = {
      imageRoot: root, backend, parkWithMemory: true, strictMemoryRestore: true,
      ports: { onEvent: () => {}, audit: () => {} },
      pathExists: () => true, deviceExists: () => true, trimOnSuspend: false,
      readSnapshotSignature: async () => 'same', cpuSignature: async () => 'same',
    }
    const start = { deskId: 'child', baseImage: join(root, 'base.raw'), overlayPath: overlay }
    await assert.rejects(createDeskHost(options).start(start), /memory restore failed/)
    assert.equal(attempts, 1)
    assert.equal(await readFile(`${snapshot}.restore-pending`, 'utf8'), 'restore in progress\n')
    await assert.rejects(createDeskHost(options).start(start), /interrupted memory restore/)
    assert.equal(attempts, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('strict lifecycle retains its fence until the parked snapshot is durable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-strict-park-'))
  try {
    const snapshot = join(root, 'child.snapshot')
    const backend: DeskBackend = { async boot() {
      const machine = fakeMachine('child').machine
      machine.park = async directory => {
        for (const name of ['config.json', 'state.json', 'memory-ranges']) await writeFile(join(directory, name), name)
      }
      return machine
    } }
    const host = createDeskHost({ imageRoot: root, backend, parkWithMemory: true, strictMemoryRestore: true,
      ports: { onEvent: () => {}, audit: () => {} }, pathExists: path => path === snapshot ? existsSync(path) : true,
      deviceExists: () => true, trimOnSuspend: false, cpuSignature: async () => 'cpu' })
    await host.start({ deskId: 'child', baseImage: join(root, 'base.raw'), overlayPath: join(root, 'child.raw') })
    assert.equal(existsSync(`${snapshot}.restore-pending`), true)
    await host.suspend('child')
    assert.equal(existsSync(`${snapshot}.restore-pending`), false)
    assert.equal(await readFile(join(snapshot, 'appkit-cpu-signature'), 'utf8'), 'cpu')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('template initializes before exposure and releases the fence after durable completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-template-host-'))
  try {
    const child = join(root, 'child'), disk = join(child, 'disk.raw'), snapshot = join(child, 'child.snapshot')
    const events: string[] = []
    const backend: DeskBackend = { async boot(plan) { assert.equal(plan.hypervisor, 'cloud-hypervisor'); assert.equal(plan.snapshot.restoring, true); assert.ok(plan.vmm.args.some(arg => arg.includes('memory_restore_mode=copyonwrite'))); events.push('restore'); return fakeMachine('child').machine } }
    const host = createDeskHost({ imageRoot: root, backend, parkWithMemory: true,
      ports: { onEvent: () => {}, audit: () => {} }, pathExists: path => path === child || path === snapshot || path === disk ? existsSync(path) : true,
      deviceExists: () => true, trimOnSuspend: false, cpuSignature: async () => 'cpu', runtimeDir: root })
    await host.start({ deskId: 'child', baseImage: join(root, 'base.raw'), overlayPath: disk, template: {
      async holdFence() { events.push('fenced') },
      async prepare(plan) {
        assert.equal(plan.hypervisor, 'cloud-hypervisor')
        await import('node:fs/promises').then(fs => fs.mkdir(snapshot, { recursive: true }))
        await writeFile(disk, 'disk')
        await writeFile(join(child, '.prepared'), '1\n')
        await writeFile(join(snapshot, 'appkit-cpu-signature'), 'cpu')
        await writeFile(join(snapshot, 'config.json'), JSON.stringify({ disks: [{ path: disk }], net: [{ tap: plan.tap.device, mac: plan.tap.mac }], vsock: { cid: plan.vsock.cid, socket: plan.vsock.socketPath }, memory: { size: plan.memoryMb * 1024 * 1024 }, cpus: { boot_vcpus: plan.vcpus } }))
      },
      async initialize() { events.push('initialize'); assert.equal(existsSync(join(child, '.initialized')), false) },
      async releaseFence() { events.push('release'); assert.equal(await readFile(join(child, '.initialized'), 'utf8'), '1\n') },
    } })
    assert.deepEqual(events, ['fenced', 'restore', 'initialize', 'release'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('template initialization failure stops the guest and keeps the fence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-template-failure-'))
  try {
    const child = join(root, 'child'), disk = join(child, 'disk.raw'), snapshot = join(child, 'child.snapshot')
    let stopped = 0, released = false
    const backend: DeskBackend = { async boot() { return fakeMachine('child', async () => { stopped++ }).machine } }
    const host = createDeskHost({ imageRoot: root, backend, parkWithMemory: true, strictMemoryRestore: true, memoryRestoreMode: 'copyonwrite',
      ports: { onEvent: () => {}, audit: () => {} }, pathExists: path => path === child || path === snapshot || path === disk ? existsSync(path) : true,
      deviceExists: () => true, trimOnSuspend: false, cpuSignature: async () => 'cpu', runtimeDir: root })
    await assert.rejects(host.start({ deskId: 'child', baseImage: join(root, 'base.raw'), overlayPath: disk, template: {
      async holdFence() {},
      async prepare(plan) {
        assert.equal(plan.hypervisor, 'cloud-hypervisor')
        await import('node:fs/promises').then(fs => fs.mkdir(snapshot, { recursive: true }))
        await writeFile(disk, 'disk')
        await writeFile(join(child, '.prepared'), '1\n')
        await writeFile(join(snapshot, 'appkit-cpu-signature'), 'cpu')
        await writeFile(join(snapshot, 'config.json'), JSON.stringify({ disks: [{ path: disk }], net: [{ tap: plan.tap.device, mac: plan.tap.mac }], vsock: { cid: plan.vsock.cid, socket: plan.vsock.socketPath }, memory: { size: plan.memoryMb * 1024 * 1024 }, cpus: { boot_vcpus: plan.vcpus } }))
      },
      async initialize() { throw new Error('reset failed') },
      async releaseFence() { released = true },
    } }), /reset failed/)
    assert.equal(stopped, 1)
    assert.equal(released, false)
    assert.equal(existsSync(join(child, '.initialized')), false)
    assert.equal(existsSync(`${snapshot}.restore-pending`), true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('explicit guest CIDs do not collide within a host', async () => {
  const factory = fakeBackendFactory()
  const host = createDeskHost({ imageRoot: '/images', backend: factory.backend, pathExists: () => true, deviceExists: () => true,
    ports: { onEvent: () => {}, audit: () => {} }, trimOnSuspend: false })
  await host.start({ ...startOptions('one'), vsockCid: 100 })
  await assert.rejects(host.start({ ...startOptions('two'), vsockCid: 100 }), /already assigned/)
  await host.start(startOptions('three'))
  assert.equal(factory.plans[0]?.vsock.cid, 100)
  assert.equal(factory.plans[1]?.vsock.cid, 101)
})
