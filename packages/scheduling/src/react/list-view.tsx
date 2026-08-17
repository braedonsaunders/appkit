'use client'

/**
 * The spreadsheet view of a schedule: every planning field on one row, sortable
 * columns, multi-select with bulk status changes, and the same outline drag as
 * the Gantt.
 *
 * Reordering is only offered while sorted by WBS. Dragging a row into a new
 * position under a *sorted* view would write an order the user can't see, so
 * the grip explains itself instead of silently doing the wrong thing.
 */

import { Fragment, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import { Badge, Button, Checkbox, Progress, cn } from '@braedonsaunders/ui'
import { diffDays, parseDate } from '../dates'
import { buildTaskHierarchyInfo, getSummaryTaskIds, getVisibleTasks } from '../hierarchy'
import { getTaskVariance, normalizeScheduleProgress } from '../insights'
import { computePhaseDatesFromTasks, groupTasksByPhase } from '../timeline'
import { resolvePhaseColor, statusBadgeVariant } from '../palette'
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

export interface ListViewProps {
  tasks: ScheduleTask[]
  insights: ScheduleInsights
  phases: SchedulePhase[]
  resources: ScheduleResource[]
  taskAssignmentsByTaskId: Map<string, ScheduleTaskAssignment[]>
  onUpdateTask: (taskId: string, patch: ScheduleTaskPatchInput) => void | boolean | Promise<boolean | void>
  onBatchUpdateTasks: (
    updates: Array<{ id: string } & ScheduleTaskPatchInput>,
  ) => void | boolean | Promise<boolean | void>
  onDeleteTask: (taskId: string) => void | boolean | Promise<boolean | void>
  onReorderTask: (
    taskId: string,
    targetTaskId: string,
    placement: 'before' | 'after' | 'inside',
    depth?: number,
  ) => void | boolean | Promise<boolean | void>
  onClickTask: (task: ScheduleTask) => void
  onContextMenu?: (e: React.MouseEvent, task: ScheduleTask) => void
}

type SortKey =
  | 'order'
  | 'name'
  | 'status'
  | 'startDate'
  | 'endDate'
  | 'progress'
  | 'assignee'
  | 'variance'
  | 'float'
type SortDir = 'asc' | 'desc'

const TREE_INDENT = 18
const TREE_DROP_OFFSET = 20
const MAX_DROP_DEPTH = 12
/** Resource chips shown inline before collapsing into a "+n" counter. */
const MAX_INLINE_RESOURCES = 3
const COLUMN_COUNT = 17

export function ListView({
  tasks,
  insights,
  phases,
  resources,
  taskAssignmentsByTaskId,
  onUpdateTask,
  onBatchUpdateTasks,
  onDeleteTask,
  onReorderTask,
  onClickTask,
  onContextMenu,
}: ListViewProps) {
  const labels = useSchedulingLabels()
  const formatters = useScheduleFormatters()
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set())
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    taskId: string
    placement: 'before' | 'after' | 'inside'
    depth: number
  } | null>(null)
  const draggingTaskIdRef = useRef<string | null>(null)

  const phaseDates = useMemo(() => computePhaseDatesFromTasks(tasks, phases), [tasks, phases])
  const groups = useMemo(
    () => groupTasksByPhase(tasks, phases, phaseDates),
    [tasks, phases, phaseDates],
  )
  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources])
  const visibleSummary = useMemo(
    () => ({
      critical: tasks.filter((task) => insights.criticalTaskIds.has(task.id)).length,
      overdue: tasks.filter((task) => insights.overdueTaskIds.has(task.id)).length,
      slip: tasks.filter((task) => insights.behindBaselineTaskIds.has(task.id)).length,
      issues: tasks.filter((task) => insights.attentionTaskIds.has(task.id)).length,
    }),
    [
      insights.attentionTaskIds,
      insights.behindBaselineTaskIds,
      insights.criticalTaskIds,
      insights.overdueTaskIds,
      tasks,
    ],
  )

  const sortedGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        tasks:
          sortKey === 'order'
            ? [...group.tasks]
            : [...group.tasks].sort((a, b) => {
                const aVariance = getTaskVariance(a)
                const bVariance = getTaskVariance(b)
                const aFloat = insights.totalFloatByTask.get(a.id) ?? Number.POSITIVE_INFINITY
                const bFloat = insights.totalFloatByTask.get(b.id) ?? Number.POSITIVE_INFINITY

                let cmp = 0
                if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
                else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
                else if (sortKey === 'startDate') cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '')
                else if (sortKey === 'endDate') cmp = (a.endDate ?? '').localeCompare(b.endDate ?? '')
                else if (sortKey === 'progress') cmp = a.progress - b.progress
                else if (sortKey === 'assignee') cmp = a.assignee.localeCompare(b.assignee)
                else if (sortKey === 'variance')
                  cmp =
                    Math.max(aVariance.finishDays ?? 0, aVariance.startDays ?? 0) -
                    Math.max(bVariance.finishDays ?? 0, bVariance.startDays ?? 0)
                else if (sortKey === 'float') cmp = aFloat - bFloat

                return sortDir === 'asc' ? cmp : -cmp
              }),
        hierarchyInfo: buildTaskHierarchyInfo(group.tasks),
        summaryTaskIds: getSummaryTaskIds(group.tasks),
        visibleTasks: getVisibleTasks(group.tasks, collapsedTaskIds),
      })),
    [collapsedTaskIds, groups, insights.totalFloatByTask, sortDir, sortKey],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const togglePhase = toggleIn(setCollapsedPhases)
  const toggleTask = toggleIn(setCollapsedTaskIds)
  const toggleSelect = toggleIn(setSelectedIds)

  const handleBulkStatusChange = async (status: ScheduleTaskStatus) => {
    const didUpdate = await onBatchUpdateTasks(
      Array.from(selectedIds).map((id) => ({
        id,
        status,
        // Marking complete without setting progress leaves the two disagreeing.
        ...(status === 'complete' ? { progress: 1 } : {}),
      })),
    )
    if (didUpdate !== false) setSelectedIds(new Set())
  }

  const handleRowDragOver = (
    event: React.DragEvent<HTMLTableRowElement>,
    taskId: string,
    targetDepth: number,
  ) => {
    const activeTaskId =
      draggingTaskIdRef.current ?? draggingTaskId ?? event.dataTransfer.getData('text/plain') ?? null
    if (!activeTaskId || activeTaskId === taskId || sortKey !== 'order') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeY = event.clientY - rect.top
    const treeCell = event.currentTarget.querySelector<HTMLElement>('[data-schedule-tree-cell]')
    const treeRect = treeCell?.getBoundingClientRect() ?? rect
    const relativeTreeX = Math.max(0, event.clientX - treeRect.left)
    const depth = Math.max(
      0,
      Math.min(MAX_DROP_DEPTH, Math.round((relativeTreeX - TREE_DROP_OFFSET) / TREE_INDENT)),
    )
    const placement =
      relativeY > rect.height * 0.28 &&
      relativeY < rect.height * 0.72 &&
      relativeTreeX >= TREE_DROP_OFFSET + targetDepth * TREE_INDENT + 12
        ? 'inside'
        : relativeY < rect.height / 2
          ? 'before'
          : 'after'
    setDropTarget({ taskId, placement, depth })
  }

  const handleRowDrop = async (event: React.DragEvent<HTMLTableRowElement>, taskId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const activeTaskId =
      draggingTaskIdRef.current ?? draggingTaskId ?? event.dataTransfer.getData('text/plain') ?? null
    if (!activeTaskId || !dropTarget || dropTarget.taskId !== taskId || sortKey !== 'order') return
    const didMove = await onReorderTask(activeTaskId, taskId, dropTarget.placement, dropTarget.depth)
    if (didMove !== false) {
      setDraggingTaskId(null)
      draggingTaskIdRef.current = null
      setDropTarget(null)
    }
  }

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="cursor-pointer px-3 py-2 text-left text-xs font-medium text-fg-muted transition-colors select-none hover:text-fg"
      onClick={() => toggleSort(field)}
      aria-sort={sortKey === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sortKey === field && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-none rounded-b-lg border border-t-0 border-border bg-surface"
      data-testid="schedule-list"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-subtle/60 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {tasks.length} {labels.list.visible}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {visibleSummary.critical} {labels.list.critical}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {visibleSummary.overdue} {labels.list.overdue}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {visibleSummary.slip} {labels.list.slip}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {visibleSummary.issues} {labels.list.issues}
          </Badge>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary-subtle px-4 py-2">
          <span className="text-xs text-fg-muted">
            {selectedIds.size} {labels.list.selected}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleBulkStatusChange('in_progress')}
            data-testid="schedule-list-bulk-in-progress"
          >
            {labels.list.markInProgress}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleBulkStatusChange('complete')}
            data-testid="schedule-list-bulk-complete"
          >
            {labels.list.markComplete}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            {labels.list.clearSelection}
          </Button>
        </div>
      )}

      <div className="sched-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ width: 34 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 74 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: 54 }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: 92 }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: 92 }} />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-border bg-bg-subtle">
              <th className="w-8 px-2 py-2" />
              <th className="w-8 px-3 py-2">
                <Checkbox
                  aria-label={labels.list.selectAll}
                  checked={selectedIds.size === tasks.length && tasks.length > 0}
                  onChange={() => {
                    if (selectedIds.size === tasks.length) setSelectedIds(new Set())
                    else setSelectedIds(new Set(tasks.map((task) => task.id)))
                  }}
                />
              </th>
              <SortHeader label={labels.list.wbs} field="order" />
              <SortHeader label={labels.columns.name} field="name" />
              <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                {labels.columns.phase}
              </th>
              <SortHeader label={labels.columns.status} field="status" />
              <SortHeader label={labels.columns.start} field="startDate" />
              <SortHeader label={labels.columns.finish} field="endDate" />
              <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                {labels.columns.deadline}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                {labels.columns.duration}
              </th>
              <SortHeader label={labels.list.variance} field="variance" />
              <SortHeader label={labels.columns.float} field="float" />
              <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                {labels.columns.resources}
              </th>
              <SortHeader label={labels.columns.progress} field="progress" />
              <SortHeader label={labels.columns.assignee} field="assignee" />
              <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                {labels.list.flags}
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((group, groupIndex) => {
              const isCollapsed = group.phase ? collapsedPhases.has(group.phase.id) : false
              const groupColor = resolvePhaseColor(group.phase?.color, groupIndex)

              return (
                <Fragment key={group.phase?.id ?? 'standalone'}>
                  {group.phase && (
                    <tr
                      className="cursor-pointer border-b border-border/50 bg-bg-subtle/60 transition-colors hover:bg-bg-subtle"
                      onClick={() => togglePhase(group.phase!.id)}
                    >
                      <td colSpan={COLUMN_COUNT} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
                          )}
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: groupColor }}
                          />
                          <span className="text-xs font-semibold text-fg">
                            {group.phase.number ? `${group.phase.number}. ` : ''}
                            {group.phase.name}
                          </span>
                          <span className="ml-2 text-[11px] text-fg-subtle">
                            {labels.format.taskCount(group.tasks.length)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isCollapsed &&
                    group.visibleTasks.map((task) => {
                      const start = parseDate(task.startDate)
                      const end = parseDate(task.endDate)
                      const deadline = parseDate(task.deadlineDate)
                      const duration = start && end ? diffDays(end, start) : task.duration
                      const variance = getTaskVariance(task)
                      const floatDays = insights.totalFloatByTask.get(task.id)
                      const assignments = taskAssignmentsByTaskId.get(task.id) ?? []
                      const progress = normalizeScheduleProgress(task.progress)
                      const hierarchy = group.hierarchyInfo.get(task.id)
                      const depth = hierarchy?.depth ?? task.outlineLevel ?? 0
                      const isSummaryTask = group.summaryTaskIds.has(task.id)
                      const isTaskCollapsed = collapsedTaskIds.has(task.id)
                      const isDropBefore =
                        dropTarget?.taskId === task.id && dropTarget.placement === 'before'
                      const isDropAfter =
                        dropTarget?.taskId === task.id && dropTarget.placement === 'after'
                      const isDropInside =
                        dropTarget?.taskId === task.id && dropTarget.placement === 'inside'

                      return (
                        <tr
                          key={task.id}
                          data-testid={`schedule-list-row-${task.id}`}
                          className={cn(
                            'border-b border-border/40 transition-colors hover:bg-surface-hover',
                            draggingTaskId === task.id && 'opacity-55',
                            isDropBefore && 'border-t-2 border-t-primary',
                            isDropAfter && 'border-b-2 border-b-primary',
                            isDropInside && 'bg-primary-subtle shadow-[inset_3px_0_0_0_var(--color-primary)]',
                          )}
                          onContextMenu={onContextMenu ? (event) => onContextMenu(event, task) : undefined}
                          onDragOver={(event) => handleRowDragOver(event, task.id, depth)}
                          onDragEnter={(event) => handleRowDragOver(event, task.id, depth)}
                          onDragLeave={() => {
                            if (dropTarget?.taskId === task.id) setDropTarget(null)
                          }}
                          onDrop={(event) => void handleRowDrop(event, task.id)}
                        >
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              draggable={sortKey === 'order'}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', task.id)
                                setDraggingTaskId(task.id)
                                draggingTaskIdRef.current = task.id
                                setDropTarget(null)
                              }}
                              onDragEnd={() => {
                                setDraggingTaskId(null)
                                draggingTaskIdRef.current = null
                                setDropTarget(null)
                              }}
                              className="text-fg-subtle transition-colors hover:text-fg-muted"
                              aria-label={`${labels.toolbar.indent}: ${task.name || labels.badges.untitled}`}
                              title={
                                sortKey === 'order'
                                  ? labels.badges.reorderHint
                                  : labels.list.reorderRequiresWbsSort
                              }
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <Checkbox
                              data-testid={`schedule-list-select-${task.id}`}
                              aria-label={task.name || labels.badges.untitled}
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleSelect(task.id)}
                            />
                          </td>
                          <td className="truncate px-3 py-2 text-[11px] text-fg-subtle">
                            {depth === 0 ? `${task.order}` : `${task.order}.L${depth}`}
                          </td>
                          <td
                            className="min-w-0 px-3 py-2 text-xs text-fg transition-colors hover:text-primary"
                            onClick={() => onClickTask(task)}
                          >
                            <div
                              data-schedule-tree-cell="true"
                              className="flex min-w-0 cursor-pointer items-start gap-2"
                              style={{ paddingLeft: `${depth * TREE_INDENT}px` }}
                            >
                              {hierarchy?.hasChildren ? (
                                <button
                                  type="button"
                                  className="mt-0.5 shrink-0 text-fg-subtle transition-colors hover:text-fg"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    toggleTask(task.id)
                                  }}
                                  aria-label={`${isTaskCollapsed ? labels.badges.expand : labels.badges.collapse}: ${task.name || labels.badges.untitled}`}
                                >
                                  {isTaskCollapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle" />
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="line-clamp-2">{task.name || labels.badges.untitled}</span>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-fg-subtle">
                                  {isSummaryTask ? <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">{labels.badges.summary}</Badge> : null}
                                  {hierarchy?.hasChildren ? (
                                    <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">{labels.format.childCount(hierarchy.childCount)}</Badge>
                                  ) : null}
                                  <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">L{depth}</Badge>
                                  {task.description ? (
                                    <span className="line-clamp-1">{task.description}</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="min-w-0 px-3 py-2">
                            {group.phase && (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <div
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: groupColor }}
                                />
                                <span className="truncate text-[11px] text-fg-subtle">
                                  {group.phase.name}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={statusBadgeVariant[task.status]}>{labels.status[task.status]}</Badge>
                          </td>
                          <td className="truncate px-3 py-2 text-xs text-fg-muted">
                            {start ? formatters.shortDate(start) : '—'}
                          </td>
                          <td className="truncate px-3 py-2 text-xs text-fg-muted">
                            {end ? formatters.shortDate(end) : '—'}
                          </td>
                          <td className="truncate px-3 py-2 text-xs text-fg-muted">
                            {deadline ? formatters.shortDate(deadline) : '—'}
                          </td>
                          <td className="truncate px-3 py-2 text-xs text-fg-muted">
                            {duration > 0
                              ? labels.format.days(duration)
                              : task.taskType === 'milestone'
                                ? labels.badges.milestone
                                : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-fg-muted">
                            {variance.isBehind ? (
                              <Badge variant="warning" className="px-2 py-0 text-[10px] font-medium">
                                {labels.format.slipDays(
                                  Math.max(variance.finishDays ?? 0, variance.startDays ?? 0),
                                )}
                              </Badge>
                            ) : variance.isAhead ? (
                              <Badge variant="success" className="px-2 py-0 text-[10px] font-medium">
                                {labels.format.aheadDays(
                                  Math.min(variance.finishDays ?? 0, variance.startDays ?? 0),
                                )}
                              </Badge>
                            ) : variance.hasVariance ? (
                              <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">{labels.list.onBaseline}</Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-fg-muted">
                            {typeof floatDays === 'number' && Number.isFinite(floatDays)
                              ? labels.format.days(Math.round(floatDays))
                              : '—'}
                          </td>
                          <td className="min-w-0 px-3 py-2 text-xs text-fg-muted">
                            {assignments.length > 0 ? (
                              <div className="flex max-h-7 min-w-0 flex-wrap gap-1 overflow-hidden">
                                {assignments.slice(0, MAX_INLINE_RESOURCES).map((assignment) => (
                                  <Badge
                                    key={assignment.id}
                                    variant="secondary"
                                    className="px-2 py-0 text-[10px] font-medium"
                                  >
                                    {resourceById.get(assignment.resourceId)?.name ??
                                      assignment.role ??
                                      labels.list.resource}
                                  </Badge>
                                ))}
                                {assignments.length > MAX_INLINE_RESOURCES ? (
                                  <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">+{assignments.length - MAX_INLINE_RESOURCES}</Badge>
                                ) : null}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={progress * 100}
                                aria-label={labels.columns.progress}
                                className="h-1.5 w-16"
                              />
                              <span className="text-[11px] text-fg-subtle">
                                {Math.round(progress * 100)}%
                              </span>
                            </div>
                          </td>
                          <td className="truncate px-3 py-2 text-xs text-fg-muted">
                            {task.assignee || '—'}
                          </td>
                          <td className="min-w-0 px-3 py-2">
                            <div className="flex max-h-7 flex-wrap gap-1 overflow-hidden">
                              {insights.criticalTaskIds.has(task.id) && (
                                <Badge variant="info">{labels.badges.critical}</Badge>
                              )}
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
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {task.status !== 'in_progress' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void onUpdateTask(task.id, { status: 'in_progress' })}
                                  className="h-6 px-2 text-[10px]"
                                >
                                  {labels.list.start}
                                </Button>
                              ) : null}
                              {task.status !== 'complete' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    void onUpdateTask(task.id, { status: 'complete', progress: 1 })
                                  }
                                  className="h-6 px-2 text-[10px]"
                                >
                                  {labels.list.done}
                                </Button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void onDeleteTask(task.id)}
                                className="text-fg-subtle transition-colors hover:text-danger"
                                aria-label={`${labels.editor.delete}: ${task.name || labels.badges.untitled}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {tasks.length === 0 && (
        <div className="py-12 text-center text-sm text-fg-subtle">{labels.list.noMatches}</div>
      )}
    </div>
  )
}

