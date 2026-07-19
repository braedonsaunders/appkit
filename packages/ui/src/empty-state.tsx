'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from './utils'

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-subtle px-8 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
          className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface text-fg-subtle shadow-sm ring-1 ring-border [&_svg]:size-7"
        >
          {icon}
        </motion.div>
      ) : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </motion.div>
  )
}
