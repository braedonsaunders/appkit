'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from './utils'

// Z-INDEX SCALE (single source of truth for the ecosystem)
//
//   sidebar      : z-10
//   header       : z-20
//   sticky-bars  : z-30
//   dropdowns    : z-40
//   drawer       : z-50   (stacked/nested: z-[55])
//   floating UI  : z-[60] — Popover, Select dropdown, confirm dialog
//   toast        : z-70
//
// The drawer's top edge is `--drawer-top` (default 0). An app shell sets it to
// its header height so drawers sit beneath the persistent header:
//   :root { --drawer-top: 3.5rem; }

export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
export type DrawerSide = 'left' | 'right'

const SIZE_CLASS: Record<DrawerSize, string> = {
  sm: 'w-full sm:max-w-md',
  md: 'w-full sm:max-w-xl',
  lg: 'w-full sm:max-w-2xl',
  xl: 'w-full sm:max-w-4xl',
  '2xl': 'w-full sm:max-w-6xl',
  full: 'w-full',
}

// --- Injectable labels ------------------------------------------------------
// appkit is i18n-agnostic. Apps wrap their tree in <DrawerTextProvider> to map
// these to next-intl / their own dictionary; standalone use gets English.
// `translate` supports message-key titles while remaining a pass-through for
// raw ReactNode titles.
export type DrawerText = {
  close: string
  fullscreen: string
  exitFullscreen: string
  translate?: (key: string) => string
}

const DEFAULT_DRAWER_TEXT: DrawerText = {
  close: 'Close',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
}

const DrawerTextContext = React.createContext<DrawerText>(DEFAULT_DRAWER_TEXT)

export function DrawerTextProvider({
  value,
  children,
}: {
  value: Partial<DrawerText>
  children: React.ReactNode
}) {
  const merged = React.useMemo(() => ({ ...DEFAULT_DRAWER_TEXT, ...value }), [value])
  return <DrawerTextContext.Provider value={merged}>{children}</DrawerTextContext.Provider>
}

function useDrawerText(): DrawerText {
  return React.useContext(DrawerTextContext)
}

// Ref-counted scroll lock — nested/stacked drawers share one lock so the body
// only unlocks when the last drawer closes.
let openDrawerCount = 0
let originalBodyOverflow: string | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type DrawerProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  size?: DrawerSize
  side?: DrawerSide
  children: React.ReactNode
  footer?: React.ReactNode
  /** Primary action buttons pinned into the header, before the close button. */
  headerActions?: React.ReactNode
  /** Record-detail navigation rendered directly below the title header. */
  subtabs?: React.ReactNode
  /** Override the body wrapper classes (default: scroll + px-6 py-5). */
  bodyClassName?: string
  /** Extra classes for the panel (e.g. record-type tinting). */
  panelClassName?: string
  /** Raise above another open drawer in a deliberate nested flow. */
  stacked?: boolean
  /** Open at full viewport width; the user can still collapse it. */
  initialFullscreen?: boolean
  /** Hide the fullscreen expand/collapse affordance. */
  disableFullscreen?: boolean
  /** Fires after the exit animation completes (UrlDrawer defers navigation). */
  onExitComplete?: () => void
}

/**
 * Slide-in flyout for sub-entity create/edit and detail views. Portals to body;
 * spring slide-in; backdrop fade+blur; Esc + click-out + ref-counted scroll
 * lock; focus trap + restore; a NetSuite-style expand/collapse to full viewport
 * width (animated via max-width). Fully tokenized and reduced-motion aware.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = 'md',
  side = 'right',
  children,
  footer,
  headerActions,
  subtabs,
  bodyClassName,
  panelClassName,
  stacked = false,
  initialFullscreen = false,
  disableFullscreen = false,
  onExitComplete,
}: DrawerProps) {
  const text = useDrawerText()
  const tr = text.translate ?? ((s: string) => s)
  const reduce = useReducedMotion()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const [fullscreen, setFullscreen] = React.useState(initialFullscreen)
  React.useEffect(() => {
    if (!open) setFullscreen(initialFullscreen)
  }, [initialFullscreen, open])

  const panelRef = React.useRef<HTMLElement>(null)

  // Esc + scroll lock. Stacked-aware: a base drawer ignores Esc while a nested
  // drawer or a floating overlay is on top.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (document.querySelector('[data-ui-overlay]')) return
      if (!stacked && document.querySelector('[data-drawer-layer="nested"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    if (openDrawerCount === 0) originalBodyOverflow = document.body.style.overflow
    openDrawerCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      openDrawerCount = Math.max(0, openDrawerCount - 1)
      if (openDrawerCount === 0) {
        document.body.style.overflow = originalBodyOverflow ?? ''
        originalBodyOverflow = null
      }
    }
  }, [open, onClose, stacked])

  // Focus management: move focus in on open, trap Tab, restore on close.
  React.useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      if (!stacked && document.querySelector('[data-drawer-layer="nested"]')) return
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    }, 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (!stacked && document.querySelector('[data-drawer-layer="nested"]')) return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const firstEl = focusables[0]!
      const lastEl = focusables[focusables.length - 1]!
      const activeEl = document.activeElement
      if (e.shiftKey) {
        if (activeEl === firstEl || activeEl === panel || !panel.contains(activeEl)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (activeEl === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open, stacked])

  if (typeof document === 'undefined') return null

  const offscreen = side === 'left' ? '-100%' : '100%'
  const panelMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { x: offscreen },
        animate: { x: 0 },
        exit: { x: offscreen },
        transition: { type: 'spring' as const, damping: 32, stiffness: 320, mass: 0.8 },
      }

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {mounted && open ? (
        <div
          key="drawer"
          data-drawer-layer={stacked ? 'nested' : 'base'}
          className={cn(
            'fixed inset-x-0 bottom-0 top-[var(--drawer-top,0px)]',
            stacked ? 'z-[55]' : 'z-50',
          )}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            {...panelMotion}
            className={cn(
              'absolute inset-y-0 flex flex-col overflow-hidden border-t border-border bg-surface shadow-lg transition-[max-width] duration-300 ease-in-out',
              side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
              // Full replacement (not additive): two sm:max-w-* utilities on one
              // element resolve by stylesheet order, so stacking them no-ops.
              fullscreen ? 'w-full sm:max-w-[100vw]' : SIZE_CLASS[size],
              panelClassName,
            )}
          >
            {title || description || headerActions ? (
              <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
                <div className="min-w-0 space-y-0.5">
                  {title ? (
                    <h2 className="truncate text-base font-semibold text-fg">
                      {typeof title === 'string' ? tr(title) : title}
                    </h2>
                  ) : null}
                  {description ? (
                    <p className="text-sm text-fg-muted">
                      {typeof description === 'string' ? tr(description) : description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {headerActions ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {headerActions}
                    </div>
                  ) : null}
                  {!disableFullscreen ? (
                    <button
                      type="button"
                      onClick={() => setFullscreen((f) => !f)}
                      className="hidden rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg sm:block"
                      aria-label={fullscreen ? text.exitFullscreen : text.fullscreen}
                      title={fullscreen ? text.exitFullscreen : text.fullscreen}
                    >
                      {fullscreen ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="4 14 10 14 10 20" />
                          <polyline points="20 10 14 10 14 4" />
                          <line x1="14" y1="10" x2="21" y2="3" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="15 3 21 3 21 9" />
                          <polyline points="9 21 3 21 3 15" />
                          <line x1="21" y1="3" x2="14" y2="10" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                    aria-label={text.close}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </header>
            ) : null}
            {subtabs ? (
              <div className="shrink-0 border-b border-border bg-surface px-6">{subtabs}</div>
            ) : null}
            <div
              className={cn(
                'app-scroll min-h-0 flex-1 text-fg',
                bodyClassName ?? 'overflow-y-auto px-6 py-5',
              )}
            >
              {children}
            </div>
            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-6 py-3">
                {footer}
              </footer>
            ) : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * Client-side navigate fn supplied by the host app (e.g. Next's `router.push`)
 * so `UrlDrawer` can close by changing the URL — which re-runs the server
 * component that owns the drawer's `open` state. Falls back to a hard nav.
 */
export const DrawerNavigateContext = React.createContext<((href: string) => void) | null>(null)

export type UrlDrawerProps = Omit<DrawerProps, 'open' | 'onClose' | 'onExitComplete'> & {
  open: boolean
  closeHref: string
}

/**
 * URL-state drawer for server-rendered pages: `open` derives from a search
 * param, so closing needs a real navigation (deferred until the slide-out
 * finishes, so the exit animation always plays).
 */
export function UrlDrawer({ open, closeHref, children, ...rest }: UrlDrawerProps) {
  const navigate = React.useContext(DrawerNavigateContext)
  const [show, setShow] = React.useState(open)
  React.useEffect(() => setShow(open), [open])

  function afterExit() {
    if (typeof window === 'undefined') return
    if (navigate) navigate(closeHref)
    else window.location.assign(closeHref)
  }

  return (
    <Drawer open={show} onClose={() => setShow(false)} onExitComplete={afterExit} {...rest}>
      {children}
    </Drawer>
  )
}
