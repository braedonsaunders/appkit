'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from './utils'

export type ToastVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type ToastInput = {
  title: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  /** ms before auto-dismiss; 0 to persist until dismissed. */
  duration?: number
}

type ToastRecord = ToastInput & { id: number }

type ToastContextValue = {
  toast: (t: ToastInput) => number
  dismiss: (id: number) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const ACCENT: Record<ToastVariant, string> = {
  neutral: 'text-fg-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
}

const ICON: Record<ToastVariant, React.ReactNode> = {
  neutral: <Info className="size-4" />,
  success: <Check className="size-4" />,
  warning: <TriangleAlert className="size-4" />,
  danger: <CircleAlert className="size-4" />,
  info: <Info className="size-4" />,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([])
  const [mounted, setMounted] = React.useState(false)
  const idRef = React.useRef(0)
  React.useEffect(() => setMounted(true), [])

  const dismiss = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current
      setToasts((list) => [...list, { ...t, id }])
      const duration = t.duration ?? 4000
      if (duration > 0) window.setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-end justify-start gap-2 p-4 sm:p-6">
              <AnimatePresence initial={false}>
                {toasts.map((t) => {
                  const variant = t.variant ?? 'neutral'
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, x: 24, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 24, scale: 0.96 }}
                      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-elevated px-4 py-3 shadow-lg"
                      role="status"
                    >
                      <span className={cn('mt-0.5 shrink-0', ACCENT[variant])}>{ICON[variant]}</span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-sm font-semibold text-fg">{t.title}</div>
                        {t.description ? (
                          <div className="text-sm text-fg-muted">{t.description}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismiss(t.id)}
                        aria-label="Dismiss"
                        className="-mr-1 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                      >
                        <X className="size-4" />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
