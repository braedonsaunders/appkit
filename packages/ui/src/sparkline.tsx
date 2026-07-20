import * as React from 'react'
import { cn } from './utils'

export type SparklineTone = 'up' | 'down' | 'good' | 'bad' | 'neutral'

export type SparklineProps = {
  points: number[]
  tone?: SparklineTone
  auto?: boolean
  goodWhenRising?: boolean
  dots?: boolean
  stroke?: string
  area?: boolean
  strokeWidth?: number
  className?: string
  ariaLabel?: string
  noTrendLabel?: string
}

const TONE_COLOR: Record<SparklineTone, string> = {
  up: 'var(--color-danger)',
  down: 'var(--color-success)',
  good: 'var(--color-success)',
  bad: 'var(--color-danger)',
  neutral: 'var(--color-fg-muted)',
}

export function Sparkline({
  points,
  tone = 'neutral',
  auto,
  goodWhenRising = true,
  dots = false,
  stroke,
  area = false,
  strokeWidth = 1.5,
  className,
  ariaLabel,
  noTrendLabel = 'No trend data',
}: SparklineProps) {
  let resolvedTone = tone
  if (auto && points.length >= 2) {
    const first = points[0]!
    const last = points[points.length - 1]!
    if (last === first) resolvedTone = 'neutral'
    else if (last > first) resolvedTone = goodWhenRising ? 'good' : 'bad'
    else resolvedTone = goodWhenRising ? 'bad' : 'good'
  }
  const strokeColor = stroke ?? TONE_COLOR[resolvedTone]

  if (points.length < 2) {
    return (
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={ariaLabel ?? noTrendLabel} className={cn('block', className)}>
        <line x1="0" y1="16" x2="100" y2="16" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3,3" />
      </svg>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const minIndex = points.indexOf(min)
  const maxIndex = points.indexOf(max)
  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100
    const y = 29 - ((point - min) / range) * 26
    return [x, y] as const
  })
  const path = `M ${coordinates.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')}`
  const areaPath = `${path} L 100 32 L 0 32 Z`
  const label = ariaLabel ?? `Trend: ${points.length} points from ${points[0]} to ${points.at(-1)}`

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} className={cn('block overflow-visible', className)}>
      {area ? <path d={areaPath} fill={`color-mix(in oklab, ${strokeColor} 12%, transparent)`} stroke="none" /> : null}
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {dots
        ? [minIndex, maxIndex].filter((index, position, all) => all.indexOf(index) === position).map((index) => {
            const [x, y] = coordinates[index]!
            return <circle key={index} cx={x} cy={y} r="1.75" fill={strokeColor} stroke="var(--color-surface)" strokeWidth="0.75" />
          })
        : null}
    </svg>
  )
}
