'use client'

/**
 * The one place the scheduling surface gets its strings, date formatting and
 * host-supplied controls.
 *
 * Without a provider every component falls back to English defaults, the
 * runtime locale and native inputs, so a host can drop a Gantt in and see it
 * work. With one, the host's own i18n layer supplies labels and formatters,
 * and its own controls replace the defaults, without anything inside the
 * package needing to know which library either comes from.
 */

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'
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

/** What every date control in the surface receives. See `ScheduleDateInput`. */
export interface ScheduleDateInputProps {
  /** ISO calendar date `yyyy-mm-dd`, or '' for no date. */
  value: string
  /** Receives the settled date: ISO `yyyy-mm-dd`, or '' when cleared. */
  onChange: (value: string) => void
  /** Earliest accepted date, ISO `yyyy-mm-dd`. */
  min?: string
  /** Latest accepted date, ISO `yyyy-mm-dd`. */
  max?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Sizing utilities for the control (the filter bar renders a compact one). */
  className?: string
  'data-testid'?: string
}

export type ScheduleDateInputComponent = ComponentType<ScheduleDateInputProps>

/** Controls a host may substitute for the package defaults. */
export interface SchedulingComponents {
  /** Renders every date the surface edits; defaults to the native date input. */
  DateInput?: ScheduleDateInputComponent
}

export interface SchedulingContextValue {
  labels: SchedulingLabels
  formatters: ScheduleDateFormatters
  locale?: string
  components: SchedulingComponents
}

const noComponents: SchedulingComponents = {}

const SchedulingContext = createContext<SchedulingContextValue>({
  labels: defaultSchedulingLabels,
  formatters: defaultDateFormatters,
  components: noComponents,
})

export function SchedulingProvider({
  children,
  labels,
  formatters,
  locale,
  components,
}: {
  children: ReactNode
  /** Partial overrides merged over the English defaults. */
  labels?: DeepPartial<SchedulingLabels>
  /** Complete formatter override; otherwise derived from `locale`. */
  formatters?: ScheduleDateFormatters
  locale?: string
  /** Host controls that replace the defaults; omitted entries keep them. */
  components?: SchedulingComponents
}) {
  const value = useMemo<SchedulingContextValue>(
    () => ({
      labels: mergeSchedulingLabels(labels),
      formatters: formatters ?? (locale ? createDateFormatters(locale) : defaultDateFormatters),
      locale,
      components: components ?? noComponents,
    }),
    [labels, formatters, locale, components],
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

export function useScheduleComponents() {
  return useScheduling().components
}
