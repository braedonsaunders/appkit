// The one vocabulary for "the user did something and the server said no".
//
// Action endpoints in an AppKit app refuse with a shared body shape —
// `{ error }`, optionally with a stable `code` and an `issues` array for
// field-level failures — and a status that already names the refusal class.
// Callers read the kind off this type, never by parsing a message string.
// Message strings are human language written for the person looking at the
// screen; they are evidence for the user, not a protocol for the code.

/**
 * Why an action did not happen. The mapping from HTTP status is total and
 * lives in {@link kindForStatus} next to this type, so it cannot drift.
 *
 * - `validation`: the request itself was malformed (400 et al). Often carries
 *   `issues` naming the offending fields.
 * - `denied`: not authenticated or not permitted (401/403). The fix is
 *   credentials or permission, never retrying the same click.
 * - `not-found`: the target is gone (404/410). Refresh, do not retry.
 * - `conflict`: someone else changed the record first — revision and
 *   compare-and-swap mismatches, duplicate-name races (409). The fix is
 *   reload-and-merge.
 * - `refused`: a well-formed, permitted request the domain rules rejected
 *   (422). The server message names the path forward; show it verbatim.
 * - `transport`: no usable response ever arrived — network down, aborted,
 *   DNS or proxy failure. There is no server message; only the caller
 *   fallback can render.
 * - `unexpected`: a response arrived that names no known refusal class
 *   (5xx, unknown statuses). Detail goes to the log, never to the screen.
 */
export type ErrorKind =
  | 'validation'
  | 'denied'
  | 'not-found'
  | 'conflict'
  | 'refused'
  | 'transport'
  | 'unexpected'

/**
 * Classify a response status. Transport failures never reach this function —
 * without a status there is nothing to classify, and those are always
 * `transport`. Everything unlisted is `unexpected` by construction, so a new
 * status code fails closed into the generic path instead of crashing a
 * switch.
 */
export function kindForStatus(status: number): Exclude<ErrorKind, 'transport'> {
  if (status === 400 || status === 413 || status === 415) return 'validation'
  if (status === 401 || status === 403) return 'denied'
  if (status === 404 || status === 410) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'refused'
  return 'unexpected'
}
