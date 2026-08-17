/**
 * Durable execution mechanics shared by workers that may be delivered the
 * same job more than once. Persistence remains application-owned so tenancy,
 * RLS, and domain lifecycle rules stay at the database boundary.
 */

export type ExecutionLease = {
  runId: string
  attemptId: string
  owner: string
  fence: number
  expiresAt: Date
}

export type ClaimExecutionLeaseInput = {
  runId: string
  owner: string
  leaseMs: number
  now: Date
}

export interface ExecutionLeaseStore {
  /** Atomically claim an eligible run and create its attempt. */
  claim(input: ClaimExecutionLeaseInput): Promise<ExecutionLease | null>
  /** Renew only when owner + fence still match. Null means ownership is gone. */
  renew(lease: ExecutionLease, input: { leaseMs: number; now: Date }): Promise<ExecutionLease | null>
}

export class ExecutionLeaseUnavailableError extends Error {
  override readonly name = 'ExecutionLeaseUnavailableError'

  constructor(readonly runId: string) {
    super(`Run ${runId} is not eligible for this worker to claim.`)
  }
}

export class ExecutionLeaseLostError extends Error {
  override readonly name = 'ExecutionLeaseLostError'

  constructor(readonly lease: ExecutionLease) {
    super(`Run ${lease.runId} lost execution fence ${lease.fence}.`)
  }
}

export type FencedExecutionContext = {
  lease: ExecutionLease
  signal: AbortSignal
}

export type RunWithFencedLeaseOptions<T> = {
  store: ExecutionLeaseStore
  runId: string
  owner: string
  leaseMs?: number
  heartbeatMs?: number
  signal?: AbortSignal
  now?: () => Date
  execute: (context: FencedExecutionContext) => Promise<T>
  /**
   * Commit the terminal domain transition with owner + fence in its WHERE
   * clause. False means another attempt owns the run and this result is stale.
   */
  commit: (lease: ExecutionLease, result: T) => Promise<boolean>
  /** Best-effort failure evidence, also guarded by owner + fence. */
  fail?: (lease: ExecutionLease, error: unknown) => Promise<boolean>
}

const DEFAULT_LEASE_MS = 60_000

/**
 * Claim, heartbeat, abort on ownership loss, and fence the terminal commit.
 * The store is the authority: timers are only how quickly this process learns
 * that it is no longer allowed to act.
 */
export async function runWithFencedLease<T>(options: RunWithFencedLeaseOptions<T>): Promise<T> {
  const now = options.now ?? (() => new Date())
  const leaseMs = positiveDuration(options.leaseMs ?? DEFAULT_LEASE_MS, 'leaseMs')
  const heartbeatMs = positiveDuration(
    options.heartbeatMs ?? Math.max(1_000, Math.floor(leaseMs / 3)),
    'heartbeatMs',
  )
  if (heartbeatMs >= leaseMs) throw new Error('heartbeatMs must be shorter than leaseMs.')

  const claimed = await options.store.claim({
    runId: options.runId,
    owner: options.owner,
    leaseMs,
    now: now(),
  })
  if (!claimed) throw new ExecutionLeaseUnavailableError(options.runId)
  let lease: ExecutionLease = claimed

  const controller = new AbortController()
  let leaseLost: ExecutionLeaseLostError | null = null
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const unlink = forwardAbort(options.signal, controller)

  const heartbeat = async (): Promise<void> => {
    if (stopped || controller.signal.aborted) return
    try {
      const renewed = await options.store.renew(lease, { leaseMs, now: now() })
      if (!renewed) {
        leaseLost = new ExecutionLeaseLostError(lease)
        controller.abort(leaseLost)
        return
      }
      lease = renewed
    } catch (error) {
      // A failed renewal has unknown ownership. Fail closed rather than let a
      // worker keep acting through a database outage.
      leaseLost = new ExecutionLeaseLostError(lease)
      controller.abort(error instanceof Error ? error : leaseLost)
      return
    }
    if (!stopped) timer = setTimeout(() => void heartbeat(), heartbeatMs)
  }
  timer = setTimeout(() => void heartbeat(), heartbeatMs)

  try {
    const result = await options.execute({ lease, signal: controller.signal })
    if (leaseLost) throw leaseLost
    throwIfAborted(controller.signal)
    if (!(await options.commit(lease, result))) {
      throw new ExecutionLeaseLostError(lease)
    }
    return result
  } catch (error) {
    if (!leaseLost && options.fail) await options.fail(lease, error).catch(() => false)
    throw leaseLost ?? error
  } finally {
    stopped = true
    if (timer) clearTimeout(timer)
    unlink()
  }
}

export type ExternalEffectIntent<Request = unknown> = {
  tenantId: string
  runId: string
  attemptId: string
  kind: string
  idempotencyKey: string
  request: Request
  at: Date
}

export type ExternalEffectClaim<Result = unknown> =
  | { disposition: 'execute'; effectId: string; retry: boolean }
  | { disposition: 'completed'; effectId: string; result: Result }
  | { disposition: 'uncertain'; effectId: string; reason: string }

export type ExternalEffectEvent<Result = unknown> =
  | { kind: 'retry_started'; at: Date; detail?: unknown }
  | { kind: 'completed'; at: Date; result: Result }
  | { kind: 'failed'; at: Date; error: unknown }
  | { kind: 'ambiguous'; at: Date; error: unknown }
  | { kind: 'reconciled'; at: Date; result: Result; detail?: unknown }

export interface ExternalEffectStore<Request = unknown, Result = unknown> {
  /**
   * Atomically inserts the immutable intent or resolves the existing intent
   * and its append-only events under (tenant, idempotency key).
   */
  claim(intent: ExternalEffectIntent<Request>): Promise<ExternalEffectClaim<Result>>
  append(effectId: string, event: ExternalEffectEvent<Result>): Promise<void>
}

export class ExternalEffectUncertainError extends Error {
  override readonly name = 'ExternalEffectUncertainError'

  constructor(readonly effectId: string, message: string) {
    super(message)
  }
}

export class ExternalEffectAmbiguousError extends Error {
  override readonly name = 'ExternalEffectAmbiguousError'
}

export type ExecuteExternalEffectOptions<Request, Result> = {
  store: ExternalEffectStore<Request, Result>
  intent: Omit<ExternalEffectIntent<Request>, 'at'> & { at?: Date }
  retry?: 'never' | 'safe'
  signal?: AbortSignal
  now?: () => Date
  sanitize?: (value: unknown) => unknown
  classifyError?: (error: unknown) => 'failed' | 'ambiguous'
  execute: (signal: AbortSignal) => Promise<Result>
}

/**
 * Intend before acting. A prior completion is replayed, while an unresolved
 * intent blocks unless the caller explicitly proves the operation safe to
 * repeat. Every outcome is a new event; the intent and its history never
 * mutate.
 */
export async function executeExternalEffect<Request, Result>(
  options: ExecuteExternalEffectOptions<Request, Result>,
): Promise<Result> {
  const now = options.now ?? (() => new Date())
  const sanitize = options.sanitize ?? ((value: unknown) => value)
  const controller = new AbortController()
  const unlink = forwardAbort(options.signal, controller)
  const intent: ExternalEffectIntent<Request> = {
    ...options.intent,
    request: sanitize(options.intent.request) as Request,
    at: options.intent.at ?? now(),
  }

  try {
    const claim = await options.store.claim(intent)
    if (claim.disposition === 'completed') return claim.result
    if (claim.disposition === 'uncertain' && options.retry !== 'safe') {
      throw new ExternalEffectUncertainError(claim.effectId, claim.reason)
    }
    const effectId = claim.effectId
    if (claim.disposition === 'uncertain' || claim.retry) {
      await options.store.append(effectId, { kind: 'retry_started', at: now() })
    }
    throwIfAborted(controller.signal)
    try {
      const result = await options.execute(controller.signal)
      await options.store.append(effectId, {
        kind: claim.disposition === 'uncertain' ? 'reconciled' : 'completed',
        at: now(),
        result: sanitize(result) as Result,
      })
      return result
    } catch (error) {
      const kind = options.classifyError?.(error)
        ?? (error instanceof ExternalEffectAmbiguousError || controller.signal.aborted
          ? 'ambiguous'
          : 'failed')
      await options.store.append(effectId, { kind, at: now(), error: sanitize(errorMessage(error)) })
      throw error
    }
  } finally {
    unlink()
  }
}

function positiveDuration(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a positive duration.`)
  return Math.trunc(value)
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined
  const abort = () => target.abort(source.reason)
  if (source.aborted) abort()
  else source.addEventListener('abort', abort, { once: true })
  return () => source.removeEventListener('abort', abort)
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('The operation was aborted.', 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
