'use client'

import * as React from 'react'
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

/** Source detail/drawer subtab bar, tokenized and reusable across page shells. */
export function SubtabNav({
  tabs,
  active,
  onSelect,
  ariaLabel = 'Sections',
  className,
}: SubtabNavProps) {
  return <nav
    role="tablist"
    className={cn('-mb-px flex gap-1 overflow-x-auto', className)}
    aria-label={ariaLabel}
  >{tabs.map((tab) => <button
    key={tab.key}
    type="button"
    role="tab"
    aria-selected={active === tab.key}
    disabled={tab.disabled}
    onClick={() => onSelect?.(tab.key)}
    className={cn(
      'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      active === tab.key
        ? 'border-primary text-primary'
        : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
    )}
  >{tab.label}{typeof tab.count === 'number' ? <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] text-fg-muted">{tab.count}</span> : null}</button>)}</nav>
}
