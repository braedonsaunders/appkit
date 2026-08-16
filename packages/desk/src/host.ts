/**
 * The desk host: lifecycle, leases, and the screen service over a backend.
 *
 * One host manages many desks against one capacity budget. A desk is
 * headless by default; the screen is a service started on demand on the
 * machine the agent is already using. The host owns lease accounting (idle
 * suspend, a hard concurrency cap with a FIFO queue beyond it), event
 * emission to the consumer's ports, and the handover masking contract. It
 * never touches a database and knows nothing about tenants or approvals.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  buildDeskLaunchPlan,
  cleanDeskId,
  DEFAULT_KVM_PATH,
  DEFAULT_VMM_PATH,
  DeskError,
  type DeskLauncherIdentity,
} from './plan'
import { cloudHypervisorBackend, type DeskBackend, type DeskMachine } from './backend'
import {
  parseCapabilities,
  parseClipboardText,
  parseExecResult,
  parseHandoverBegun,
  parseJobStarted,
  parseObservation,
  type GuestEventMessage,
  type GuestInput,
} from './protocol'
import type {
  A11yNode,
  DeskEventDetail,
  DeskEventKind,
  DeskHandoverEndReason,
  DeskHandoverScope,
  DeskPoint,
  DeskPointerButton,
  DeskPorts,
  WindowInfo,
} from './events'

export const DEFAULT_CAPACITY = 4
export const DEFAULT_IDLE_SUSPEND_MS = 5 * 60_000
export const DEFAULT_LEASE_MS = 15 * 60_000
export const DEFAULT_CID_BASE = 100
const MAX_BUFFERED_FRAMES = 60
const MIN_TIMER_DELAY_MS = 25

/**
 * Event kinds that must never reach the recording port while a handover is
 * active. Human input and everything derived from watching the human act is
 * masked; only the handover boundaries themselves cross.
 */
const HANDOVER_MASKED_KINDS: ReadonlySet<DeskEventKind> = new Set([
  'click',
  'type',
  'key',
  'scroll',
  'drag',
  'window_focus',
  'app_launch',
])

export interface DeskHostOptions {
  /** Root of the golden base image and per-desk assets. */
  imageRoot: string
  vmmPath?: string
  kvmPath?: string
  /** Guest kernel; defaults to `<imageRoot>/vmlinux`. */
  kernelPath?: string
  /** Directory holding vsock and API control sockets. */
  runtimeDir?: string
  launcherIdentity?: DeskLauncherIdentity
  backend?: DeskBackend
  ports: DeskPorts
  /** Hard cap on concurrently resident desks; starts beyond it queue FIFO. */
  capacity?: number
  idleSuspendMs?: number
  defaultLeaseMs?: number
  /** First guest vsock CID handed out; each boot takes the next one. */
  cidBase?: number
  now?: () => number
  pathExists?: (path: string) => boolean
  deviceExists?: (path: string) => boolean
}

export interface DeskStartOptions {
  deskId: string
  /** Absolute path of the golden base image this desk boots from. */
  baseImage: string
  /** Absolute path of this desk's copy-on-write overlay. */
  overlayPath: string
  memoryMb?: number
  vcpus?: number
  leaseMs?: number
  network?: { tapDevice?: string; macAddress?: string }
}

export interface DeskExecOptions {
  command: string
  args?: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string>>
  timeoutMs?: number
  /** Survive the call as a background job; the job dies with the lease. */
  keepAlive?: boolean
}

export interface DeskExecSnapshot {
  deskId: string
  command: string
  args: readonly string[]
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
  startedAt: string
  finishedAt: string
}

export interface DeskJob {
  jobId: string
  deskId: string
  command: string
  args: readonly string[]
  startedAt: string
  status: 'running' | 'exited'
  exitCode: number | null
  signal: string | null
}

export interface DeskObservation {
  png: Buffer
  width: number
  height: number
  a11y: A11yNode | null
  windows: readonly WindowInfo[]
  focused: WindowInfo | null
}

export interface DeskFrame {
  seq: number
  width: number
  height: number
  data: Buffer
  at: string
}

export interface DeskScreenInput {
  move(x: number, y: number): Promise<void>
  click(x: number, y: number, button?: DeskPointerButton): Promise<void>
  type(text: string): Promise<void>
  key(combo: string): Promise<void>
  scroll(x: number, y: number, dx: number, dy: number): Promise<void>
  drag(from: DeskPoint, to: DeskPoint): Promise<void>
}

export interface DeskScreenHandle {
  observe(): Promise<DeskObservation>
  /**
   * Coordinate contract: all coordinates are in the pixel space of the most
   * recent `observe()`, one to one. Coordinate input before the first
   * `observe()` or outside its bounds throws.
   */
  input: DeskScreenInput
  a11y: { invoke(nodeId: string, action: string): Promise<void> }
  launch(appId: string, args?: readonly string[]): Promise<void>
  clipboard: { read(): Promise<string>; write(text: string): Promise<void> }
  frames(options?: { fps?: number; width?: number; height?: number }): AsyncIterable<DeskFrame>
  handover: {
    begin(options: {
      ttlMs: number
      scope?: DeskHandoverScope
      actor?: string
    }): Promise<{ url: string }>
    end(): Promise<void>
    readonly active: boolean
  }
}

export interface DeskScreenService {
  start(options: { width: number; height: number }): Promise<DeskScreenHandle>
  stop(): Promise<void>
  readonly running: boolean
}

export interface DeskHandle {
  readonly deskId: string
  renewLease(ms: number): void
  exec(options: DeskExecOptions & { keepAlive: true }): Promise<DeskJob>
  exec(options: DeskExecOptions): Promise<DeskExecSnapshot>
  /** The keepAlive processes still running on this desk. */
  jobs(): DeskJob[]
  screen: DeskScreenService
}

export interface DeskHostStats {
  /** Desks currently resident (booted or booting) against the capacity cap. */
  resident: number
  /** Starts waiting in the FIFO queue for capacity. */
  queued: number
  capacity: number
  suspended: number
  lastStartedAt: string | null
  lastSuspendedAt: string | null
  lastError: string | null
}

export interface DeskHost {
  start(options: DeskStartOptions): Promise<DeskHandle>
  resume(deskId: string): Promise<DeskHandle>
  suspend(deskId: string): Promise<void>
  destroy(deskId: string): Promise<void>
  stats(): DeskHostStats
  /**
   * Enforce every time-based rule now: expire handovers past their TTL and
   * suspend desks past their lease or idle deadline. Returns the number of
   * desks suspended. Timers call this automatically; tests with an injected
   * clock call it directly.
   */
  sweep(): Promise<number>
}

interface HandoverState {
  actor: string | null
  scope: DeskHandoverScope
  beganAt: number
  deadline: number
}

interface ScreenState {
  running: boolean
  width: number
  height: number
  lastObservation: { width: number; height: number } | null
  lastFocusedId: string | null
  handover: HandoverState | null
  handle: DeskScreenHandle
}

interface DeskRecord {
  deskId: string
  startOptions: DeskStartOptions
  status: 'resident' | 'suspended'
  machine: DeskMachine | null
  epoch: number
  leaseDeadline: number
  lastActivityAt: number
  jobs: Map<string, DeskJob>
  screen: ScreenState | null
  unsubscribe: (() => void) | null
  handle: DeskHandle | null
  timer: NodeJS.Timeout | null
  frameStops: Set<() => void>
}

interface QueueEntry {
  run: () => Promise<DeskHandle>
  resolve: (handle: DeskHandle) => void
  reject: (error: Error) => void
}

export function createDeskHost(options: DeskHostOptions): DeskHost {
  const ports = options.ports
  if (typeof ports?.onEvent !== 'function' || typeof ports?.audit !== 'function') {
    throw new DeskError('createDeskHost requires ports with onEvent and audit functions.')
  }
  const backend = options.backend ?? cloudHypervisorBackend
  const now = options.now ?? Date.now
  const pathExists = options.pathExists ?? existsSync
  const deviceExists = options.deviceExists ?? existsSync
  const capacity = positiveInteger(options.capacity ?? DEFAULT_CAPACITY, 'capacity')
  const idleSuspendMs = positiveInteger(options.idleSuspendMs ?? DEFAULT_IDLE_SUSPEND_MS, 'idleSuspendMs')
  const defaultLeaseMs = positiveInteger(options.defaultLeaseMs ?? DEFAULT_LEASE_MS, 'defaultLeaseMs')
  const kernelPath = options.kernelPath ?? join(options.imageRoot, 'vmlinux')

  const records = new Map<string, DeskRecord>()
  const queue: QueueEntry[] = []
  let occupied = 0
  let nextCid = positiveInteger(options.cidBase ?? DEFAULT_CID_BASE, 'cidBase')
  let lastStartedAt: string | null = null
  let lastSuspendedAt: string | null = null
  let lastError: string | null = null

  function iso(timestamp: number): string {
    return new Date(timestamp).toISOString()
  }

  function emit(record: DeskRecord, detail: DeskEventDetail): void {
    if (record.screen?.handover && HANDOVER_MASKED_KINDS.has(detail.kind)) return
    ports.onEvent({ ...detail, deskId: record.deskId, at: iso(now()) })
  }

  function touch(record: DeskRecord): void {
    record.lastActivityAt = now()
  }

  function requireMachine(record: DeskRecord, epoch: number): DeskMachine {
    if (record.status !== 'resident' || record.epoch !== epoch || !record.machine) {
      throw new DeskError(`Desk ${record.deskId} is not resident; resume it first.`)
    }
    return record.machine
  }

  function requireScreen(record: DeskRecord, epoch: number): ScreenState {
    requireMachine(record, epoch)
    const screen = record.screen
    if (!screen?.running) {
      throw new DeskError(`Desk ${record.deskId} has no screen running; call screen.start first.`)
    }
    return screen
  }

  function assertCoordinates(record: DeskRecord, points: readonly DeskPoint[]): void {
    const observation = record.screen?.lastObservation
    if (!observation) {
      throw new DeskError(
        'Coordinate input requires a prior observe(); input coordinates are in the '
          + 'pixel space of the most recent observe(), one to one.',
      )
    }
    for (const point of points) {
      if (
        !Number.isInteger(point.x)
        || !Number.isInteger(point.y)
        || point.x < 0
        || point.y < 0
        || point.x >= observation.width
        || point.y >= observation.height
      ) {
        throw new DeskError(
          `Coordinates (${point.x}, ${point.y}) are outside the most recent observation `
            + `(${observation.width}x${observation.height}); observe() again before targeting.`,
        )
      }
    }
  }

  function armTimer(record: DeskRecord): void {
    if (record.timer) clearTimeout(record.timer)
    record.timer = null
    if (record.status !== 'resident') return
    const deadlines = [record.leaseDeadline, record.lastActivityAt + idleSuspendMs]
    const handover = record.screen?.handover
    if (handover) deadlines.push(handover.deadline)
    const delayMs = Math.max(Math.min(...deadlines) - now(), MIN_TIMER_DELAY_MS)
    record.timer = setTimeout(() => {
      sweep()
        .then(() => {
          if (record.status === 'resident') armTimer(record)
        })
        .catch((error: unknown) => {
          lastError = errorMessage(error)
        })
    }, delayMs)
    record.timer.unref()
  }

  async function endHandover(record: DeskRecord, reason: DeskHandoverEndReason): Promise<void> {
    const screen = record.screen
    const handover = screen?.handover
    if (!screen || !handover) return
    screen.handover = null
    if (record.machine) {
      try {
        await record.machine.request({ op: 'handover-end' })
      } catch (error) {
        lastError = errorMessage(error)
      }
    }
    const durationMs = Math.max(0, now() - handover.beganAt)
    emit(record, { kind: 'handover_end', actor: handover.actor, durationMs })
    ports.audit({
      kind: 'handover_end',
      deskId: record.deskId,
      actor: handover.actor,
      durationMs,
      reason,
      at: iso(now()),
    })
  }

  async function teardown(record: DeskRecord): Promise<void> {
    if (record.status !== 'resident') return
    await endHandover(record, 'revoked')
    for (const stop of [...record.frameStops]) stop()
    record.frameStops.clear()
    if (record.screen?.running) {
      record.screen.running = false
      emit(record, { kind: 'screen_close' })
    }
    record.screen = null
    for (const job of record.jobs.values()) {
      if (job.status !== 'running') continue
      job.status = 'exited'
      job.signal = 'SIGKILL'
      emit(record, { kind: 'job_exit', jobId: job.jobId, exitCode: null, signal: 'SIGKILL' })
    }
    record.unsubscribe?.()
    record.unsubscribe = null
    if (record.timer) clearTimeout(record.timer)
    record.timer = null
    const machine = record.machine
    record.machine = null
    record.status = 'suspended'
    record.handle = null
    if (machine) {
      try {
        await machine.shutdown()
      } catch (error) {
        lastError = errorMessage(error)
      }
    }
    lastSuspendedAt = iso(now())
    occupied -= 1
    drainQueue()
  }

  function drainQueue(): void {
    while (occupied < capacity && queue.length > 0) {
      const entry = queue.shift()
      if (!entry) break
      occupied += 1
      entry.run().then(entry.resolve, (error: unknown) => {
        occupied -= 1
        entry.reject(error instanceof Error ? error : new Error(String(error)))
        drainQueue()
      })
    }
  }

  function admit(run: () => Promise<DeskHandle>): Promise<DeskHandle> {
    if (occupied < capacity) {
      occupied += 1
      return run().catch((error: unknown) => {
        occupied -= 1
        drainQueue()
        throw error
      })
    }
    return new Promise<DeskHandle>((resolvePromise, rejectPromise) => {
      queue.push({ run, resolve: resolvePromise, reject: rejectPromise })
    })
  }

  async function boot(deskId: string, startOptions: DeskStartOptions): Promise<DeskHandle> {
    const plan = buildDeskLaunchPlan(
      {
        deskId,
        vmmPath: options.vmmPath,
        kvmPath: options.kvmPath,
        kernelPath,
        baseImagePath: startOptions.baseImage,
        overlayPath: startOptions.overlayPath,
        memoryMb: startOptions.memoryMb,
        vcpus: startOptions.vcpus,
        vsockCid: nextCid++,
        runtimeDir: options.runtimeDir,
        tapDevice: startOptions.network?.tapDevice,
        macAddress: startOptions.network?.macAddress,
        launcherIdentity: options.launcherIdentity,
      },
      { pathExists, deviceExists },
    )
    let machine: DeskMachine
    try {
      machine = await backend.boot(plan)
    } catch (error) {
      lastError = errorMessage(error)
      throw error instanceof DeskError
        ? error
        : new DeskError(`Desk ${deskId} failed to boot: ${errorMessage(error)}`)
    }

    let record = records.get(deskId)
    if (!record) {
      record = {
        deskId,
        startOptions,
        status: 'resident',
        machine,
        epoch: 1,
        leaseDeadline: 0,
        lastActivityAt: 0,
        jobs: new Map(),
        screen: null,
        unsubscribe: null,
        handle: null,
        timer: null,
        frameStops: new Set(),
      }
      records.set(deskId, record)
    } else {
      record.startOptions = startOptions
      record.status = 'resident'
      record.machine = machine
      record.epoch += 1
      record.jobs = new Map()
      record.screen = null
      record.frameStops = new Set()
    }
    const current = record
    const epoch = current.epoch
    current.leaseDeadline = now() + positiveInteger(startOptions.leaseMs ?? defaultLeaseMs, 'leaseMs')
    current.lastActivityAt = now()
    current.unsubscribe = machine.subscribe((event) => {
      handleGuestEvent(current, epoch, event)
    })
    current.handle = makeHandle(current, epoch)
    lastStartedAt = iso(now())
    armTimer(current)
    return current.handle
  }

  function handleGuestEvent(record: DeskRecord, epoch: number, event: GuestEventMessage): void {
    if (record.status !== 'resident' || record.epoch !== epoch) return
    if (event.event === 'job-exit') {
      const job = record.jobs.get(event.jobId)
      if (!job || job.status !== 'running') return
      job.status = 'exited'
      job.exitCode = event.exitCode
      job.signal = event.signal
      emit(record, {
        kind: 'job_exit',
        jobId: event.jobId,
        exitCode: event.exitCode,
        signal: event.signal,
      })
      return
    }
    if (event.event === 'window-focus') {
      if (record.screen) record.screen.lastFocusedId = event.window.id
      emit(record, { kind: 'window_focus', window: event.window })
    }
  }

  function makeHandle(record: DeskRecord, epoch: number): DeskHandle {
    const execImplementation = async (
      execOptions: DeskExecOptions,
    ): Promise<DeskExecSnapshot | DeskJob> => {
      const machine = requireMachine(record, epoch)
      const command = nonEmptyString(execOptions.command, 'command')
      const args = [...(execOptions.args ?? [])]
      const keepAlive = execOptions.keepAlive === true
      if (ports.policy?.allowExec && !ports.policy.allowExec({
        deskId: record.deskId,
        command,
        args,
        keepAlive,
      })) {
        throw new DeskError(`Policy denied exec of ${command} on desk ${record.deskId}.`)
      }
      touch(record)
      const startedAt = iso(now())
      if (keepAlive) {
        const { jobId } = parseJobStarted(await machine.request({
          op: 'job-start',
          command,
          args,
          cwd: execOptions.cwd,
          env: execOptions.env,
        }))
        const job: DeskJob = {
          jobId,
          deskId: record.deskId,
          command,
          args,
          startedAt,
          status: 'running',
          exitCode: null,
          signal: null,
        }
        record.jobs.set(jobId, job)
        emit(record, { kind: 'job_start', jobId, command, args })
        return { ...job }
      }
      const result = parseExecResult(await machine.request(
        {
          op: 'exec',
          command,
          args,
          cwd: execOptions.cwd,
          env: execOptions.env,
          timeoutMs: execOptions.timeoutMs,
        },
        execOptions.timeoutMs === undefined ? {} : { timeoutMs: execOptions.timeoutMs + 5_000 },
      ))
      emit(record, {
        kind: 'shell_command',
        command,
        args,
        cwd: execOptions.cwd ?? null,
        exitCode: result.exitCode,
        signal: result.signal,
      })
      return {
        deskId: record.deskId,
        command,
        args,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        startedAt,
        finishedAt: iso(now()),
      }
    }

    const screenService: DeskScreenService = {
      async start({ width, height }) {
        const machine = requireMachine(record, epoch)
        if (record.screen?.running) return record.screen.handle
        const cleanWidth = positiveInteger(width, 'width')
        const cleanHeight = positiveInteger(height, 'height')
        if (ports.policy?.allowScreen && !ports.policy.allowScreen({
          deskId: record.deskId,
          width: cleanWidth,
          height: cleanHeight,
        })) {
          throw new DeskError(`Policy denied opening a screen on desk ${record.deskId}.`)
        }
        touch(record)
        await machine.request({ op: 'screen-start', width: cleanWidth, height: cleanHeight })
        const handle = makeScreenHandle(record, epoch)
        record.screen = {
          running: true,
          width: cleanWidth,
          height: cleanHeight,
          lastObservation: null,
          lastFocusedId: null,
          handover: null,
          handle,
        }
        emit(record, { kind: 'screen_open', width: cleanWidth, height: cleanHeight })
        return handle
      },
      async stop() {
        const machine = requireMachine(record, epoch)
        const screen = record.screen
        if (!screen?.running) return
        await endHandover(record, 'revoked')
        for (const stop of [...record.frameStops]) stop()
        record.frameStops.clear()
        screen.running = false
        record.screen = null
        touch(record)
        await machine.request({ op: 'screen-stop' })
        emit(record, { kind: 'screen_close' })
      },
      get running() {
        return record.screen?.running === true
      },
    }

    return {
      deskId: record.deskId,
      renewLease(ms: number): void {
        requireMachine(record, epoch)
        record.leaseDeadline = now() + positiveInteger(ms, 'ms')
        touch(record)
        armTimer(record)
      },
      exec: execImplementation as DeskHandle['exec'],
      jobs(): DeskJob[] {
        return [...record.jobs.values()]
          .filter((job) => job.status === 'running')
          .map((job) => ({ ...job }))
      },
      screen: screenService,
    }
  }

  function makeScreenHandle(record: DeskRecord, epoch: number): DeskScreenHandle {
    async function sendInput(detail: DeskEventDetail | null, input: GuestInput): Promise<void> {
      const machine = requireMachine(record, epoch)
      touch(record)
      await machine.request({ op: 'input', input })
      if (detail) emit(record, detail)
    }

    return {
      async observe(): Promise<DeskObservation> {
        const machine = requireMachine(record, epoch)
        const screen = requireScreen(record, epoch)
        touch(record)
        const observation = parseObservation(await machine.request({ op: 'observe' }))
        screen.lastObservation = { width: observation.width, height: observation.height }
        if (observation.focused && observation.focused.id !== screen.lastFocusedId) {
          screen.lastFocusedId = observation.focused.id
          emit(record, { kind: 'window_focus', window: observation.focused })
        }
        return {
          png: Buffer.from(observation.png, 'base64'),
          width: observation.width,
          height: observation.height,
          a11y: observation.a11y,
          windows: observation.windows,
          focused: observation.focused,
        }
      },
      input: {
        async move(x, y) {
          requireScreen(record, epoch)
          assertCoordinates(record, [{ x, y }])
          await sendInput(null, { type: 'move', x, y })
        },
        async click(x, y, button = 'left') {
          requireScreen(record, epoch)
          assertCoordinates(record, [{ x, y }])
          await sendInput({ kind: 'click', x, y, button }, { type: 'click', x, y, button })
        },
        async type(text) {
          requireScreen(record, epoch)
          const cleanText = requireStringValue(text, 'text')
          await sendInput({ kind: 'type', text: cleanText }, { type: 'type', text: cleanText })
        },
        async key(combo) {
          requireScreen(record, epoch)
          const cleanCombo = nonEmptyString(combo, 'combo')
          await sendInput({ kind: 'key', combo: cleanCombo }, { type: 'key', combo: cleanCombo })
        },
        async scroll(x, y, dx, dy) {
          requireScreen(record, epoch)
          assertCoordinates(record, [{ x, y }])
          if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
            throw new DeskError('Scroll deltas must be integers.')
          }
          await sendInput({ kind: 'scroll', x, y, dx, dy }, { type: 'scroll', x, y, dx, dy })
        },
        async drag(from, to) {
          requireScreen(record, epoch)
          assertCoordinates(record, [from, to])
          await sendInput({ kind: 'drag', from, to }, { type: 'drag', from, to })
        },
      },
      a11y: {
        async invoke(nodeId, action) {
          const machine = requireMachine(record, epoch)
          requireScreen(record, epoch)
          touch(record)
          await machine.request({
            op: 'a11y-invoke',
            nodeId: nonEmptyString(nodeId, 'nodeId'),
            action: nonEmptyString(action, 'action'),
          })
        },
      },
      async launch(appId, args = []) {
        const machine = requireMachine(record, epoch)
        requireScreen(record, epoch)
        touch(record)
        const cleanAppId = nonEmptyString(appId, 'appId')
        await machine.request({ op: 'launch', appId: cleanAppId, args: [...args] })
        emit(record, { kind: 'app_launch', appId: cleanAppId, args: [...args] })
      },
      clipboard: {
        async read() {
          const machine = requireMachine(record, epoch)
          const screen = requireScreen(record, epoch)
          if (screen.handover) {
            // The human may have just typed a credential that is now on the
            // clipboard; reading it during a handover would carry it into the
            // agent's context and the consumer's record.
            throw new DeskError('The clipboard is masked while a handover is active.')
          }
          touch(record)
          return parseClipboardText(await machine.request({ op: 'clipboard-read' }))
        },
        async write(text) {
          const machine = requireMachine(record, epoch)
          requireScreen(record, epoch)
          touch(record)
          await machine.request({ op: 'clipboard-write', text: requireStringValue(text, 'text') })
        },
      },
      frames(frameOptions = {}) {
        return {
          [Symbol.asyncIterator]: () => {
            const machine = requireMachine(record, epoch)
            const screen = requireScreen(record, epoch)
            const fps = positiveInteger(frameOptions.fps ?? 10, 'fps')
            const width = positiveInteger(frameOptions.width ?? screen.width, 'width')
            const height = positiveInteger(frameOptions.height ?? screen.height, 'height')
            const buffered: DeskFrame[] = []
            let waiting: ((result: IteratorResult<DeskFrame, undefined>) => void) | null = null
            let finished = false
            const unsubscribe = machine.subscribe((event) => {
              if (finished || event.event !== 'frame') return
              // Masking contract: no frame reaches a recording consumer while
              // a handover is active.
              if (record.screen?.handover) return
              const frame: DeskFrame = {
                seq: event.seq,
                width: event.width,
                height: event.height,
                data: Buffer.from(event.data, 'base64'),
                at: iso(now()),
              }
              if (waiting) {
                const resume = waiting
                waiting = null
                resume({ value: frame, done: false })
              } else {
                buffered.push(frame)
                if (buffered.length > MAX_BUFFERED_FRAMES) buffered.shift()
              }
            })
            const finish = (): void => {
              if (finished) return
              finished = true
              unsubscribe()
              record.frameStops.delete(finish)
              if (record.status === 'resident' && record.machine) {
                record.machine.request({ op: 'frames-stop' }).catch((error: unknown) => {
                  lastError = errorMessage(error)
                })
              }
              if (waiting) {
                const resume = waiting
                waiting = null
                resume({ value: undefined, done: true })
              }
            }
            record.frameStops.add(finish)
            const started = machine
              .request({ op: 'frames-start', fps, width, height })
              .catch((error: unknown) => {
                finish()
                throw error instanceof Error ? error : new Error(String(error))
              })
            return {
              async next(): Promise<IteratorResult<DeskFrame, undefined>> {
                await started
                const bufferedFrame = buffered.shift()
                if (bufferedFrame) return { value: bufferedFrame, done: false }
                if (finished) return { value: undefined, done: true }
                return new Promise((resolvePromise) => {
                  waiting = resolvePromise
                })
              },
              async return(): Promise<IteratorResult<DeskFrame, undefined>> {
                finish()
                return { value: undefined, done: true }
              },
              async throw(error?: unknown): Promise<IteratorResult<DeskFrame, undefined>> {
                finish()
                throw error instanceof Error ? error : new Error(String(error))
              },
            }
          },
        }
      },
      handover: {
        async begin({ ttlMs, scope = 'control', actor }) {
          const machine = requireMachine(record, epoch)
          const screen = requireScreen(record, epoch)
          if (screen.handover) {
            throw new DeskError(`A handover is already active on desk ${record.deskId}.`)
          }
          const cleanTtl = positiveInteger(ttlMs, 'ttlMs')
          if (ports.policy?.allowHandover && !ports.policy.allowHandover({
            deskId: record.deskId,
            scope,
            ttlMs: cleanTtl,
          })) {
            throw new DeskError(`Policy denied a handover on desk ${record.deskId}.`)
          }
          touch(record)
          const begun = parseHandoverBegun(
            await machine.request({ op: 'handover-begin', ttlMs: cleanTtl, scope }),
          )
          const startedAt = now()
          screen.handover = {
            actor: actor ?? null,
            scope,
            beganAt: startedAt,
            deadline: startedAt + cleanTtl,
          }
          // The boundary events are the one thing that crosses the mask.
          emit(record, { kind: 'handover_begin', actor: actor ?? null, scope })
          ports.audit({
            kind: 'handover_begin',
            deskId: record.deskId,
            actor: actor ?? null,
            scope,
            ttlMs: cleanTtl,
            at: iso(startedAt),
          })
          armTimer(record)
          return { url: begun.url }
        },
        async end() {
          requireMachine(record, epoch)
          await endHandover(record, 'ended')
        },
        get active() {
          return record.screen?.handover != null
        },
      },
    }
  }

  async function start(startOptions: DeskStartOptions): Promise<DeskHandle> {
    const deskId = cleanDeskId(startOptions.deskId)
    const existing = records.get(deskId)
    if (existing?.status === 'resident' && existing.handle) return existing.handle
    return admit(() => boot(deskId, { ...startOptions, deskId }))
  }

  async function resume(deskId: string): Promise<DeskHandle> {
    const record = records.get(cleanDeskId(deskId))
    if (!record) throw new DeskError(`Unknown desk: ${deskId}`)
    if (record.status === 'resident' && record.handle) return record.handle
    return admit(() => boot(record.deskId, record.startOptions))
  }

  async function suspend(deskId: string): Promise<void> {
    const record = records.get(cleanDeskId(deskId))
    if (!record) return
    await teardown(record)
  }

  async function destroy(deskId: string): Promise<void> {
    const id = cleanDeskId(deskId)
    const record = records.get(id)
    if (!record) return
    await teardown(record)
    records.delete(id)
  }

  async function sweep(): Promise<number> {
    const timestamp = now()
    let suspendedCount = 0
    for (const record of [...records.values()]) {
      if (record.status !== 'resident') continue
      const handover = record.screen?.handover
      if (handover && handover.deadline <= timestamp) {
        await endHandover(record, 'expired')
      }
      if (
        record.leaseDeadline <= timestamp
        || timestamp - record.lastActivityAt >= idleSuspendMs
      ) {
        await teardown(record)
        suspendedCount += 1
      }
    }
    return suspendedCount
  }

  function stats(): DeskHostStats {
    let suspended = 0
    for (const record of records.values()) {
      if (record.status === 'suspended') suspended += 1
    }
    return {
      resident: occupied,
      queued: queue.length,
      capacity,
      suspended,
      lastStartedAt,
      lastSuspendedAt,
      lastError,
    }
  }

  return { start, resume, suspend, destroy, stats, sweep }
}

export interface VerifyDeskHostOptions {
  kernelPath: string
  baseImagePath: string
  vmmPath?: string
  kvmPath?: string
  /** Where the throwaway probe overlay is created; defaults to the OS tmpdir. */
  scratchDir?: string
  runtimeDir?: string
  backend?: DeskBackend
  launcherIdentity?: DeskLauncherIdentity
  platform?: NodeJS.Platform
  pathExists?: (path: string) => boolean
  deviceExists?: (path: string) => boolean
  idFactory?: () => string
}

export interface DeskHostVerification {
  /** Whether this host can serve desks: KVM present and the guest reachable. */
  supported: boolean
  vmmPath: string
  kvm: boolean
  vsock: boolean
  virtioGpu: boolean
}

/**
 * Boot-time probe. Distinguishes a host that is unusable — wrong platform,
 * missing VMM, missing images — which throws, from capabilities that are
 * merely absent, which are reported as booleans: `kvm` (no boot possible
 * without it), `vsock` (the guest agent answered), and `virtioGpu` (a screen
 * would have hardware-backed rendering). It boots a throwaway microVM through
 * the backend, asks it two questions, and discards it.
 */
export async function verifyDeskHost(options: VerifyDeskHostOptions): Promise<DeskHostVerification> {
  const platform = options.platform ?? process.platform
  const pathExists = options.pathExists ?? existsSync
  const deviceExists = options.deviceExists ?? existsSync
  const idFactory = options.idFactory ?? randomUUID
  const backend = options.backend ?? cloudHypervisorBackend
  const vmmPath = options.vmmPath ?? DEFAULT_VMM_PATH
  const kvmPath = options.kvmPath ?? DEFAULT_KVM_PATH

  if (platform !== 'linux') {
    throw new DeskError(`The AppKit desk requires Linux; received ${platform}.`)
  }
  if (!pathExists(vmmPath)) {
    throw new DeskError(`Cloud Hypervisor was not found at ${vmmPath}.`)
  }
  if (!pathExists(options.kernelPath)) {
    throw new DeskError(`Guest kernel does not exist: ${options.kernelPath}`)
  }
  if (!pathExists(options.baseImagePath)) {
    throw new DeskError(`Base image does not exist: ${options.baseImagePath}`)
  }
  if (!deviceExists(kvmPath)) {
    return { supported: false, vmmPath, kvm: false, vsock: false, virtioGpu: false }
  }

  const scratchDir = options.scratchDir ?? tmpdir()
  const deskId = `verify-${idFactory()}`
  const overlayPath = join(scratchDir, `${deskId}.qcow2`)
  const plan = buildDeskLaunchPlan(
    {
      deskId,
      vmmPath,
      kvmPath,
      kernelPath: options.kernelPath,
      baseImagePath: options.baseImagePath,
      overlayPath,
      vsockCid: 3,
      runtimeDir: options.runtimeDir,
      launcherIdentity: options.launcherIdentity,
    },
    { pathExists, deviceExists },
  )

  let machine: DeskMachine
  try {
    machine = await backend.boot(plan)
  } catch (error) {
    throw new DeskError(`Desk verification could not boot a probe VM: ${errorMessage(error)}`)
  }
  let vsock = false
  let virtioGpu = false
  try {
    try {
      await machine.request({ op: 'ping' })
      vsock = true
    } catch {
      vsock = false
    }
    if (vsock) {
      try {
        virtioGpu = parseCapabilities(await machine.request({ op: 'capabilities' })).virtioGpu
      } catch {
        virtioGpu = false
      }
    }
  } finally {
    try {
      await machine.shutdown()
    } catch {
      // The probe VM is discarded regardless of how cleanly it stops.
    }
    await rm(overlayPath, { force: true })
  }
  return { supported: vsock, vmmPath, kvm: true, vsock, virtioGpu }
}

function nonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DeskError(`${field} must be a non-empty string.`)
  }
  return value
}

function requireStringValue(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new DeskError(`${field} must be a string.`)
  }
  return value
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new DeskError(`${field} must be a positive integer.`)
  }
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
