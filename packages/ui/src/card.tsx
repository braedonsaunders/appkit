import * as React from 'react'
import { cn } from './utils'

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds a hover lift + shadow. Auto-enabled when an onClick is present. */
  interactive?: boolean
}

/**
 * Card — the default surface. No 'use client': stays server-renderable, and
 * only attaches keyboard handling when the caller actually made it clickable
 * (an unconditional handler would make every server-rendered Card
 * unserializable).
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, onClick, onKeyDown, ...props }, ref) => {
    const isInteractive = interactive ?? typeof onClick === 'function'
    const clickable = isInteractive && typeof onClick === 'function'
    const handleKeyDown =
      clickable || onKeyDown
        ? (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (clickable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
            }
            onKeyDown?.(e)
          }
        : undefined
    return (
      <div
        ref={ref}
        onClick={onClick}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={handleKeyDown}
        className={cn(
          'rounded-lg border border-border bg-surface shadow-sm',
          isInteractive &&
            'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          className,
        )}
        {...props}
      />
    )
  },
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 p-6', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-lg font-semibold text-fg', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-fg-muted', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2 p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'
