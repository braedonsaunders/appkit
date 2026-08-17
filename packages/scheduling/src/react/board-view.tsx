'use client'

/**
 * Status board: four columns, cards grouped by phase, drag to change status.
 *
 * Dropping a card writes progress alongside the status, because a task marked
 * complete at 40% is a reporting lie that nobody notices until the rollup is
 * wrong. Rolled-up parents are not draggable — their status is derived.
 */

import { useMemo, useState } from 'react'
import { Badge, Button, Progress, cn } from '@braedonsaunders/ui'
import { parseDate } from '../dates'
import { getTaskVariance, normalizeScheduleProgress } from '../insights'
import { resolvePhaseColor } from '../palette'
import type {
  SchedulePhase,
  ScheduleInsights,
  ScheduleResource,
  ScheduleTask,
  ScheduleTaskAssignment,
  ScheduleTaskPatchInput,
  ScheduleTaskStatus,
} from '../types'
import { useScheduleFormatters, useSchedulingLabels } from './context'

export interface BoardViewProps {
  tasks: ScheduleTask[]
  insights: ScheduleInsights
  phases: SchedulePhase[]
  resources: ScheduleResource[]
  taskAssignmentsByTaskId: Map<string, ScheduleTaskAssignment[]>
  onUpdateTask: (taskId: string, patch: ScheduleTaskPatchInput) => void | boolean | Promise<boolean | void>
  onClickTask: (task: ScheduleTask) => void
  onContextMenu?: (e: React.MouseEvent, task: ScheduleTask) => void
}

const COLUMNS: ScheduleTaskStatus[] = ['not_started', 'in_progress', 'on_hold', 'complete']
const MAX_INLINE_RESOURCES = 3

/** Progress a status change implies when the user hasn't stated one. */
function progressForStatus(nextStatus: ScheduleTaskStatus, currentProgress: number) {
  if (nextStatus === 'complete') return 1
  if (nextStatus === 'not_started') return 0
  // Re-opening a finished task: 100% would contradict "in progress".
  if (nextStatus === 'in_progress') return currentProgress >= 1 ? 0.85 : Math.max(currentProgress, 0.1)
  return currentProgress
}

export function BoardView({
  tasks,
  insights,
  phases,
  resources,
  taskAssignmentsByTaskId,
  onUpdateTask,
  onClickTask,
  onContextMenu,
}: BoardViewProps) {
  const labels = useSchedulingLabels()
  const formatters = useScheduleFormatters()
  const phaseMap = useMemo(() => new Map(phases.map((phase) => [phase.id, phase])), [phases])
  const phaseIndexById = useMemo(
    () => new Map(phases.map((phase, index) => [phase.id, index])),
    [phases],
  )
  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources])
  const childCountByTaskId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      if (!task.parentTaskId) continue
      counts.set(task.parentTaskId, (counts.get(task.parentTaskId) ?? 0) + 1)
    }
    return counts
  }, [tasks])
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const tasksByStatus = useMemo(() => {
    const result: Record<ScheduleTaskStatus, ScheduleTask[]> = {
      not_started: [],
      in_progress: [],
      on_hold: [],
      complete: [],
    }

    for (const task of tasks) result[task.status]?.push(task)

    for (const status of COLUMNS) {
      result[status].sort((a, b) => {
        const aPhase = a.phaseId
          ? (phaseIndexById.get(a.phaseId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER
        const bPhase = b.phaseId
          ? (phaseIndexById.get(b.phaseId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER
        if (aPhase !== bPhase) return aPhase - bPhase
        return (a.startDate ?? '').localeCompare(b.startDate ?? '')
      })
    }

    return result
  }, [phaseIndexById, tasks])

  const groupedTasksByStatus = useMemo(() => {
    const result = new Map<
      ScheduleTaskStatus,
      Array<{ key: string; phase: SchedulePhase | null; tasks: ScheduleTask[] }>
    >()

    for (const status of COLUMNS) {
      const groups = new Map<string, { key: string; phase: SchedulePhase | null; tasks: ScheduleTask[] }>()
      for (const task of tasksByStatus[status]) {
        const phase = task.phaseId ? (phaseMap.get(task.phaseId) ?? null) : null
        const key = phase?.id ?? 'unassigned'
        if (!groups.has(key)) groups.set(key, { key, phase, tasks: [] })
        groups.get(key)!.tasks.push(task)
      }

      result.set(
        status,
        Array.from(groups.values()).sort((a, b) => {
          const aIndex = a.phase
            ? (phaseIndexById.get(a.phase.id) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER
          const bIndex = b.phase
            ? (phaseIndexById.get(b.phase.id) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER
          return aIndex - bIndex
        }),
      )
    }

    return result
  }, [phaseIndexById, phaseMap, tasksByStatus])

  const handleDrop = (event: React.DragEvent, nextStatus: ScheduleTaskStatus) => {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('text/plain')
    if (!taskId) {
      setDraggingId(null)
      return
    }

    const task = tasks.find((item) => item.id === taskId)
    if (task && task.status !== nextStatus) {
      void onUpdateTask(taskId, {
        status: nextStatus,
        progress: progressForStatus(nextStatus, normalizeScheduleProgress(task.progress)),
      })
    }

    setDraggingId(null)
  }

  const handleQuickStatus = (
    event: React.MouseEvent,
    task: ScheduleTask,
    nextStatus: ScheduleTaskStatus,
  ) => {
    event.stopPropagation()
    void onUpdateTask(task.id, {
      status: nextStatus,
      progress: progressForStatus(nextStatus, normalizeScheduleProgress(task.progress)),
    })
  }

  const columnAccent: Record<ScheduleTaskStatus, string> = {
    not_started: 'border-t-border-strong',
    in_progress: 'border-t-info',
    on_hold: 'border-t-warning',
    complete: 'border-t-success',
  }

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden rounded-t-none rounded-b-lg border border-t-0 border-border bg-surface p-3"
      data-testid="schedule-board"
    >
      <div className="sched-scroll grid min-h-0 flex-1 grid-cols-[repeat(4,minmax(240px,1fr))] gap-3 overflow-x-auto">
        {COLUMNS.map((status) => (
          <div
            key={status}
            data-testid={`schedule-board-column-${status}`}
            className={cn(
              'flex min-h-0 flex-col rounded-lg border border-t-4 border-border bg-bg-subtle/60',
              columnAccent[status],
            )}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => handleDrop(event, status)}
          >
            <div className="shrink-0 border-b border-border/50 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">{labels.status[status]}</span>
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] text-fg-subtle">
                  {tasksByStatus[status].length}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-fg-subtle">
                <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                  {tasksByStatus[status].filter((t) => insights.criticalTaskIds.has(t.id)).length}{' '}
                  {labels.list.critical}
                </Badge>
                <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                  {tasksByStatus[status].filter((t) => insights.overdueTaskIds.has(t.id)).length}{' '}
                  {labels.list.overdue}
                </Badge>
                <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                  {tasksByStatus[status].filter((t) => insights.attentionTaskIds.has(t.id)).length}{' '}
                  {labels.list.issues}
                </Badge>
              </div>
            </div>

            <div className="sched-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {(groupedTasksByStatus.get(status) ?? []).map((group) => (
                <div key={`${status}-${group.key}`} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5">
                      {group.phase ? (
                        <>
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: resolvePhaseColor(
                                group.phase.color,
                                phaseIndexById.get(group.phase.id) ?? 0,
                              ),
                            }}
                          />
                          <span className="text-[10px] font-medium text-fg-muted">{group.phase.name}</span>
                        </>
                      ) : (
                        <span className="text-[10px] font-medium text-fg-subtle">
                          {labels.common.noPhase}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-fg-subtle">{group.tasks.length}</span>
                  </div>

                  {group.tasks.map((task) => {
                    const phase = task.phaseId ? phaseMap.get(task.phaseId) : null
                    const phaseIndex = phase ? (phaseIndexById.get(phase.id) ?? -1) : -1
                    const color = phaseIndex >= 0 ? resolvePhaseColor(phase?.color, phaseIndex) : null
                    const childCount = childCountByTaskId.get(task.id) ?? 0
                    const isSummaryTask = task.taskType === 'summary' || childCount > 0
                    const isRollupSummary = childCount > 0
                    const startDate = parseDate(task.startDate)
                    const endDate = parseDate(task.endDate)
                    const deadlineDate = parseDate(task.deadlineDate)
                    const variance = getTaskVariance(task)
                    const floatDays = insights.totalFloatByTask.get(task.id)
                    const assignments = taskAssignmentsByTaskId.get(task.id) ?? []
                    const progress = normalizeScheduleProgress(task.progress)

                    return (
                      <div
                        key={task.id}
                        data-testid={`schedule-board-card-${task.id}`}
                        draggable={!isRollupSummary}
                        onDragStart={(event) => {
                          if (isRollupSummary) return
                          event.dataTransfer.setData('text/plain', task.id)
                          setDraggingId(task.id)
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => onClickTask(task)}
                        onContextMenu={onContextMenu ? (event) => onContextMenu(event, task) : undefined}
                        className={cn(
                          'cursor-pointer rounded-lg border border-border bg-surface p-3 transition-all hover:border-primary/30 hover:shadow-sm',
                          draggingId === task.id && 'opacity-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          {phase && color ? (
                            <div className="mb-2 flex items-center gap-1.5">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate text-[10px] text-fg-muted">{phase.name}</span>
                            </div>
                          ) : (
                            <span />
                          )}
                          <div className="flex flex-wrap justify-end gap-1">
                            {isSummaryTask && <Badge variant="secondary">{labels.badges.summary}</Badge>}
                            {childCount > 0 && (
                              <Badge variant="secondary">{labels.format.childCount(childCount)}</Badge>
                            )}
                            {insights.criticalTaskIds.has(task.id) && (
                              <Badge variant="info">{labels.badges.critical}</Badge>
                            )}
                            {assignments.length > 0 && (
                              <Badge variant="secondary">
                                {assignments.length} {labels.columns.resources}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="mb-2 line-clamp-2 text-xs font-medium text-fg">
                          {task.name || labels.badges.untitled}
                        </p>

                        {(startDate || endDate) && (
                          <p className="mb-2 text-[10px] text-fg-subtle">
                            {startDate ? formatters.shortDate(startDate) : '—'} –{' '}
                            {endDate ? formatters.shortDate(endDate) : '—'}
                          </p>
                        )}

                        <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-fg-subtle">
                          {deadlineDate ? (
                            <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                              {labels.columns.deadline} {formatters.shortDate(deadlineDate)}
                            </Badge>
                          ) : null}
                          {typeof floatDays === 'number' && Number.isFinite(floatDays) ? (
                            <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">{labels.format.floatDays(Math.round(floatDays))}</Badge>
                          ) : null}
                          {variance.isBehind ? (
                            <Badge variant="warning" className="px-2 py-0 text-[10px] font-medium">
                              {labels.format.slipDays(
                                Math.max(variance.finishDays ?? 0, variance.startDays ?? 0),
                              )}
                            </Badge>
                          ) : null}
                        </div>

                        {assignments.length > 0 ? (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {assignments.slice(0, MAX_INLINE_RESOURCES).map((assignment) => (
                              <Badge key={assignment.id} variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                                {resourceById.get(assignment.resourceId)?.name ??
                                  assignment.role ??
                                  labels.list.resource}
                              </Badge>
                            ))}
                            {assignments.length > MAX_INLINE_RESOURCES ? (
                              <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">+{assignments.length - MAX_INLINE_RESOURCES}</Badge>
                            ) : null}
                          </div>
                        ) : null}

                        {progress > 0 && (
                          <Progress
                            value={progress * 100}
                            aria-label={labels.columns.progress}
                            className="mb-2 h-1"
                          />
                        )}

                        <div className="flex flex-wrap gap-1">
                          {insights.overdueTaskIds.has(task.id) && (
                            <Badge variant="destructive">{labels.badges.overdue}</Badge>
                          )}
                          {insights.violatingTaskIds.has(task.id) && (
                            <Badge variant="warning">{labels.badges.logic}</Badge>
                          )}
                          {insights.openEndedTaskIds.has(task.id) && (
                            <Badge variant="warning">{labels.list.openEnd}</Badge>
                          )}
                          {insights.deadlineMissTaskIds.has(task.id) && (
                            <Badge variant="destructive">{labels.badges.deadline}</Badge>
                          )}
                          {insights.constraintViolationTaskIds.has(task.id) && (
                            <Badge variant="warning">{labels.badges.constraint}</Badge>
                          )}
                          {insights.resourceConflictTaskIds.has(task.id) && (
                            <Badge variant="warning">{labels.badges.resource}</Badge>
                          )}
                          {insights.actualDateGapTaskIds.has(task.id) && (
                            <Badge variant="warning">{labels.list.actuals}</Badge>
                          )}
                        </div>

                        {task.assignee && (
                          <div className="mt-3 flex items-center gap-1.5">
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-subtle">
                              <span className="text-[9px] font-medium text-fg-muted">
                                {task.assignee.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="truncate text-[10px] text-fg-muted">{task.assignee}</span>
                          </div>
                        )}

                        {!isRollupSummary ? (
                          <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2">
                            {task.status !== 'in_progress' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={(event) => handleQuickStatus(event, task, 'in_progress')}
                              >
                                {task.status === 'complete' ? labels.list.reopen : labels.list.start}
                              </Button>
                            ) : null}
                            {task.status !== 'complete' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={(event) => handleQuickStatus(event, task, 'complete')}
                              >
                                {labels.list.done}
                              </Button>
                            ) : null}
                            {task.status !== 'on_hold' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-6 px-2 text-[10px]"
                                onClick={(event) => handleQuickStatus(event, task, 'on_hold')}
                              >
                                {labels.list.hold}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}

              {tasksByStatus[status].length === 0 && (
                <div className="py-8 text-center text-xs text-fg-subtle">{labels.board.dropHint}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

