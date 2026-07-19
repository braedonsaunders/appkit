'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from './utils'

export type TooltipProps = {
  content: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Tooltip — hover/focus label with an inverted surface (dark-on-light,
 * light-on-dark). Fades in above the trigger; dismissed on blur/leave.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'pointer-events-none absolute bottom-full left-1/2 z-[60] mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-md',
              className,
            )}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
