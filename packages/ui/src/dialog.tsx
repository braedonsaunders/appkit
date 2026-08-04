'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from './utils'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  // Working dialogs — an editor with its own sidebar, a two-pane review — need
  // more width than a confirm prompt.
  xl: 'max-w-5xl',
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
  /**
   * Give the panel a fixed working height and hand the body to the consumer as
   * a flex region with no padding. Use it when the content owns its own
   * toolbar/scroll/columns (an editor, a review pane) rather than being a short
   * block of prose — otherwise the dialog grows with its content and the page
   * behind it scrolls instead.
   */
  fullHeight?: boolean
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
  fullHeight,
}: DialogProps) {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
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
      // React's autoFocus may already have placed focus inside the dialog.
      // Do not steal it, and prefer an explicit autofocus target before the
      // first DOM-order control (which is often the corner close button).
      if (panel.contains(document.activeElement)) return
      const preferred = panel.querySelector<HTMLElement>('[autofocus]')
      const first = panel.querySelector<HTMLElement>(focusablesSelector)
      ;(preferred ?? first ?? panel).focus()
    }, 0)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.querySelector('[data-ui-overlay]')) return
        onCloseRef.current()
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
  }, [open])

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
              fullHeight && 'h-[min(92vh,780px)]',
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
            {children ? (
              <div
                className={cn(
                  'text-sm text-fg',
                  fullHeight ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'px-6 py-5',
                )}
              >
                {children}
              </div>
            ) : null}
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
