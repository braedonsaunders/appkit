import { ActionError, unexpectedError } from './action-error'
import type { ActionResult } from './read'

/**
 * Handlers for one guarded action. `onStart`/`onSettled` own the busy
 * lifecycle (typically `setBusy(true)` / `setBusy(false)`); `onOk` handles
 * success; `onRefused` presents the refusal (pin + notification).
 */
export interface ActionHandlers<T> {
  onStart?: () => void
  onSettled?: () => void
  onOk?: (data: T) => void
  onRefused?: (error: ActionError) => void
}

/**
 * Run a task to settlement. `onStart` runs first; `onSettled` runs last in
 * a `finally`, so no error path — refusal, rejection, or a throwing handler —
 * can skip the busy reset. A stuck busy state wedges the control it guards:
 * every later click silently dies on the stuck disabled button. The reset is
 * owned here now, not repeated at each call site.
 *
 * A refusal routes to `onRefused`. A task that throws (a bug, not a refusal —
 * `fetchAction` itself never throws) is lifted into an `unexpected`
 * ActionError and routed the same way. When there is no `onRefused` to
 * present to, the error is rethrown: `executeAction` never swallows. An
 * unhandled refusal stays loud — after the busy state has released.
 *
 * The principle: never swallow silently; swallow only into a presentation
 * you can prove exists. `useAction` always has its pin, so absorbing a
 * throw there is correct — a React event handler that rethrows produces an
 * unhandled rejection that helps nobody. Here there may be nowhere to
 * present, so rethrowing is the only honest option.
 *
 * A throw from inside `onOk`/`onRefused` itself propagates untouched (the
 * inner task boundary has already closed), never looping back into
 * presentation.
 */
export async function executeAction<T>(
  task: () => Promise<ActionResult<T>>,
  handlers: ActionHandlers<T> = {},
): Promise<void> {
  handlers.onStart?.()
  try {
    let result: ActionResult<T>
    try {
      result = await task()
    } catch (thrown) {
      if (!handlers.onRefused) throw thrown
      handlers.onRefused(thrown instanceof ActionError ? thrown : unexpectedError(describeThrown(thrown)))
      return
    }
    if (result.ok) {
      handlers.onOk?.(result.data)
    } else if (handlers.onRefused) {
      handlers.onRefused(result.error)
    } else {
      throw result.error
    }
  } finally {
    handlers.onSettled?.()
  }
}

function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) return `${thrown.name}: ${thrown.message}`
  return String(thrown)
}
