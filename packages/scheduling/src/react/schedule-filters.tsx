'use client'

/** Structured filter bar: phase, status, assignee and a date window. */

import { X } from 'lucide-react'
import { Button, Input, Select, cn } from '@braedonsaunders/appkit-ui'
import { emptyFilters } from '../types'
import type { SchedulePhase, ScheduleFilters, ScheduleTaskStatus } from '../types'
import { useSchedulingLabels } from './context'

const ALL = '__all__'

export interface ScheduleFiltersBarProps {
  filters: ScheduleFilters
  onChange: (f: ScheduleFilters) => void
  phases: SchedulePhase[]
  assignees: string[]
  className?: string
}

export function ScheduleFiltersBar({
  filters,
  onChange,
  phases,
  assignees,
  className,
}: ScheduleFiltersBarProps) {
  const labels = useSchedulingLabels()
  const hasFilters =
    filters.phaseIds.length > 0 ||
    filters.statuses.length > 0 ||
    filters.assignees.length > 0 ||
    !!filters.dateFrom ||
    !!filters.dateTo

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2',
        className,
      )}
      data-testid="schedule-filters"
    >
      <Field label={labels.columns.phase}>
        <Select
          value={filters.phaseIds[0] ?? ALL}
          onChange={(event) =>
            onChange({
              ...filters,
              phaseIds: event.target.value === ALL ? [] : [event.target.value],
            })
          }
          triggerClassName="h-7 w-36 text-xs"
          aria-label={labels.columns.phase}
        >
          <option value={ALL}>{labels.quickFilter.all}</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.number ? `${phase.number}. ` : ''}
              {phase.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={labels.columns.status}>
        <Select
          value={filters.statuses[0] ?? ALL}
          onChange={(event) =>
            onChange({
              ...filters,
              statuses:
                event.target.value === ALL ? [] : [event.target.value as ScheduleTaskStatus],
            })
          }
          triggerClassName="h-7 w-36 text-xs"
          aria-label={labels.columns.status}
        >
          <option value={ALL}>{labels.quickFilter.all}</option>
          {(Object.keys(labels.status) as ScheduleTaskStatus[]).map((status) => (
            <option key={status} value={status}>
              {labels.status[status]}
            </option>
          ))}
        </Select>
      </Field>

      {assignees.length > 0 && (
        <Field label={labels.columns.assignee}>
          <Select
            value={filters.assignees[0] ?? ALL}
            onChange={(event) =>
              onChange({
                ...filters,
                assignees: event.target.value === ALL ? [] : [event.target.value],
              })
            }
            triggerClassName="h-7 w-36 text-xs"
            aria-label={labels.columns.assignee}
          >
            <option value={ALL}>{labels.quickFilter.all}</option>
            {assignees.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={labels.columns.start}>
        <Input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
          className="h-7 w-36 text-xs"
          aria-label={labels.columns.start}
        />
      </Field>
      <Field label={labels.columns.finish}>
        <Input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
          className="h-7 w-36 text-xs"
          aria-label={labels.columns.finish}
        />
      </Field>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)} className="h-7">
          <X className="h-3 w-3" />
          {labels.toolbar.clearFilters}
        </Button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  )
}
