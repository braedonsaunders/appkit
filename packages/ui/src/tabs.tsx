'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from './utils'

export type TabItem = { value: string; label: React.ReactNode }

export type TabsProps = {
  tabs: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/**
 * Tabs — a segmented control with a spring-animated active indicator that
 * slides between options (framer `layoutId`). Reduced-motion falls back to an
 * instant swap.
 */
export function Tabs({ tabs, value, onValueChange, className }: TabsProps) {
  const id = React.useId()
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-1 rounded-lg border border-border bg-bg-subtle p-1', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`appkit-tab-${id}`}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
