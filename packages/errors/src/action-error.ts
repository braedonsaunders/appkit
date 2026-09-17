import { kindForStatus, type ErrorKind } from './kinds'
import { toDisplayMessage } from './sanitize'

/** One field-level failure from a 400 body (`{ error, issues }`). */
export interface FieldIssue {
  path: string
  message: string
}

export interface ActionErrorInit {
  kind: ErrorKind
  /** HTTP status when there was a response; absent for transport failures. */
  status?: number
  /** Stable machine code when the server sent one. Map it to host copy —
  // never branch on message text. */
  code?: string
  /** Field-level failures, when the server itemized them. */
  issues?: FieldIssue[]
  /** The server's already-human reason, shown verbatim when usable. Null
  // when there is nothing safe to show (transport, 5xx, proxy HTML). */
  serverMessage?: string | null
  /** True when the request was deliberately aborted (timeout/cancel). */
  aborted?: boolean
  /** Diagnostic detail for the log. Never rendered — fetch internals and
  // driver text live here, not on screen. */
  detail?: string
}

/**
 * A refused action, classified. Thrown by nothing, returned by everything:
 * `readActionResult` and `fetchAction` yield it inside `ActionResult`, and
 * `executeAction` routes it to `onRefused`. Use `kind`/`code`/`issues` to
 * decide what to do; use `displayMessage(fallback)` to decide what to show.
 */
export class ActionError extends Error {
  readonly kind: ErrorKind
  readonly status?: number
  readonly code?: string
  readonly issues: FieldIssue[]
  readonly serverMessage: string | null
  readonly aborted: boolean
  readonly detail?: string

  constructor(init: ActionErrorInit) {
    super(init.serverMessage ?? init.detail ?? init.code ?? init.kind)
    this.name = 'ActionError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.issues = init.issues ?? []
    this.serverMessage = init.serverMessage ?? null
    this.aborted = init.aborted ?? false
    this.detail = init.detail
  }

  /**
   * What the user reads. The server reason verbatim when it is human;
   * otherwise the caller's localized fallback. Internal ids are redacted;
   * SQL, stacks and driver text never survive this call.
   */
  displayMessage(fallback: string): string {
    return toDisplayMessage(this.serverMessage, fallback)
  }
}

export function isActionError(value: unknown): value is ActionError {
  return value instanceof ActionError
}

/** The transport refusal: the request never got an answer. `aborted`
// distinguishes a deliberate cancel/timeout from a dead network. */
export function transportError(detail: string, aborted = false): ActionError {
  return new ActionError({ kind: 'transport', aborted, detail })
}

/** Lift a thrown programmer error into the vocabulary so even a bug renders
// instead of wedging. The bug text stays in `detail`, never on screen. */
export function unexpectedError(detail: string): ActionError {
  return new ActionError({ kind: 'unexpected', detail })
}

/** Classify a refusal status for a body that carried no usable message. */
export function classifiedError(status: number, code?: string): ActionError {
  return new ActionError({ kind: kindForStatus(status), status, code })
}
