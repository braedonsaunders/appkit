import * as React from 'react'
import { cn } from './utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/**
 * Input — tokenized field. `text-base` under sm: keeps iOS Safari from zooming
 * the viewport on focus (anything under 16px triggers it). `aria-invalid`
 * drives the error styling, so validation is a single attribute away.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle sm:text-sm',
        'transition-shadow duration-150 ease-out',
        'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
