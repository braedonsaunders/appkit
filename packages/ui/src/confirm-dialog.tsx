'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from './button'

export type ConfirmTone = 'default' | 'danger'

export type ConfirmDialogOptions = {
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type Request = ConfirmDialogOptions & { id: number; resolve: (confirmed: boolean) => void }

let current: Request | null = null
let counter = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Promise-based, application-wide replacement for `window.confirm()`. */
export function confirmDialog(options: string | ConfirmDialogOptions): Promise<boolean> {
  const request = typeof options === 'string' ? { message: options } : options
  return new Promise<boolean>((resolve) => {
    if (current) current.resolve(false)
    current = { ...request, id: ++counter, resolve }
    emit()
  })
}

export function cancelConfirmDialog() {
  settle(false)
}

function settle(confirmed: boolean) {
  if (!current) return
  current.resolve(confirmed)
  current = null
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type ConfirmRootProps = {
  labels?: {
    defaultTitle?: string
    dangerTitle?: string
    confirm?: string
    cancel?: string
  }
}

/** Mount once near the root of an application that calls `confirmDialog`. */
export function ConfirmRoot({ labels = {} }: ConfirmRootProps) {
  const request = React.useSyncExternalStore(subscribe, () => current, () => null)

  React.useEffect(() => {
    if (!request) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') settle(false)
      if (event.key === 'Enter') settle(true)
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [request])

  if (typeof document === 'undefined') return null

  const danger = request?.tone === 'danger'
  const title = request?.title ?? (danger ? labels.dangerTitle ?? 'Are you sure?' : labels.defaultTitle ?? 'Confirm')
  const confirmLabel = request?.confirmLabel ?? labels.confirm ?? 'Confirm'
  const cancelLabel = request?.cancelLabel ?? labels.cancel ?? 'Cancel'

  return createPortal(
    <AnimatePresence>
      {request ? (
        <div key={request.id} className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="appkit-confirm-title">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            onClick={() => settle(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340, mass: 0.7 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="flex items-start gap-4 p-6">
              <div className={danger ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger' : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info'}>
                {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
              </div>
              <div className="min-w-0 space-y-1.5 pt-0.5">
                <h2 id="appkit-confirm-title" className="text-base font-semibold text-fg">{title}</h2>
                <div className="text-sm leading-relaxed text-fg-muted">{request.message}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle px-6 py-4">
              <Button variant="outline" onClick={() => settle(false)}>{cancelLabel}</Button>
              <Button autoFocus variant={danger ? 'destructive' : 'default'} onClick={() => settle(true)}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
