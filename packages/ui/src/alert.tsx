import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const alertVariants = cva('relative flex gap-3 rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      neutral: 'border-border bg-surface text-fg',
      info: 'border-info/25 bg-info-subtle text-info',
      success: 'border-success/25 bg-success-subtle text-success',
      warning: 'border-warning/25 bg-warning-subtle text-warning',
      danger: 'border-danger/25 bg-danger-subtle text-danger',
    },
  },
  defaultVariants: { variant: 'info' },
})

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    icon?: React.ReactNode
    title?: React.ReactNode
  }

export function Alert({ className, variant, icon, title, children, ...props }: AlertProps) {
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 space-y-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && 'opacity-90')}>{children}</div> : null}
      </div>
    </div>
  )
}

export { alertVariants }
