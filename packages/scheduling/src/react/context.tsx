'use client'

/**
 * The one place the scheduling surface gets its strings and date formatting.
 *
 * Without a provider every component falls back to English defaults and the
 * runtime locale, so a host can drop a Gantt in and see it work. With one, the
 * host's own i18n layer supplies labels and formatters and nothing inside the
 * package needs to know which library it uses.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  createDateFormatters,
  defaultDateFormatters,
  type ScheduleDateFormatters,
} from '../dates'
import {
  defaultSchedulingLabels,
  mergeSchedulingLabels,
  type DeepPartial,
  type SchedulingLabels,
} from '../labels'

export interface SchedulingContextValue {
  labels: SchedulingLabels
  formatters: ScheduleDateFormatters
  locale?: string
}

const SchedulingContext = createContext<SchedulingContextValue>({
  labels: defaultSchedulingLabels,
  formatters: defaultDateFormatters,
})

export function SchedulingProvider({
  children,
  labels,
  formatters,
  locale,
}: {
  children: ReactNode
  /** Partial overrides merged over the English defaults. */
  labels?: DeepPartial<SchedulingLabels>
  /** Complete formatter override; otherwise derived from `locale`. */
  formatters?: ScheduleDateFormatters
  locale?: string
}) {
  const value = useMemo<SchedulingContextValue>(
    () => ({
      labels: mergeSchedulingLabels(labels),
      formatters: formatters ?? (locale ? createDateFormatters(locale) : defaultDateFormatters),
      locale,
    }),
    [labels, formatters, locale],
  )
  return <SchedulingContext.Provider value={value}>{children}</SchedulingContext.Provider>
}

export function useScheduling() {
  return useContext(SchedulingContext)
}

export function useSchedulingLabels() {
  return useScheduling().labels
}

export function useScheduleFormatters() {
  return useScheduling().formatters
}
