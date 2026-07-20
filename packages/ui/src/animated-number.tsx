'use client'

import * as React from 'react'
import { animate, useMotionValue, useReducedMotion } from 'framer-motion'

function tokenDurationSeconds(token: '--duration-fast' | '--duration-base' | '--duration-slow'): number {
  if (typeof document === 'undefined') return 0.32
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (raw.endsWith('ms')) return Number.parseFloat(raw) / 1000
  if (raw.endsWith('s')) return Number.parseFloat(raw)
  return 0.32
}

export type AnimatedNumberProps = {
  value: number
  from?: number
  duration?: number
  format?: (value: number) => string
  className?: string
  decimals?: number
}

/** Byte-compatible sibling counter, with its default duration read from appkit's motion tokens. */
export function AnimatedNumber({
  value,
  from = 0,
  duration,
  format,
  className,
  decimals,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const motionValue = useMotionValue(reduce ? value : from)
  const [displayValue, setDisplayValue] = React.useState(reduce ? value : from)

  React.useEffect(() => {
    if (reduce || document.visibilityState !== 'visible') {
      setDisplayValue(value)
      return
    }
    const controls = animate(motionValue, value, {
      duration: duration ?? tokenDurationSeconds('--duration-slow'),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplayValue,
    })
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        controls.stop()
        motionValue.set(value)
        setDisplayValue(value)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      controls.stop()
    }
  }, [duration, motionValue, reduce, value])

  return (
    <span className={className} aria-label={String(value)}>
      {formatNumber(displayValue, format, decimals)}
    </span>
  )
}

export function formatNumber(
  value: number,
  format?: (value: number) => string,
  decimals = 0,
): string {
  if (format) return format(value)
  const rounded = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()
  const [integer, fraction] = rounded.split('.')
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}
