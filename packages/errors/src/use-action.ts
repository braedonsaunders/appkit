'use client'

import { useCallback, useState } from 'react'
import { executeAction } from './index'
import type { ActionError, ActionResult } from './index'

/** Notification wiring. The package never imports a notification library:
// the host passes its own (a toast `error`/`success` pair, a live region,
// or nothing), so copy, timing and placement stay with the app. */
export interface UseActionOptions {
  notifyError?: (message: string) => void
  notifySuccess?: (message: string) => void
  /**
   * Where `unexpected` refusals and transport detail go. Defaults to
   * `console.error` and is default-on, not opt-in: a host that forgets to
   * wire it must still be able to find the bug. Override with the host's
   * real error reporting (which may sample or filter routine transport
   * failures); the package keeps its half of "detail goes to the log,
   * never to the screen."
   */
  reportError?: (error: ActionError) => void
}

/** The default reporter: loud in the console a developer already has open. */
function defaultReportError(error: ActionError): void {
  console.error(`[appkit-errors] ${error.kind} action failure`, error.detail ?? error)
}

/** Per-execution options. `fallbackMessage` is required — a refusal with no
// usable server reason must still say something, and that something must be
// localized, so the type system asks for the host render, not a literal. */
export interface ExecuteOptions<T> {
  fallbackMessage: string
  successMessage?: string
  onOk?: (data: T) => void
  onRefused?: (error: ActionError) => void
}

/**
 * The busy lifecycle and the pinned refusal for one action surface (a
 * drawer, a row, a dialog). `execute` clears the previous refusal, runs the
 * task to settlement, pins the new refusal beside the record until the next
 * action, and always releases `busy` — the caller cannot skip the reset
 * because the caller never writes it.
 *
 * Returns true on success, false on refusal. A task that throws (a bug, not
 * a refusal — `fetchAction` itself never throws) still releases `busy` and
 * is presented as an `unexpected` refusal: pinned, notified with the
 * fallback, and handed to `onRefused` with the bug text in `detail`. A throw
 * from inside `onOk`/`onRefused` itself is host code and propagates
 * untouched.
 */
export function useAction({ notifyError, notifySuccess, reportError = defaultReportError }: UseActionOptions = {}) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ActionError | null>(null)

  const clearRefusal = useCallback(() => setRefusal(null), [])

  const execute = useCallback(
    async <T>(task: () => Promise<ActionResult<T>>, options: ExecuteOptions<T>): Promise<boolean> => {
      let succeeded = false
      await executeAction(task, {
        onStart: () => {
          setBusy(true)
          setRefusal(null)
        },
        onSettled: () => setBusy(false),
        onOk: (data) => {
          succeeded = true
          if (options.successMessage !== undefined) notifySuccess?.(options.successMessage)
          options.onOk?.(data)
        },
        onRefused: (error) => {
          setRefusal(error)
          // The pin shows the user something; the report keeps the detail
          // findable. Only the log-worthy kinds report — a refused or
          // denied action is routine, an unexpected or transport failure
          // is evidence.
          if (error.kind === 'unexpected' || error.kind === 'transport') reportError(error)
          notifyError?.(error.displayMessage(options.fallbackMessage))
          options.onRefused?.(error)
        },
      })
      return succeeded
    },
    [notifyError, notifySuccess, reportError],
  )

  return { busy, refusal, execute, clearRefusal, setRefusal }
}
