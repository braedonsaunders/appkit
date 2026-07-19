import * as React from 'react'
import { cn } from './utils'

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

/**
 * Skeleton placeholder with a left→right shimmer sweep (`.appkit-shimmer` in
 * tokens.css — pure CSS, so it works server-rendered). Reduced-motion users get
 * a static placeholder.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('appkit-shimmer relative overflow-hidden rounded-md bg-border-subtle', className)}
      {...props}
    />
  )
}
