'use client'

import { cn } from '@braedonsaunders/ui'
import { phaseColor } from '../palette'

/** The rotated diamond every schedule uses for a zero-duration event. */
export function MilestoneMarker({
  color,
  size = 12,
  className,
}: {
  /** CSS colour; defaults to the third phase hue (amber in the base palette). */
  color?: string
  size?: number
  className?: string
}) {
  return (
    <div
      className={cn('rotate-45 rounded-sm', className)}
      style={{ width: size, height: size, backgroundColor: color ?? phaseColor(2) }}
    />
  )
}
