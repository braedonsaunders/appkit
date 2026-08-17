import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { createDeskHost, verifyDeskHost, type DeskStartOptions } from './host'
import type { DeskBackend, DeskMachine } from './backend'
import { DEFAULT_KERNEL_CMDLINE, type DeskLaunchPlan } from './plan'
import type { GuestCommand, GuestEventMessage } from './protocol'
import type { DeskAuditEntry, DeskEvent, DeskPorts, WindowInfo } from './events'

const focusedWindow: WindowInfo = { id: 'w1', title: 'Files', appId: 'org.xfce.Thunar' }

interface FakeMachine {
  machine: DeskMachine
  requests: GuestCommand[]
  emit: (event: GuestEventMessage) => void
  readonly shutdowns: number
}

function fakeMachine(deskId: string): FakeMachine {
  const requests: GuestCommand[] = []
  const listeners = new Set<(event: GuestEventMessage) => void>()
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
    async shutdown() {
      shutdowns += 1
    },
  }
  return {
    machine,
    requests,
    emit: (event) => {
      for (const listener of [...listeners]) listener(event)
    },
    get shutdowns() {
      return shutdowns
    },
  }
}

function fakeBackendFactory() {
  const machines: FakeMachine[] = []
  const plans: DeskLaunchPlan[] = []
  const backend: DeskBackend = {
    async boot(plan) {
      plans.push(plan)
      const machine = fakeMachine(plan.deskId)
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
} = {}) {
  const events: DeskEvent[] = []
  const audits: DeskAuditEntry[] = []
  const clock = { value: 1_000_000 }
  const factory = fakeBackendFactory()
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
  })
  return { host, events, audits, clock, ...factory }
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

  await screen.input.click(1279, 899)
  await assert.rejects(screen.input.click(1280, 899), /outside the most recent view/)
  await assert.rejects(screen.input.move(10, 900), /outside the most recent view/)
  await assert.rejects(screen.input.drag({ x: 5, y: 5 }, { x: 6, y: 1200 }), /outside/)

  const clickEvent = context.events.find((event) => event.kind === 'click')
  assert.ok(clickEvent?.kind === 'click')
  assert.equal(clickEvent.x, 1279)
  assert.equal(clickEvent.y, 899)
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
