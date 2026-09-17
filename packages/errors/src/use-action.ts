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
export function useAction({ notifyError, notifySuccess }: UseActionOptions = {}) {
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
          notifyError?.(error.displayMessage(options.fallbackMessage))
          options.onRefused?.(error)
        },
      })
      return succeeded
    },
    [notifyError, notifySuccess],
  )

  return { busy, refusal, execute, clearRefusal, setRefusal }
}
