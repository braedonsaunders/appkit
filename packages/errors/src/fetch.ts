import { transportError } from './action-error'
import { readActionResult, type ActionResult } from './read'

function isAbort(thrown: unknown): boolean {
  return thrown instanceof DOMException && thrown.name === 'AbortError'
}

/**
 * `fetch` plus the read, as one step that cannot throw. A rejected fetch —
 * dead network, DNS, refused connection, an aborted timeout — becomes a
 * `transport` refusal (with `aborted` set for deliberate cancels) instead
 * of an unhandled rejection past the busy reset. A resolved fetch goes
 * through {@link readActionResult}.
 *
 * There is no success/error callback here and no notification: presentation
 * belongs to the caller (`useAction` wires it), so this stays usable from
 * workers and non-React code.
 */
export async function fetchAction<T = unknown>(url: string, init?: RequestInit): Promise<ActionResult<T>> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (thrown) {
    const detail = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)
    return { ok: false, error: transportError(detail, isAbort(thrown)) }
  }
  return readActionResult<T>(response)
}
