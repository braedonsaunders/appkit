'use client'

/**
 * The complete scheduling workspace: toolbar, filters, the three views, the
 * task editor, the admin dialog, and resource leveling — wired together.
 *
 * The host supplies DATA and an ADAPTER. Everything about persistence,
 * authorization and identity stays on the host side; this component owns view
 * state (zoom, filters, selection) and the derived plan (rollups, CPM,
 * insights). A host that only wants the Gantt can import `GanttView` directly
 * instead.
 */

import { useCallback, useMemo, useState } from 'react'
import { EmptyState } from '@appkitjs/ui'
import { formatISODate, parseDate, todayDate } from '../dates'
import {
  buildIndentTaskUpdates,
  buildOutdentTaskUpdates,
  buildReorderTaskUpdates,
  rollupScheduleTasks,
  sortTasksByOrder,
} from '../hierarchy'
import { applyQuickFilter, buildScheduleInsights, filterTasks } from '../insights'
import type { ScheduleLevelingMove } from '../leveling'
import type {
  ScheduleData,
  ScheduleDependencyInput,
  ScheduleFilters,
  ScheduleQuickFilter,
  ScheduleTask,
  ScheduleTaskPatchInput,
  ZoomLevel,
} from '../types'
import { emptyFilters } from '../types'
import { BoardView } from './board-view'
import { GanttView } from './gantt-view'
import { LevelingPanel } from './leveling-panel'
import { ListView } from './list-view'
import { ScheduleContextMenu, useScheduleContextMenu } from './schedule-context-menu'
import { ScheduleFiltersBar } from './schedule-filters'
import {
  ScheduleManagementDialog,
  type ScheduleBaselineInput,
  type ScheduleCalendarInput,
  type ScheduleResourceInput,
} from './schedule-management'
import { ScheduleToolbar, type ScheduleView } from './schedule-toolbar'
import { TaskEditor } from './task-editor'
import { useSchedulingLabels } from './context'

/**
 * Everything the workspace can ask the host to persist. Every method resolves
 * `true` on success; returning `false` rolls back the optimistic UI instead of
 * leaving the screen disagreeing with the database.
 */
export interface ScheduleAdapter {
  createTask: (input: ScheduleTaskPatchInput & { name: string }) => Promise<boolean>
  updateTask: (taskId: string, patch: ScheduleTaskPatchInput) => Promise<boolean>
  batchUpdateTasks: (updates: Array<{ id: string } & ScheduleTaskPatchInput>) => Promise<boolean>
  deleteTask: (taskId: string) => Promise<boolean>
  createDependency: (input: ScheduleDependencyInput) => Promise<boolean>
  deleteDependency: (dependencyId: string) => Promise<boolean>
  createCalendar?: (input: ScheduleCalendarInput) => Promise<boolean>
  updateCalendar?: (calendarId: string, patch: Partial<ScheduleCalendarInput>) => Promise<boolean>
  deleteCalendar?: (calendarId: string) => Promise<boolean>
  createResource?: (input: ScheduleResourceInput) => Promise<boolean>
  updateResource?: (resourceId: string, patch: Partial<ScheduleResourceInput>) => Promise<boolean>
  deleteResource?: (resourceId: string) => Promise<boolean>
  createBaseline?: (input: ScheduleBaselineInput) => Promise<boolean>
  deleteBaseline?: (baselineId: string) => Promise<boolean>
}

export interface ScheduleWorkspaceProps {
  data: ScheduleData
  adapter: ScheduleAdapter
  /** Plan window the timeline centres on; falls back to the task dates. */
  dateWorkStart?: string | null
  dateWorkEnd?: string | null
  className?: string
  onOpenImport?: () => void
  onExportPdf?: () => void
}

const ZOOM_ORDER: ZoomLevel[] = ['month', 'week', 'day']
/** Days the timeline shifts per prev/next step, by zoom level. */
const SCROLL_STEP: Record<ZoomLevel, number> = { day: 14, week: 28, month: 90 }

export function ScheduleWorkspace({
  data,
  adapter,
  dateWorkStart = null,
  dateWorkEnd = null,
  className,
  onOpenImport,
  onExportPdf,
}: ScheduleWorkspaceProps) {
  const labels = useSchedulingLabels()
  const [view, setView] = useState<ScheduleView>('gantt')
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week')
  const [scrollOffset, setScrollOffset] = useState(0)
  const [filters, setFilters] = useState<ScheduleFilters>(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [quickFilter, setQuickFilter] = useState<ScheduleQuickFilter>('all')
  const [showCriticalPath, setShowCriticalPath] = useState(true)
  const [showBaseline, setShowBaseline] = useState(false)
  const [activeBaselineId, setActiveBaselineId] = useState(
    data.baselines.find((b) => b.isPrimary)?.id ?? data.baselines[0]?.id ?? '',
  )
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [levelingOpen, setLevelingOpen] = useState(false)
  const { menu, handleContextMenu, closeMenu } = useScheduleContextMenu()

  const assignmentsByTaskId = useMemo(() => {
    const map = new Map<string, typeof data.assignments>()
    for (const assignment of data.assignments) {
      if (!map.has(assignment.taskId)) map.set(assignment.taskId, [])
      map.get(assignment.taskId)!.push(assignment)
    }
    return map
  }, [data.assignments])

  /**
   * Tasks with the selected baseline overlaid, then rolled up. Order matters:
   * a summary's baseline must be derived from its children's baselines, not
   * from whatever was stored on the parent row.
   */
  const tasks = useMemo(() => {
    const baselineByTaskId = new Map(
      data.baselineTasks
        .filter((bt) => !activeBaselineId || bt.baselineId === activeBaselineId)
        .map((bt) => [bt.taskId, bt]),
    )
    const withBaseline = data.tasks.map((task) => {
      const baseline = baselineByTaskId.get(task.id)
      return baseline
        ? { ...task, baselineStart: baseline.startDate, baselineEnd: baseline.endDate }
        : task
    })
    return rollupScheduleTasks(sortTasksByOrder(withBaseline))
  }, [activeBaselineId, data.baselineTasks, data.tasks])

  const insights = useMemo(
    () =>
      buildScheduleInsights(tasks, data.dependencies, todayDate(), {
        calendars: data.calendars,
        resources: data.resources,
        taskAssignments: data.assignments,
      }),
    [data.assignments, data.calendars, data.dependencies, data.resources, tasks],
  )

  const visibleTasks = useMemo(
    () => applyQuickFilter(filterTasks(tasks, filters), quickFilter, insights),
    [filters, insights, quickFilter, tasks],
  )

  const assignees = useMemo(
    () => [...new Set(tasks.map((task) => task.assignee).filter(Boolean))].sort(),
    [tasks],
  )

  const defaultCalendar = useMemo(
    () => data.calendars.find((calendar) => calendar.isDefault) ?? data.calendars[0] ?? null,
    [data.calendars],
  )

  /** Plan window: explicit props win, otherwise the tasks' own extremes. */
  const planWindow = useMemo(() => {
    if (dateWorkStart || dateWorkEnd) return { start: dateWorkStart, end: dateWorkEnd }
    const starts = tasks.map((t) => parseDate(t.startDate)).filter((d): d is Date => !!d)
    const ends = tasks.map((t) => parseDate(t.endDate)).filter((d): d is Date => !!d)
    return {
      start: starts.length ? formatISODate(new Date(Math.min(...starts.map((d) => d.getTime())))) : null,
      end: ends.length ? formatISODate(new Date(Math.max(...ends.map((d) => d.getTime())))) : null,
    }
  }, [dateWorkEnd, dateWorkStart, tasks])

  const editingTask = editingTaskId ? (tasks.find((t) => t.id === editingTaskId) ?? null) : null

  const handleReorder = useCallback(
    async (
      taskId: string,
      targetTaskId: string,
      placement: 'before' | 'after' | 'inside',
      depth?: number,
    ) => {
      const updates = buildReorderTaskUpdates(tasks, taskId, targetTaskId, placement, depth)
      if (updates.length === 0) return false
      return adapter.batchUpdateTasks(updates)
    },
    [adapter, tasks],
  )

  const handleIndent = useCallback(
    async (taskId: string) => {
      const updates = buildIndentTaskUpdates(tasks, taskId)
      if (updates.length === 0) return false
      return adapter.batchUpdateTasks(updates)
    },
    [adapter, tasks],
  )

  const handleOutdent = useCallback(
    async (taskId: string) => {
      const updates = buildOutdentTaskUpdates(tasks, taskId)
      if (updates.length === 0) return false
      return adapter.batchUpdateTasks(updates)
    },
    [adapter, tasks],
  )

  /** Move one row past its neighbour in display order. */
  const handleMove = useCallback(
    async (taskId: string, direction: 'up' | 'down') => {
      const ordered = sortTasksByOrder(tasks)
      const index = ordered.findIndex((task) => task.id === taskId)
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      const target = ordered[targetIndex]
      if (index < 0 || !target) return false
      return handleReorder(taskId, target.id, direction === 'up' ? 'before' : 'after')
    },
    [handleReorder, tasks],
  )

  const handleAddTask = useCallback(async () => {
    const start = todayDate()
    await adapter.createTask({
      name: '',
      taskType: 'task',
      status: 'not_started',
      startDate: formatISODate(start),
      endDate: formatISODate(start),
      duration: 1,
      progress: 0,
      order: tasks.length + 1,
    })
  }, [adapter, tasks.length])

  const handleApplyLeveling = useCallback(
    async (moves: ScheduleLevelingMove[]) =>
      adapter.batchUpdateTasks(
        moves.map((move) => ({ id: move.taskId, startDate: move.toStart, endDate: move.toEnd })),
      ),
    [adapter],
  )

  const zoomIndex = ZOOM_ORDER.indexOf(zoomLevel)

  const sharedViewProps = {
    insights,
    phases: data.phases,
    onClickTask: (task: ScheduleTask) => setEditingTaskId(task.id),
    onContextMenu: handleContextMenu,
  }

  return (
    <div className={className}>
      <div className="flex min-h-0 flex-col">
        <ScheduleToolbar
          view={view}
          onViewChange={setView}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          onZoomIn={() => setZoomLevel(ZOOM_ORDER[Math.min(zoomIndex + 1, ZOOM_ORDER.length - 1)]!)}
          onZoomOut={() => setZoomLevel(ZOOM_ORDER[Math.max(zoomIndex - 1, 0)]!)}
          canZoomIn={zoomIndex < ZOOM_ORDER.length - 1}
          canZoomOut={zoomIndex > 0}
          onScrollPrev={() => setScrollOffset((offset) => offset - SCROLL_STEP[zoomLevel])}
          onScrollToday={() => setScrollOffset(0)}
          onScrollNext={() => setScrollOffset((offset) => offset + SCROLL_STEP[zoomLevel])}
          onAddTask={() => void handleAddTask()}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          filtersActive={filtersOpen}
          insights={insights}
          quickFilter={quickFilter}
          onQuickFilterChange={setQuickFilter}
          showCriticalPath={showCriticalPath}
          onToggleCriticalPath={() => setShowCriticalPath((value) => !value)}
          showBaseline={showBaseline}
          onToggleBaseline={() => setShowBaseline((value) => !value)}
          hasBaseline={data.baselines.length > 0}
          onSaveBaseline={() => {
            setManageOpen(true)
          }}
          onClearBaseline={() => {
            const primary = data.baselines.find((b) => b.isPrimary)
            if (primary) void adapter.deleteBaseline?.(primary.id)
          }}
          baselines={data.baselines}
          activeBaselineId={activeBaselineId}
          onActiveBaselineChange={setActiveBaselineId}
          onOpenManage={() => setManageOpen(true)}
          calendarCount={data.calendars.length}
          resourceCount={data.resources.length}
          dateStart={planWindow.start}
          dateEnd={planWindow.end}
          onOpenImport={onOpenImport}
          onExportPdf={onExportPdf}
          onOpenLeveling={data.resources.length > 0 ? () => setLevelingOpen(true) : undefined}
        />

        {filtersOpen ? (
          <ScheduleFiltersBar
            className="rounded-none border-x border-t-0 border-b-0"
            filters={filters}
            onChange={setFilters}
            phases={data.phases}
            assignees={assignees}
          />
        ) : null}

        {tasks.length === 0 ? (
          <div className="rounded-t-none rounded-b-lg border border-t-0 border-border bg-surface p-10">
            <EmptyState
              title={labels.empty.title}
              description={labels.empty.description}
              action={
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => void handleAddTask()}
                >
                  {labels.empty.action}
                </button>
              }
            />
          </div>
        ) : view === 'gantt' ? (
          <GanttView
            {...sharedViewProps}
            tasks={visibleTasks}
            dependencies={data.dependencies}
            calendar={defaultCalendar}
            zoomLevel={zoomLevel}
            scrollOffset={scrollOffset}
            dateWorkStart={planWindow.start}
            dateWorkEnd={planWindow.end}
            criticalTaskIds={insights.criticalTaskIds}
            showCriticalPath={showCriticalPath}
            showBaseline={showBaseline}
            onUpdateTask={adapter.updateTask}
            onReorderTask={handleReorder}
          />
        ) : view === 'list' ? (
          <ListView
            {...sharedViewProps}
            tasks={visibleTasks}
            resources={data.resources}
            taskAssignmentsByTaskId={assignmentsByTaskId}
            onUpdateTask={adapter.updateTask}
            onBatchUpdateTasks={adapter.batchUpdateTasks}
            onDeleteTask={adapter.deleteTask}
            onReorderTask={handleReorder}
          />
        ) : (
          <BoardView
            {...sharedViewProps}
            tasks={visibleTasks}
            resources={data.resources}
            taskAssignmentsByTaskId={assignmentsByTaskId}
            onUpdateTask={adapter.updateTask}
          />
        )}
      </div>

      <ScheduleContextMenu
        menu={menu}
        onClose={closeMenu}
        onEdit={(task) => setEditingTaskId(task.id)}
        onDelete={(taskId) => void adapter.deleteTask(taskId)}
        onUpdate={(taskId, patch) => void adapter.updateTask(taskId, patch)}
        onIndent={(taskId) => void handleIndent(taskId)}
        onOutdent={(taskId) => void handleOutdent(taskId)}
        onMove={(taskId, direction) => void handleMove(taskId, direction)}
      />

      {editingTask ? (
        <TaskEditor
          task={editingTask}
          phases={data.phases}
          allTasks={tasks}
          dependencies={data.dependencies}
          insights={insights}
          calendars={data.calendars}
          resources={data.resources}
          taskAssignments={assignmentsByTaskId.get(editingTask.id) ?? []}
          onSave={adapter.updateTask}
          onDelete={adapter.deleteTask}
          onCreateDependency={adapter.createDependency}
          onDeleteDependency={adapter.deleteDependency}
          onClose={() => setEditingTaskId(null)}
        />
      ) : null}

      <ScheduleManagementDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        baselines={data.baselines}
        calendars={data.calendars}
        resources={data.resources}
        taskCount={tasks.length}
        onCreateBaseline={async (input) => (await adapter.createBaseline?.(input)) ?? false}
        onDeleteBaseline={async (id) => (await adapter.deleteBaseline?.(id)) ?? false}
        onCreateCalendar={async (input) => (await adapter.createCalendar?.(input)) ?? false}
        onUpdateCalendar={async (id, patch) => (await adapter.updateCalendar?.(id, patch)) ?? false}
        onDeleteCalendar={async (id) => (await adapter.deleteCalendar?.(id)) ?? false}
        onCreateResource={async (input) => (await adapter.createResource?.(input)) ?? false}
        onUpdateResource={async (id, patch) => (await adapter.updateResource?.(id, patch)) ?? false}
        onDeleteResource={async (id) => (await adapter.deleteResource?.(id)) ?? false}
      />

      <LevelingPanel
        open={levelingOpen}
        onClose={() => setLevelingOpen(false)}
        tasks={tasks}
        dependencies={data.dependencies}
        calendars={data.calendars}
        resources={data.resources}
        assignments={data.assignments}
        onApply={handleApplyLeveling}
      />
    </div>
  )
}
