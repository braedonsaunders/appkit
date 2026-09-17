// The patterns that mark a server string as machine exhaust rather than a
// human reason. A raw statement or stack frame must never render into a
// page; driver text, stack frames and internal ids never reach a user.
//
// The list is deliberately conservative: an unrecognized string renders
// verbatim. A suppressed-but-actionable refusal reads as a dead button, and
// a dead button reads as work that happened when it did not — the worse
// failure by far. Only patterns that cannot plausibly be a human sentence
// are suppressed.

/** A statement-shaped SQL fragment: must LEAD the string. A bare "select …
// from" in the middle of a sentence ("select a value from the list") is
// human language, so contains-matching is forbidden here. */
const LEADING_SQL =
  /^\s*\(?\s*(insert\s+into|select\s+[\s\S]*\sfrom|update\s+\S+\s+set|delete\s+from|create\s+table|alter\s+table|drop\s+table|with\s+\S+\s+as\s*\()/i

/** Unmistakable database and network driver fingerprints. Each is driver
// vocabulary no human sentence contains; each is covered by a unit test. */
const DRIVER_FINGERPRINTS = [
  /duplicate key value violates unique constraint/i,
  /violates (foreign key|not-null|check) constraint/i,
  /relation ".*" does not exist/i,
  /column ".*" of relation ".*" does not exist/i,
  /syntax error at or near/i,
  /current transaction is aborted/i,
  /invalid input syntax for type/i,
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i,
]

/** A V8 stack frame. The `file:line:col` shape is what distinguishes it
// from prose that merely mentions the word "at". */
const STACK_FRAME = /\bat\s+[^\s()]+ \([^()]*:\d+:\d+\)/

/** Internal entity ids. People act on record names and numbers, never ids. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * True when the string is machine exhaust — SQL, a stack trace, or driver
 * text — and must be replaced by the caller's localized fallback. Anything
 * else returns false: unknown text renders verbatim.
 */
export function isTechnicalText(text: string): boolean {
  if (LEADING_SQL.test(text)) return true
  if (STACK_FRAME.test(text)) return true
  return DRIVER_FINGERPRINTS.some((pattern) => pattern.test(text))
}

/** Replace internal ids with an ellipsis. Record names, numbers and dates
// pass through untouched — only uuid-shaped tokens are cut. */
export function redactInternalIds(text: string): string {
  return text.replace(UUID, '…')
}

/**
 * The one decision for what the user reads. A usable server reason renders
 * verbatim (it is already human, in the user's context); anything else —
 * missing, blank, or technical — renders the caller's localized fallback.
 * The package authors no copy of its own, so every string on screen comes
 * from the host app's catalogs or from the server that refused.
 */
export function toDisplayMessage(serverMessage: unknown, fallback: string): string {
  if (typeof serverMessage !== 'string') return fallback
  const trimmed = serverMessage.trim()
  if (!trimmed || isTechnicalText(trimmed)) return fallback
  return redactInternalIds(trimmed)
}
