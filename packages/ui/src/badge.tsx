import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary-subtle text-primary',
        secondary: 'border-border bg-bg-subtle text-fg-muted',
        outline: 'border-border-strong bg-surface text-fg-muted',
        destructive: 'border-danger/25 bg-danger-subtle text-danger',
        warning: 'border-warning/25 bg-warning-subtle text-warning',
        success: 'border-success/25 bg-success-subtle text-success',
        info: 'border-info/25 bg-info-subtle text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
