/** A durable event with the cursor required to continue after it. */
export type CursorEvent<Cursor, Event> = { cursor: Cursor; event: Event }

export interface DurableCursorSource<Cursor, Event> {
  /** Ordered, durable rows strictly after cursor. */
  readAfter(args: {
    cursor: Cursor | null
    limit: number
    signal: AbortSignal
  }): Promise<readonly CursorEvent<Cursor, Event>[]>
  /**
   * Optional low-latency wake signal. It is never the source of truth: callers
   * always return to readAfter, so lost notifications and reconnects are safe.
   */
  waitForWake?(args: { cursor: Cursor | null; signal: AbortSignal }): Promise<void>
}

export type FollowDurableCursorOptions<Cursor, Event> = {
  source: DurableCursorSource<Cursor, Event>
  cursor?: Cursor | null
  batchSize?: number
  pollMs?: number
  retryMinMs?: number
  retryMaxMs?: number
  signal?: AbortSignal
  random?: () => number
}

/**
 * Backfill first, then use push only to shorten the wait until the next
 * backfill. Read failures retry with bounded jitter; cancellation tears down
 * both the poll timer and any active LISTEN/NOTIFY adapter.
 */
export async function* followDurableCursor<Cursor, Event>(
  options: FollowDurableCursorOptions<Cursor, Event>,
): AsyncGenerator<CursorEvent<Cursor, Event>, void, void> {
  const batchSize = positiveInteger(options.batchSize ?? 100, 'batchSize')
  const pollMs = positiveInteger(options.pollMs ?? 1_000, 'pollMs')
  const retryMinMs = positiveInteger(options.retryMinMs ?? 250, 'retryMinMs')
  const retryMaxMs = positiveInteger(options.retryMaxMs ?? 10_000, 'retryMaxMs')
  if (retryMaxMs < retryMinMs) throw new Error('retryMaxMs must be at least retryMinMs.')
  const random = options.random ?? Math.random
  const controller = new AbortController()
  const unlink = forwardAbort(options.signal, controller)
  let cursor: Cursor | null = options.cursor === undefined ? null : options.cursor
  let retryMs = retryMinMs

  try {
    while (!controller.signal.aborted) {
      try {
        let caughtUp = false
        while (!caughtUp && !controller.signal.aborted) {
          const rows = await options.source.readAfter({ cursor, limit: batchSize, signal: controller.signal })
          for (const row of rows) {
            cursor = row.cursor
            yield row
          }
          caughtUp = rows.length < batchSize
        }
        retryMs = retryMinMs
        if (controller.signal.aborted) break
        await waitForWakeOrPoll(options.source, cursor, pollMs, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) break
        const jitter = 0.75 + Math.max(0, Math.min(1, random())) * 0.5
        await delay(Math.round(retryMs * jitter), controller.signal)
        retryMs = Math.min(retryMaxMs, retryMs * 2)
        void error
      }
    }
  } finally {
    controller.abort()
    unlink()
  }
}

async function waitForWakeOrPoll<Cursor, Event>(
  source: DurableCursorSource<Cursor, Event>,
  cursor: Cursor | null,
  pollMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (!source.waitForWake) return delay(pollMs, signal)
  const wakeController = new AbortController()
  const unlink = forwardAbort(signal, wakeController)
  try {
    await Promise.race([
      source.waitForWake({ cursor, signal: wakeController.signal }),
      delay(pollMs, wakeController.signal),
    ])
  } finally {
    wakeController.abort()
    unlink()
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError')
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined
  const abort = () => target.abort(source.reason)
  if (source.aborted) abort()
  else source.addEventListener('abort', abort, { once: true })
  return () => source.removeEventListener('abort', abort)
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`)
  return value
}
