import { randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { Buffer } from 'node:buffer'
import {
  ProcessSandboxError,
  type ProcessSandboxOptions,
  spawnBubblewrappedProcess,
} from './index'

export type ProcessSandboxExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

export type ProcessSandboxExecutionEvent = {
  sequence: number
  executionId: string
  timestamp: string
} & (
  | { type: 'started' }
  | { type: 'stdout' | 'stderr'; data: string }
  | {
      type: 'finished'
      status: Exclude<ProcessSandboxExecutionStatus, 'running'>
      exitCode: number | null
      signal: NodeJS.Signals | null
    }
)

export interface ProcessSandboxExecutionResult {
  executionId: string
  status: Exclude<ProcessSandboxExecutionStatus, 'running'>
  exitCode: number | null
  signal: NodeJS.Signals | null
  startedAt: string
  finishedAt: string
  output: string
  outputTruncated: boolean
}

export interface ProcessSandboxExecutionSnapshot {
  executionId: string
  status: ProcessSandboxExecutionStatus
  startedAt: string
  finishedAt: string | null
  /** Events strictly newer than the sequence supplied to `snapshot()` or `waitForUpdate()`. */
  events: ProcessSandboxExecutionEvent[]
  /** Latest sequence produced, even when there are no new events in this snapshot. */
  latestSequence: number
  /** True when older stream events fell out of the bounded replay window. */
  replayTruncated: boolean
  result: ProcessSandboxExecutionResult | null
}

export interface ProcessSandboxExecutionOptions {
  /** A caller-supplied idempotency and reattachment key. Generated when omitted. */
  executionId?: string
  process: ProcessSandboxOptions
  timeoutMs?: number
  /** How long the settled result remains reattachable in this supervisor. */
  retentionMs?: number
  /** Per-execution retained output ceiling; defaults to the supervisor policy. */
  maxOutputBytes?: number
  /** Per-execution replay event ceiling; defaults to the supervisor policy. */
  maxReplayEvents?: number
}

export interface ProcessSandboxSupervisorOptions {
  launcher?: (options: ProcessSandboxOptions) => ChildProcess
  idFactory?: () => string
  now?: () => number
  defaultTimeoutMs?: number
  defaultRetentionMs?: number
  killGraceMs?: number
  maxOutputBytes?: number
  maxReplayEvents?: number
  maxExecutions?: number
}

export interface ProcessSandboxSupervisorStats {
  active: number
  retained: number
  maxExecutions: number
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastError: string | null
}

type Execution = {
  id: string
  child: ChildProcess
  status: ProcessSandboxExecutionStatus
  startedAt: string
  finishedAt: string | null
  events: ProcessSandboxExecutionEvent[]
  nextSequence: number
  replayTruncated: boolean
  outputParts: string[]
  outputBytes: number
  outputTruncated: boolean
  result: ProcessSandboxExecutionResult | null
  resultPromise: Promise<ProcessSandboxExecutionResult>
  resolveResult: (result: ProcessSandboxExecutionResult) => void
  timeout: NodeJS.Timeout | null
  forceKill: NodeJS.Timeout | null
  requestedFinalStatus: 'cancelled' | 'timed_out' | null
  retentionMs: number
  maxOutputBytes: number
  maxReplayEvents: number
  expiresAt: number | null
  waiters: Set<() => void>
}

type NewExecutionEvent =
  | { type: 'started' }
  | { type: 'stdout' | 'stderr'; data: string }
  | {
      type: 'finished'
      status: Exclude<ProcessSandboxExecutionStatus, 'running'>
      exitCode: number | null
      signal: NodeJS.Signals | null
    }

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_RETENTION_MS = 15 * 60_000
const DEFAULT_KILL_GRACE_MS = 2_000
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_MAX_REPLAY_EVENTS = 512
const DEFAULT_MAX_EXECUTIONS = 256
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/**
 * Supervise sandboxed processes independently from the request that started
 * them. Stable IDs make starts idempotent, settled results stay reattachable,
 * and a bounded event window supports reconnecting stream consumers without
 * retaining unbounded logs in the host process.
 *
 * The default launcher remains the fail-closed bubblewrap implementation. A
 * different launcher can be injected for another isolation backend, but it
 * must return a normal Node ChildProcess and owns equivalent confinement.
 */
export class ProcessSandboxSupervisor {
  readonly #launcher: (options: ProcessSandboxOptions) => ChildProcess
  readonly #idFactory: () => string
  readonly #now: () => number
  readonly #defaultTimeoutMs: number
  readonly #defaultRetentionMs: number
  readonly #killGraceMs: number
  readonly #maxOutputBytes: number
  readonly #maxReplayEvents: number
  readonly #maxExecutions: number
  readonly #executions = new Map<string, Execution>()
  #lastStartedAt: string | null = null
  #lastFinishedAt: string | null = null
  #lastError: string | null = null

  constructor(options: ProcessSandboxSupervisorOptions = {}) {
    this.#launcher = options.launcher ?? spawnBubblewrappedProcess
    this.#idFactory = options.idFactory ?? randomUUID
    this.#now = options.now ?? Date.now
    this.#defaultTimeoutMs = positiveInteger(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      'defaultTimeoutMs',
    )
    this.#defaultRetentionMs = positiveInteger(
      options.defaultRetentionMs ?? DEFAULT_RETENTION_MS,
      'defaultRetentionMs',
    )
    this.#killGraceMs = nonNegativeInteger(
      options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      'killGraceMs',
    )
    this.#maxOutputBytes = positiveInteger(
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      'maxOutputBytes',
    )
    this.#maxReplayEvents = positiveInteger(
      options.maxReplayEvents ?? DEFAULT_MAX_REPLAY_EVENTS,
      'maxReplayEvents',
    )
    this.#maxExecutions = positiveInteger(
      options.maxExecutions ?? DEFAULT_MAX_EXECUTIONS,
      'maxExecutions',
    )
  }

  /** Start once. Reusing a retained execution ID returns its existing snapshot. */
  start(options: ProcessSandboxExecutionOptions): ProcessSandboxExecutionSnapshot {
    this.sweep()
    const id = cleanExecutionId(options.executionId ?? this.#idFactory())
    const existing = this.#executions.get(id)
    if (existing) return snapshotOf(existing, 0)

    this.#makeCapacity()
    const timeoutMs = positiveInteger(
      options.timeoutMs ?? this.#defaultTimeoutMs,
      'timeoutMs',
    )
    const retentionMs = positiveInteger(
      options.retentionMs ?? this.#defaultRetentionMs,
      'retentionMs',
    )
    const maxOutputBytes = positiveInteger(
      options.maxOutputBytes ?? this.#maxOutputBytes,
      'maxOutputBytes',
    )
    const maxReplayEvents = positiveInteger(
      options.maxReplayEvents ?? this.#maxReplayEvents,
      'maxReplayEvents',
    )
    let child: ChildProcess
    try {
      child = this.#launcher(options.process)
    } catch (error) {
      this.#lastError = errorMessage(error)
      throw error
    }

    let resolveResult!: (result: ProcessSandboxExecutionResult) => void
    const resultPromise = new Promise<ProcessSandboxExecutionResult>((resolvePromise) => {
      resolveResult = resolvePromise
    })
    const startedAt = new Date(this.#now()).toISOString()
    const execution: Execution = {
      id,
      child,
      status: 'running',
      startedAt,
      finishedAt: null,
      events: [],
      nextSequence: 1,
      replayTruncated: false,
      outputParts: [],
      outputBytes: 0,
      outputTruncated: false,
      result: null,
      resultPromise,
      resolveResult,
      timeout: null,
      forceKill: null,
      requestedFinalStatus: null,
      retentionMs,
      maxOutputBytes,
      maxReplayEvents,
      expiresAt: null,
      waiters: new Set(),
    }
    this.#executions.set(id, execution)
    this.#lastStartedAt = startedAt
    this.#appendEvent(execution, { type: 'started' })

    child.stdout?.on('data', (chunk: unknown) => {
      this.#appendOutput(execution, 'stdout', chunk)
    })
    child.stderr?.on('data', (chunk: unknown) => {
      this.#appendOutput(execution, 'stderr', chunk)
    })
    child.once('error', (error) => {
      this.#lastError = error.message
      this.#finish(execution, 'failed', null, null)
    })
    child.once('exit', (code, signal) => {
      const status = execution.requestedFinalStatus
        ?? (code === 0 ? 'completed' : 'failed')
      this.#finish(execution, status, code, signal)
    })
    execution.timeout = setTimeout(() => {
      this.#requestStop(execution, 'timed_out')
    }, timeoutMs)
    execution.timeout.unref()

    return snapshotOf(execution, 0)
  }

  snapshot(executionId: string, afterSequence = 0): ProcessSandboxExecutionSnapshot | null {
    this.sweep()
    const execution = this.#executions.get(cleanExecutionId(executionId))
    return execution ? snapshotOf(execution, cleanSequence(afterSequence)) : null
  }

  /**
   * Wait until an event newer than `afterSequence` exists, the execution
   * settles, or the wait expires. This is suitable for HTTP long-polling: a
   * reconnect asks again with the last observed sequence and replays safely.
   */
  async waitForUpdate(
    executionId: string,
    afterSequence = 0,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<ProcessSandboxExecutionSnapshot | null> {
    this.sweep()
    const id = cleanExecutionId(executionId)
    const sequence = cleanSequence(afterSequence)
    const execution = this.#executions.get(id)
    if (!execution) return null
    const immediate = snapshotOf(execution, sequence)
    if (immediate.events.length > 0 || immediate.status !== 'running') return immediate

    const timeoutMs = positiveInteger(options.timeoutMs ?? 25_000, 'timeoutMs')
    await new Promise<void>((resolvePromise) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        execution.waiters.delete(finish)
        options.signal?.removeEventListener('abort', finish)
        resolvePromise()
      }
      const timeout = setTimeout(finish, timeoutMs)
      timeout.unref()
      execution.waiters.add(finish)
      options.signal?.addEventListener('abort', finish, { once: true })
      // Close the event-registration race without delaying normal callers.
      if (execution.nextSequence - 1 > sequence || execution.status !== 'running') finish()
    })
    return this.snapshot(id, sequence)
  }

  result(executionId: string): Promise<ProcessSandboxExecutionResult> {
    this.sweep()
    const execution = this.#executions.get(cleanExecutionId(executionId))
    if (!execution) {
      return Promise.reject(new ProcessSandboxError(`Unknown or expired execution: ${executionId}`))
    }
    return execution.resultPromise
  }

  cancel(executionId: string): boolean {
    this.sweep()
    const execution = this.#executions.get(cleanExecutionId(executionId))
    if (!execution || execution.status !== 'running') return false
    this.#requestStop(execution, 'cancelled')
    return true
  }

  /** Cancel if necessary, await termination, then forget all retained evidence. */
  async dispose(executionId: string): Promise<boolean> {
    const id = cleanExecutionId(executionId)
    const execution = this.#executions.get(id)
    if (!execution) return false
    if (execution.status === 'running') this.#requestStop(execution, 'cancelled')
    await execution.resultPromise
    this.#executions.delete(id)
    return true
  }

  sweep(): number {
    const now = this.#now()
    let removed = 0
    for (const [id, execution] of this.#executions) {
      if (execution.expiresAt !== null && execution.expiresAt <= now) {
        this.#executions.delete(id)
        removed += 1
      }
    }
    return removed
  }

  stats(): ProcessSandboxSupervisorStats {
    this.sweep()
    let active = 0
    for (const execution of this.#executions.values()) {
      if (execution.status === 'running') active += 1
    }
    return {
      active,
      retained: this.#executions.size - active,
      maxExecutions: this.#maxExecutions,
      lastStartedAt: this.#lastStartedAt,
      lastFinishedAt: this.#lastFinishedAt,
      lastError: this.#lastError,
    }
  }

  #appendOutput(execution: Execution, type: 'stdout' | 'stderr', value: unknown): void {
    if (execution.status !== 'running') return
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value))
    const remaining = execution.maxOutputBytes - execution.outputBytes
    if (remaining <= 0) {
      execution.outputTruncated = true
      return
    }
    const kept = chunk.subarray(0, remaining)
    const data = kept.toString('utf8')
    if (data) {
      execution.outputParts.push(data)
      execution.outputBytes += kept.byteLength
      this.#appendEvent(execution, { type, data })
    }
    if (kept.byteLength < chunk.byteLength) execution.outputTruncated = true
  }

  #appendEvent(
    execution: Execution,
    event: NewExecutionEvent,
  ): void {
    execution.events.push({
      ...event,
      sequence: execution.nextSequence,
      executionId: execution.id,
      timestamp: new Date(this.#now()).toISOString(),
    } as ProcessSandboxExecutionEvent)
    execution.nextSequence += 1
    while (execution.events.length > execution.maxReplayEvents) {
      execution.events.shift()
      execution.replayTruncated = true
    }
    for (const waiter of [...execution.waiters]) waiter()
  }

  #requestStop(execution: Execution, status: 'cancelled' | 'timed_out'): void {
    if (execution.status !== 'running' || execution.requestedFinalStatus) return
    execution.requestedFinalStatus = status
    execution.child.kill('SIGTERM')
    execution.forceKill = setTimeout(() => {
      if (execution.status === 'running') execution.child.kill('SIGKILL')
    }, this.#killGraceMs)
    execution.forceKill.unref()
  }

  #finish(
    execution: Execution,
    status: Exclude<ProcessSandboxExecutionStatus, 'running'>,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (execution.status !== 'running') return
    if (execution.timeout) clearTimeout(execution.timeout)
    if (execution.forceKill) clearTimeout(execution.forceKill)
    execution.status = status
    execution.finishedAt = new Date(this.#now()).toISOString()
    execution.expiresAt = this.#now() + execution.retentionMs
    this.#lastFinishedAt = execution.finishedAt
    this.#appendEvent(execution, { type: 'finished', status, exitCode, signal })
    const output = execution.outputParts.join('')
      + (execution.outputTruncated ? '\n[output truncated]' : '')
    execution.result = {
      executionId: execution.id,
      status,
      exitCode,
      signal,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      output,
      outputTruncated: execution.outputTruncated,
    }
    execution.resolveResult(execution.result)
  }

  #makeCapacity(): void {
    if (this.#executions.size < this.#maxExecutions) return
    const settled = [...this.#executions.values()]
      .filter((execution) => execution.status !== 'running')
      .sort((left, right) => (left.finishedAt ?? '').localeCompare(right.finishedAt ?? ''))
    while (this.#executions.size >= this.#maxExecutions && settled.length > 0) {
      const execution = settled.shift()
      if (execution) this.#executions.delete(execution.id)
    }
    if (this.#executions.size >= this.#maxExecutions) {
      throw new ProcessSandboxError(
        `Process supervisor is at its ${this.#maxExecutions}-execution capacity.`,
      )
    }
  }
}

function snapshotOf(execution: Execution, afterSequence: number): ProcessSandboxExecutionSnapshot {
  return {
    executionId: execution.id,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    events: execution.events.filter((event) => event.sequence > afterSequence),
    latestSequence: execution.nextSequence - 1,
    replayTruncated:
      execution.replayTruncated
      && (execution.events[0]?.sequence ?? execution.nextSequence) > afterSequence + 1,
    result: execution.result,
  }
}

function cleanExecutionId(value: string): string {
  if (!EXECUTION_ID_PATTERN.test(value)) {
    throw new ProcessSandboxError(
      'executionId must be 1–128 URL-safe letters, numbers, dots, underscores, colons, or hyphens.',
    )
  }
  return value
}

function cleanSequence(value: number): number {
  return nonNegativeInteger(value, 'afterSequence')
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ProcessSandboxError(`${field} must be a positive integer.`)
  }
  return value
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new ProcessSandboxError(`${field} must be a non-negative integer.`)
  }
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
