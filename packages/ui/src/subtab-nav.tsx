'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from './utils'

export interface SubtabItem {
  key: string
  label: React.ReactNode
  count?: number
  disabled?: boolean
}

export interface SubtabNavProps {
  tabs: SubtabItem[]
  active: string
  onSelect?: (key: string) => void
  ariaLabel?: string
  className?: string
}

/**
 * Source detail/drawer subtab bar, tokenized and reusable across page shells.
 *
 * The active tab carries a sliding indicator that glides between tabs on the
 * same spring the `Tabs` segmented control uses — one motion system, so every
 * tab bar in the suite moves the same way. The indicator is a real element in
 * the static markup (not a post-hydration effect), so the active tab is marked
 * before hydration; reduced-motion users get an instant swap instead of the
 * glide. The call surface is unchanged: same props, same roles, same labels.
 */
export function SubtabNav({
  tabs,
  active,
  onSelect,
  ariaLabel = 'Sections',
  className,
}: SubtabNavProps) {
  // Scopes the indicator's shared-layout animation to this bar, so two bars
  // on one page never trade indicators with each other.
  const scope = React.useId()
  const reduce = useReducedMotion()
  return <nav
    role="tablist"
    className={cn('-mb-px flex gap-1 overflow-x-auto', className)}
    aria-label={ariaLabel}
  >{tabs.map((tab) => {
    const selected = active === tab.key
    return <button
      key={tab.key}
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={tab.disabled}
      onClick={() => onSelect?.(tab.key)}
      className={cn(
        'relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        selected
          ? 'border-transparent text-primary'
          : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
      )}
    >{selected ? (
        <motion.span
          layoutId={`appkit-subtab-${scope}`}
          aria-hidden
          className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary"
          transition={reduce ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 400 }}
        />
      ) : null}<span className="relative z-10 flex items-center gap-2">{tab.label}{typeof tab.count === 'number' ? <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] text-fg-muted">{tab.count}</span> : null}</span></button>
  })}</nav>
}
