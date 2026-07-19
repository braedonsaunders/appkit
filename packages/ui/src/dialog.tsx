'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from './utils'

export type DialogSize = 'sm' | 'md' | 'lg'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export type DialogProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: DialogSize
  /** Hide the corner close button. */
  hideClose?: boolean
  closeLabel?: string
}

/** Centered modal dialog: backdrop, spring scale-in, focus trap, Esc/click-out. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideClose,
  closeLabel = 'Close',
}: DialogProps) {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusablesSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(focusablesSelector)
      ;(first ?? panel).focus()
    }, 0)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.querySelector('[data-ui-overlay]')) return
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusablesSelector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const activeEl = document.activeElement
      if (e.shiftKey && (activeEl === first || activeEl === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open, onClose])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.7 }}
            className={cn(
              'relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg',
              SIZE[size],
            )}
          >
            {title || description ? (
              <div className="space-y-1 px-6 pt-6">
                {title ? <h2 className="text-lg font-semibold text-fg">{title}</h2> : null}
                {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
              </div>
            ) : null}
            {!hideClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="absolute right-4 top-4 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <X className="size-4" />
              </button>
            ) : null}
            {children ? <div className="px-6 py-5 text-sm text-fg">{children}</div> : null}
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-6 py-3">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
