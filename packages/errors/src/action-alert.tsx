'use client'

import { Alert, AlertDescription, AlertTitle } from '@braedonsaunders/appkit-ui'
import type { ActionError } from './index'

export interface ActionAlertProps {
  /** The pinned refusal. Null renders nothing — the alert only exists while
  // a refusal is pinned to the record. */
  error: ActionError | null
  /** Localized fallback when the server sent nothing usable. Required: the
  // alert must never render an empty box. */
  fallbackMessage: string
  /** Optional heading above the message. No built-in copy: the package
  // authors no user-facing strings. */
  title?: string
  /** Dismiss affordance. Both or neither: a button with no accessible name
  // is worse than no button, and a label with no handler is a lie. */
  dismissLabel?: string
  onDismiss?: () => void
  className?: string
}

/**
 * The one persistent refusal surface. Notifications dismiss; this pins
 * beside the record until the next action clears it, so a refused action
 * can never read as "nothing happened". Built on the house `Alert` (which
 * already carries `role="alert"`), destructive variant.
 *
 * Field-level `issues` from a 400 render as a list under the message —
 * server reasons surface as-is, exactly as the endpoint returned them.
 */
export function ActionAlert({ error, fallbackMessage, title, dismissLabel, onDismiss, className }: ActionAlertProps) {
  if (!error) return null
  const showDismiss = onDismiss !== undefined && dismissLabel !== undefined
  return (
    <Alert variant="destructive" className={className}>
      {title !== undefined ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>
        <p>{error.displayMessage(fallbackMessage)}</p>
        {error.issues.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {error.issues.map((issue) => (
              <li key={issue.path || issue.message}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
      {showDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="absolute top-2 right-2 rounded p-1 text-current opacity-60 transition-opacity hover:opacity-100"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </Alert>
  )
}
