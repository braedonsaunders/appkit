'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

export type PromptDialogOptions = {
  title: string
  /** Field label above the input. */
  label?: string
  /** Pre-filled and selected value. */
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type PromptRequest = PromptDialogOptions & {
  id: number
  resolve: (value: string | null) => void
}

let current: PromptRequest | null = null
let counter = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Opens the shared text-input modal and resolves to a trimmed value or null. */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null)
    current = { ...options, id: ++counter, resolve }
    emit()
  })
}

/** Cancels the active prompt, if one exists. */
export function cancelPromptDialog() {
  settle(null)
}

function settle(value: string | null) {
  const request = current
  if (!request) return
  current = null
  request.resolve(value)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Mount once beside the application's toaster. */
export function PromptRoot({
  defaultConfirmLabel = 'Save',
  defaultCancelLabel = 'Cancel',
}: {
  defaultConfirmLabel?: string
  defaultCancelLabel?: string
}) {
  const request = React.useSyncExternalStore(subscribe, () => current, () => null)
  const [value, setValue] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const titleId = React.useId()
  const inputId = React.useId()

  React.useEffect(() => {
    if (!request) return
    setValue(request.initialValue ?? '')
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const focusable =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        settle(null)
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusable)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]!
      const last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [request?.id])

  if (typeof document === 'undefined') return null

  function submit() {
    const trimmed = value.trim()
    settle(trimmed || null)
  }

  return createPortal(
    <AnimatePresence>
      {request ? (
        <div
          key={request.id}
          data-ui-overlay="prompt"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/50 backdrop-blur-[2px]"
            onClick={() => settle(null)}
            aria-hidden="true"
          />
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340, mass: 0.7 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <div className="space-y-3 p-6">
                <h2 id={titleId} className="text-base font-semibold text-fg">
                  {request.title}
                </h2>
                {request.label ? (
                  <Label htmlFor={inputId} className="text-xs text-fg-muted">
                    {request.label}
                  </Label>
                ) : null}
                <Input
                  id={inputId}
                  ref={inputRef}
                  value={value}
                  placeholder={request.placeholder}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle px-6 py-4">
                <Button type="button" variant="outline" onClick={() => settle(null)}>
                  {request.cancelLabel ?? defaultCancelLabel}
                </Button>
                <Button type="submit" disabled={!value.trim()}>
                  {request.confirmLabel ?? defaultConfirmLabel}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
