import { ActionError, type FieldIssue } from './action-error'
import { kindForStatus } from './kinds'

/** A finished action read. `ok: true` carries the decoded body (possibly
// null for empty responses); `ok: false` carries the classified refusal. */
export type ActionResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: ActionError }

/** The only surface of `Response` this package touches, so routes, workers
// and tests can all feed it. Note what is absent: no `text()`, no headers,
// no streaming — reading is one JSON decode that cannot throw. */
export interface ResponseLike {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** First usable string under any of the keys. `error` is the contract;
// `message` is the escape hatch for endpoints that speak it. */
function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** The `issues` array of a 400 body, defensively decoded: malformed entries
// are dropped, a non-array is no issues at all. Never throws. */
function readIssues(record: Record<string, unknown> | null): FieldIssue[] {
  const raw = record?.['issues']
  if (!Array.isArray(raw)) return []
  const issues: FieldIssue[] = []
  for (const entry of raw) {
    const item = asRecord(entry)
    if (item && typeof item['path'] === 'string' && typeof item['message'] === 'string') {
      issues.push({ path: item['path'], message: item['message'] })
    }
  }
  return issues
}

/**
 * The only way anyone reads an action response. It cannot throw: a
 * non-JSON body (proxy error page, empty response, truncated stream)
 * decodes to a messageless refusal classified by status instead of escaping
 * past the notification and wedging the button.
 *
 * Success trusts the status, not the body — an `ok` response with an
 * `error` key is still success. Refusals keep every machine-readable
 * field the server sent (`code`, `issues`) and the human `error` verbatim
 * for display.
 */
export async function readActionResult<T = unknown>(response: ResponseLike): Promise<ActionResult<T>> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (response.ok) return { ok: true, status: response.status, data: body as T }
  const record = asRecord(body)
  return {
    ok: false,
    error: new ActionError({
      kind: kindForStatus(response.status),
      status: response.status,
      code: firstString(record, ['code']) ?? undefined,
      issues: readIssues(record),
      serverMessage: firstString(record, ['error', 'message']),
    }),
  }
}
