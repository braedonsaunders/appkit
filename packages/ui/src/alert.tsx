import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm shadow-sm', {
  variants: {
    variant: {
      default: 'border-border bg-surface text-fg',
      destructive: 'border-danger/25 bg-danger-subtle text-danger',
      warning: 'border-warning/25 bg-warning-subtle text-warning',
      success: 'border-success/25 bg-success-subtle text-success',
      info: 'border-info/25 bg-info-subtle text-info',
    },
  },
  defaultVariants: { variant: 'default' },
})

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
)
Alert.displayName = 'Alert'

export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h5 className={cn('mb-1 font-semibold leading-tight tracking-tight', className)} {...props} />
)

export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <div className={cn('text-sm leading-relaxed opacity-90 [&_p]:leading-relaxed', className)} {...props} />
)

export { alertVariants }
