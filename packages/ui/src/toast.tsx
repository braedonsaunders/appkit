'use client'

// A sonner-compatible toast primitive. The public surface mirrors sonner so an
// app switches by changing the import:
//     import { toast, Toaster } from 'sonner'   →   from '@appkit/ui'
// `toast()` is a global imperative function (no provider/hook needed); a single
// <Toaster /> mounted at the app root subscribes and renders. Tokenized +
// animated with the appkit design system.

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, Info, Loader2, TriangleAlert, X } from 'lucide-react'
import { cn } from './utils'

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'loading'
export type ToastAction = { label: React.ReactNode; onClick: (e: React.MouseEvent) => void }
export type Message = React.ReactNode

export type ExternalToast = {
  id?: string | number
  description?: React.ReactNode
  duration?: number
  icon?: React.ReactNode
  action?: ToastAction
  cancel?: ToastAction
  onDismiss?: (id: string | number) => void
  onAutoClose?: (id: string | number) => void
  className?: string
}

export type ToastT = ExternalToast & {
  id: string | number
  title?: React.ReactNode
  type: ToastType
  jsx?: React.ReactNode
}

type Signal = ToastT | { id: string | number; dismiss: true }

let counter = 0

class Observer {
  private subscribers: Array<(t: Signal) => void> = []

  subscribe(fn: (t: Signal) => void) {
    this.subscribers.push(fn)
    return () => {
      const i = this.subscribers.indexOf(fn)
      if (i > -1) this.subscribers.splice(i, 1)
    }
  }

  private publish(t: Signal) {
    this.subscribers.forEach((s) => s(t))
  }

  create(data: ExternalToast & { message?: Message; title?: React.ReactNode; type?: ToastType; jsx?: React.ReactNode }) {
    const id = data.id ?? ++counter
    const { message, ...rest } = data
    this.publish({ ...rest, id, title: message ?? data.title, type: data.type ?? 'default' })
    return id
  }

  dismiss(id?: string | number) {
    if (id == null) return id
    this.publish({ id, dismiss: true })
    return id
  }

  message = (message: Message, data?: ExternalToast) => this.create({ ...data, message, type: 'default' })
  success = (message: Message, data?: ExternalToast) => this.create({ ...data, message, type: 'success' })
  error = (message: Message, data?: ExternalToast) => this.create({ ...data, message, type: 'error' })
  warning = (message: Message, data?: ExternalToast) => this.create({ ...data, message, type: 'warning' })
  info = (message: Message, data?: ExternalToast) => this.create({ ...data, message, type: 'info' })
  loading = (message: Message, data?: ExternalToast) =>
    this.create({ duration: Infinity, ...data, message, type: 'loading' })

  custom = (jsx: (id: string | number) => React.ReactNode, data?: ExternalToast) => {
    const id = data?.id ?? ++counter
    this.publish({ ...data, id, type: 'default', jsx: jsx(id) })
    return id
  }

  promise = <T,>(
    promise: Promise<T>,
    opts: {
      loading: Message
      success: Message | ((data: T) => Message)
      error: Message | ((err: unknown) => Message)
    },
  ) => {
    const id = this.loading(opts.loading)
    promise.then(
      (data) => this.create({ id, message: typeof opts.success === 'function' ? (opts.success as (d: T) => Message)(data) : opts.success, type: 'success', duration: undefined }),
      (err) => this.create({ id, message: typeof opts.error === 'function' ? (opts.error as (e: unknown) => Message)(err) : opts.error, type: 'error', duration: undefined }),
    )
    return id
  }
}

const ToastState = new Observer()

function toastFunction(message: Message, data?: ExternalToast) {
  return ToastState.create({ ...data, message })
}

/** sonner-compatible global toast API. */
export const toast = Object.assign(toastFunction, {
  success: ToastState.success,
  error: ToastState.error,
  warning: ToastState.warning,
  info: ToastState.info,
  message: ToastState.message,
  loading: ToastState.loading,
  custom: ToastState.custom,
  promise: ToastState.promise,
  dismiss: (id?: string | number) => ToastState.dismiss(id),
})

// ---------------------------------------------------------------------------
// <Toaster /> — mount once at the app root.
// ---------------------------------------------------------------------------

export type ToasterPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

const POSITION_CLASS: Record<ToasterPosition, string> = {
  'top-left': 'top-0 left-0 items-start',
  'top-center': 'top-0 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-0 right-0 items-end',
  'bottom-left': 'bottom-0 left-0 items-start',
  'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-0 right-0 items-end',
}

const TYPE_ICON: Record<ToastType, React.ReactNode> = {
  default: null,
  success: <Check className="size-4" />,
  error: <CircleAlert className="size-4" />,
  warning: <TriangleAlert className="size-4" />,
  info: <Info className="size-4" />,
  loading: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />,
}

const RICH: Record<ToastType, string> = {
  default: 'border-border bg-elevated text-fg',
  success: 'border-success/25 bg-success-subtle text-success',
  error: 'border-danger/25 bg-danger-subtle text-danger',
  warning: 'border-warning/25 bg-warning-subtle text-warning',
  info: 'border-info/25 bg-info-subtle text-info',
  loading: 'border-border bg-elevated text-fg',
}

const ACCENT: Record<ToastType, string> = {
  default: 'text-fg-muted',
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  loading: 'text-fg-muted',
}

export function Toaster({
  position = 'bottom-right',
  richColors = false,
  duration = 4000,
  closeButton = false,
  visibleToasts = 4,
  className,
}: {
  position?: ToasterPosition
  richColors?: boolean
  duration?: number
  closeButton?: boolean
  visibleToasts?: number
  className?: string
}) {
  const [toasts, setToasts] = React.useState<ToastT[]>([])
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  React.useEffect(
    () =>
      ToastState.subscribe((t) => {
        if ('dismiss' in t) {
          setToasts((prev) => prev.filter((x) => x.id !== t.id))
          return
        }
        setToasts((prev) => {
          const existing = prev.find((x) => x.id === t.id)
          if (existing) return prev.map((x) => (x.id === t.id ? { ...x, ...t } : x))
          const next = [t, ...prev]
          return next.slice(0, visibleToasts)
        })
      }),
    [visibleToasts],
  )

  if (!mounted || typeof document === 'undefined') return null
  const isTop = position.startsWith('top')

  return createPortal(
    <div className={cn('pointer-events-none fixed z-[80] flex w-full max-w-[420px] flex-col gap-2 p-4 sm:p-6', POSITION_CLASS[position], className)}>
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} defaultDuration={duration} richColors={richColors} closeButton={closeButton} isTop={isTop} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

function ToastRow({
  toast: t,
  defaultDuration,
  richColors,
  closeButton,
  isTop,
}: {
  toast: ToastT
  defaultDuration: number
  richColors: boolean
  closeButton: boolean
  isTop: boolean
}) {
  const d = t.duration ?? (t.type === 'loading' ? Infinity : defaultDuration)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAt = React.useRef(0)
  const remaining = React.useRef(d)

  const clearTimer = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const runTimer = React.useCallback(() => {
    if (!Number.isFinite(remaining.current)) return
    clearTimer()
    startedAt.current = Date.now()
    timer.current = setTimeout(() => {
      t.onAutoClose?.(t.id)
      ToastState.dismiss(t.id)
    }, remaining.current)
  }, [clearTimer, t])

  React.useEffect(() => {
    remaining.current = d
    runTimer()
    return clearTimer
    // Re-arm whenever the toast content/duration changes (e.g. promise resolve).
  }, [clearTimer, d, runTimer])

  function pauseTimer() {
    if (!timer.current) return
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    clearTimer()
  }

  function resumeTimer() {
    if (!timer.current) runTimer()
  }

  function close() {
    t.onDismiss?.(t.id)
    ToastState.dismiss(t.id)
  }

  if (t.jsx) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: isTop ? -16 : 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="pointer-events-auto w-full"
      >
        {t.jsx}
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      role="status"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      initial={{ opacity: 0, y: isTop ? -16 : 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
        richColors ? RICH[t.type] : 'border-border bg-elevated text-fg',
        t.className,
      )}
    >
      {t.icon ?? TYPE_ICON[t.type] ? (
        <span className={cn('mt-0.5 shrink-0', richColors ? '' : ACCENT[t.type])}>
          {t.icon ?? TYPE_ICON[t.type]}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
        {t.description ? <div className={cn('text-sm', richColors ? 'opacity-90' : 'text-fg-muted')}>{t.description}</div> : null}
        {t.action || t.cancel ? (
          <div className="flex items-center gap-2 pt-1.5">
            {t.action ? (
              <button
                type="button"
                onClick={(e) => {
                  t.action!.onClick(e)
                  close()
                }}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover"
              >
                {t.action.label}
              </button>
            ) : null}
            {t.cancel ? (
              <button
                type="button"
                onClick={(e) => {
                  t.cancel!.onClick?.(e)
                  close()
                }}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-surface-hover"
              >
                {t.cancel.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {closeButton ? (
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="-mr-1 rounded-md p-1 text-current opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </motion.div>
  )
}
