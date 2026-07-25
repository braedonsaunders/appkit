'use client'

/**
 * Resource leveling, as a review step rather than a button that rewrites the
 * plan.
 *
 * The panel previews every proposed move, names what could NOT be solved and
 * why, states how far the finish date would move, and shows the load histogram
 * that motivated it. Applying is a separate, explicit action — a scheduler
 * whose dates changed without warning stops trusting the tool.
 */

import { useMemo, useState } from 'react'
import { ArrowRight, Scale, X } from 'lucide-react'
import { Badge, Button, cn } from '@appkit/ui'
import {
  buildResourceLoadSeries,
  levelResources,
  type ScheduleLevelingConflict,
  type ScheduleLevelingMove,
  type ScheduleLevelingResult,
} from '../leveling'
import { scheduleColors } from '../palette'
import type {
  ScheduleCalendar,
  ScheduleDependency,
  ScheduleResource,
  ScheduleTask,
  ScheduleTaskAssignment,
} from '../types'
import { useSchedulingLabels } from './context'

export interface LevelingPanelProps {
  open: boolean
  onClose: () => void
  tasks: ScheduleTask[]
  dependencies: ScheduleDependency[]
  calendars: ScheduleCalendar[]
  resources: ScheduleResource[]
  assignments: ScheduleTaskAssignment[]
  /** Persist the accepted moves. Return false to keep the panel open. */
  onApply: (moves: ScheduleLevelingMove[]) => Promise<boolean> | boolean
}

/** Histogram bars rendered per resource before the series is truncated. */
const MAX_HISTOGRAM_DAYS = 60

export function LevelingPanel({
  open,
  onClose,
  tasks,
  dependencies,
  calendars,
  resources,
  assignments,
  onApply,
}: LevelingPanelProps) {
  const labels = useSchedulingLabels()
  const [withinFloatOnly, setWithinFloatOnly] = useState(true)
  const [freezeStartedTasks, setFreezeStartedTasks] = useState(true)
  const [applying, setApplying] = useState(false)

  const result: ScheduleLevelingResult = useMemo(
    () =>
      levelResources(tasks, dependencies, {
        calendars,
        resources,
        assignments,
        withinFloatOnly,
        freezeStartedTasks,
      }),
    [assignments, calendars, dependencies, freezeStartedTasks, resources, tasks, withinFloatOnly],
  )

  const loadSeries = useMemo(
    () => buildResourceLoadSeries(tasks, { calendars, resources, assignments }),
    [assignments, calendars, resources, tasks],
  )

  if (!open) return null

  const reasonLabel = (reason: ScheduleLevelingConflict['reason']) =>
    reason === 'exceeds_float'
      ? labels.leveling.reasonExceedsFloat
      : reason === 'capacity_below_demand'
        ? labels.leveling.reasonCapacityBelowDemand
        : labels.leveling.reasonExceedsWindow

  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="schedule-leveling">
      <div className="absolute inset-0 bg-overlay/30 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.leveling.heading}
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        style={{ height: 'min(88vh, 720px)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-fg-subtle uppercase">
              <Scale className="h-3 w-3" />
              {labels.badges.schedule}
            </p>
            <h3 className="mt-1 text-base font-semibold text-fg">{labels.leveling.heading}</h3>
            <p className="mt-1 text-xs text-fg-muted">{labels.leveling.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.editor.cancel}
            className="text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-b border-border bg-bg-subtle px-5 py-3 text-xs text-fg-muted">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={withinFloatOnly}
              onChange={(event) => setWithinFloatOnly(event.target.checked)}
              className="rounded border-border"
            />
            {labels.leveling.withinFloatOnly}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={freezeStartedTasks}
              onChange={(event) => setFreezeStartedTasks(event.target.checked)}
              className="rounded border-border"
            />
            {labels.leveling.freezeStartedTasks}
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={result.moves.length > 0 ? 'info' : 'secondary'}>
              {result.moves.length} {labels.leveling.movesSummary}
            </Badge>
            <Badge variant={result.unresolved.length > 0 ? 'warning' : 'secondary'}>
              {result.unresolved.length} {labels.leveling.unresolvedSummary}
            </Badge>
            {result.projectDelayDays > 0 ? (
              <Badge variant="destructive">
                {labels.leveling.projectDelay} {labels.format.days(result.projectDelayDays)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="sched-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {result.hasCycle ? (
            <p className="rounded-lg bg-danger-subtle px-3 py-2 text-xs text-danger">
              {labels.insights.cycleDetected}
            </p>
          ) : null}

          <section className="space-y-2">
            <h4 className="text-xs font-semibold tracking-[0.16em] text-fg-subtle uppercase">
              {labels.leveling.preview}
            </h4>
            {result.moves.length === 0 ? (
              <p className="text-xs text-fg-subtle">{labels.leveling.noMoves}</p>
            ) : (
              <div className="space-y-1.5">
                {result.moves.map((move) => (
                  <div
                    key={move.taskId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-fg">{move.taskName}</span>
                    <span className="shrink-0 text-fg-subtle">{move.fromStart ?? '—'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-fg-subtle" />
                    <span className="shrink-0 font-medium text-fg">{move.toStart}</span>
                    <Badge variant="secondary">+{labels.format.days(move.delayDays)}</Badge>
                    {move.blockedByResourceIds.length > 0 ? (
                      <span className="hidden shrink-0 text-[11px] text-fg-subtle sm:inline">
                        {move.blockedByResourceIds.map(resourceName).join(', ')}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {result.unresolved.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold tracking-[0.16em] text-fg-subtle uppercase">
                {labels.leveling.unresolvedSummary}
              </h4>
              <div className="space-y-1.5">
                {result.unresolved.map((conflict) => (
                  <div
                    key={conflict.taskId}
                    className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs"
                  >
                    <p className="truncate font-medium text-fg">{conflict.taskName}</p>
                    <p className="mt-0.5 text-[11px] text-fg-muted">
                      {reasonLabel(conflict.reason)}
                      {conflict.resourceIds.length > 0
                        ? ` · ${conflict.resourceIds.map(resourceName).join(', ')}`
                        : ''}
                      {` · ${labels.format.days(conflict.requiredDelayDays)}`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h4 className="text-xs font-semibold tracking-[0.16em] text-fg-subtle uppercase">
              {labels.leveling.load}
            </h4>
            {loadSeries.length === 0 ? (
              <p className="text-xs text-fg-subtle">{labels.common.none}</p>
            ) : (
              loadSeries.map((series) => {
                const days = series.days.slice(0, MAX_HISTOGRAM_DAYS)
                const peak = Math.max(series.peakLoad, series.capacityPerDay, 1)
                return (
                  <div key={series.resourceId} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate font-medium text-fg">{series.resourceName}</span>
                      <span className="text-fg-subtle">
                        {labels.leveling.capacity} {series.capacityPerDay} ·{' '}
                        {series.overloadedDays} {labels.leveling.overloadedDays}
                      </span>
                    </div>
                    <div className="flex h-10 items-end gap-px">
                      {days.map((day) => (
                        <div
                          key={day.date}
                          title={`${day.date}: ${day.load} / ${day.capacity}`}
                          className={cn('w-full min-w-[2px] rounded-t-sm')}
                          style={{
                            height: `${Math.max(4, (day.load / peak) * 100)}%`,
                            backgroundColor:
                              day.overload > 0 ? scheduleColors.overload() : 'var(--color-primary)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            {labels.editor.cancel}
          </Button>
          <Button
            size="sm"
            disabled={result.moves.length === 0 || applying}
            data-testid="schedule-leveling-apply"
            onClick={async () => {
              setApplying(true)
              try {
                if (await onApply(result.moves)) onClose()
              } finally {
                setApplying(false)
              }
            }}
          >
            {labels.leveling.apply}
          </Button>
        </div>
      </div>
    </div>
  )
}
