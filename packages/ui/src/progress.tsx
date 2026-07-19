import * as React from 'react'
import { cn } from './utils'

export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number
}

export function Progress({ className, value, ...props }: ProgressProps) {
  const clamped = value == null ? null : Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-border-subtle', className)}
      {...props}
    >
      {clamped == null ? (
        <div className="h-full w-2/5 rounded-full bg-primary/80 [animation:appkit-indeterminate_1.2s_ease-in-out_infinite] motion-reduce:animate-none" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  )
}
