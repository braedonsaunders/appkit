import * as React from 'react'
import { cn } from './utils'

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-border-subtle motion-reduce:animate-none', className)}
      {...props}
    />
  )
}
