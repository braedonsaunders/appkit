'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from './utils'

/**
 * Universal context menu — a floating list of actions opened at a point.
 * Trigger it via {@link useContextMenu}, either from a right-click
 * (`onContextMenu={menu.onContextMenu}`) or a kebab button
 * (`onClick={(e) => menu.openBelow(e.currentTarget)}`). The panel portals to
 * <body>, clamps inside the viewport, and closes on outside-click / Esc /
 * scroll. Items carry an icon, label, and handler; `danger` tints destructive
 * actions and `{ separator: true }` draws a divider.
 */
export interface ContextMenuItem {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

export type ContextMenuEntry = ContextMenuItem | { key: string; separator: true }

export interface ContextMenuController {
  open: boolean
  position: { x: number; y: number } | null
  openAt: (x: number, y: number) => void
  onContextMenu: (e: React.MouseEvent) => void
  openBelow: (el: HTMLElement) => void
  close: () => void
}

export function useContextMenu(): ContextMenuController {
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null)
  const openAt = React.useCallback((x: number, y: number) => setPosition({ x, y }), [])
  const onContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
  }, [])
  const openBelow = React.useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setPosition({ x: r.right, y: r.bottom + 4 })
  }, [])
  const close = React.useCallback(() => setPosition(null), [])
  return { open: position != null, position, openAt, onContextMenu, openBelow, close }
}

export function ContextMenu({
  open,
  position,
  items,
  onClose,
  className,
}: {
  open: boolean
  position: { x: number; y: number } | null
  items: ContextMenuEntry[]
  onClose: () => void
  className?: string
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null)

  React.useEffect(() => setMounted(true), [])

  // Clamp inside the viewport before paint so the menu never flashes off-screen.
  React.useLayoutEffect(() => {
    if (!open || !position) {
      setCoords(null)
      return
    }
    const panel = panelRef.current
    const pw = panel?.offsetWidth ?? 176
    const ph = panel?.offsetHeight ?? 0
    const pad = 8
    let x = position.x
    let y = position.y
    if (x + pw + pad > window.innerWidth) x = window.innerWidth - pw - pad
    if (y + ph + pad > window.innerHeight) y = window.innerHeight - ph - pad
    setCoords({ x: Math.max(pad, x), y: Math.max(pad, y) })
  }, [open, position])

  React.useEffect(() => {
    if (!open) return
    function onDown(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onScroll() {
      onClose()
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('contextmenu', onDown)
      document.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onScroll)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('contextmenu', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, onClose])

  if (!mounted || typeof document === 'undefined') return null

  const at = coords ?? position

  return createPortal(
    <AnimatePresence>
      {open && at ? (
        <motion.div
          ref={panelRef}
          data-ui-overlay
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'fixed z-[70] min-w-[11rem] max-w-[16rem] overflow-hidden rounded-md border border-border bg-elevated p-1 shadow-lg',
            className,
          )}
          style={{ left: at.x, top: at.y, transformOrigin: 'top left' }}
          role="menu"
        >
          {items.map((item) =>
            'separator' in item ? (
              <div key={item.key} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  onClose()
                  item.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                  item.disabled
                    ? 'cursor-not-allowed text-fg-subtle'
                    : item.danger
                      ? 'text-danger hover:bg-danger-subtle'
                      : 'text-fg hover:bg-surface-hover',
                )}
              >
                {item.icon ? <item.icon className="size-4 shrink-0 opacity-80" /> : null}
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            ),
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
