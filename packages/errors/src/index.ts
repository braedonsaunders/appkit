// Universal action-error handling: the typed taxonomy, the read path that
// cannot throw, and the lifecycle that always releases. Framework-free —
// no React, no notification library, no copy of its own. React presentation
// lives in `@braedonsaunders/appkit-errors/react`.

export { kindForStatus, type ErrorKind } from './kinds'
export {
  ActionError,
  classifiedError,
  isActionError,
  transportError,
  unexpectedError,
  type ActionErrorInit,
  type FieldIssue,
} from './action-error'
export { isTechnicalText, redactInternalIds, toDisplayMessage } from './sanitize'
export { readActionResult, type ActionResult, type ResponseLike } from './read'
export { fetchAction } from './fetch'
export { executeAction, type ActionHandlers } from './lifecycle'
