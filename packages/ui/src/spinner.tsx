import * as React from 'react'
import { cn } from './utils'

export type SpinnerProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number
  label?: string
}

/**
 * Spinner — a token-colored, reduced-motion-aware loading indicator. Uses
 * currentColor so it inherits the surrounding text color by default.
 */
export function Spinner({ size = 16, label = 'Loading', className, ...props }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-fg-muted motion-reduce:animate-none', className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
