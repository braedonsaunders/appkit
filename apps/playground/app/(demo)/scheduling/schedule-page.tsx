'use client'

import * as React from 'react'
import { PageContainer, PageHeader } from '@appkit/ui'
import {
  analyzeScheduleNetwork,
  buildResourceLoadSeries,
  levelResources,
  type ScheduleData,
  type ScheduleTask,
  type ScheduleTaskPatchInput,
} from '@appkit/scheduling'
import { ScheduleWorkspace, SchedulingProvider, type ScheduleAdapter } from '@appkit/scheduling/react'
import { buildScheduleSeed } from './seed'

/**
 * The scheduling demo runs entirely in memory: the adapter mutates local state
 * exactly as a real one would mutate a database, so every interaction —
 * dragging bars, re-parenting rows, adding logic, levelling resources — is the
 * real component behaviour, not a mock.
 */
export function SchedulePage() {
  // Anchor once on mount so the plan is stable across re-renders and the
  // server/client markup agrees.
  const [data, setData] = React.useState<ScheduleData | null>(null)
  React.useEffect(() => setData(buildScheduleSeed(new Date())), [])

  const nextId = React.useRef(1)
  const makeId = (prefix: string) => `${prefix}-${nextId.current++}`

  const patchTask = (task: ScheduleTask, patch: ScheduleTaskPatchInput): ScheduleTask => ({
    ...task,
    ...Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => key !== 'resourceAssignments' && value !== undefined),
    ),
  })

  const adapter: ScheduleAdapter = React.useMemo(
    () => ({
      async createTask(input) {
        setData((current) =>
          current
            ? {
                ...current,
                tasks: [
                  ...current.tasks,
                  patchTask(
                    {
                      id: makeId('task'),
                      phaseId: null,
                      calendarId: null,
                      parentTaskId: null,
                      outlineLevel: 0,
                      name: input.name || 'New task',
                      description: '',
                      taskType: 'task',
                      status: 'not_started',
                      startDate: null,
                      endDate: null,
                      duration: 1,
                      progress: 0,
                      assignee: '',
                      order: current.tasks.length + 1,
                      constraintType: 'asap',
                      constraintDate: null,
                      deadlineDate: null,
                      actualStart: null,
                      actualEnd: null,
                      baselineStart: null,
                      baselineEnd: null,
                    },
                    input,
                  ),
                ],
              }
            : current,
        )
        return true
      },
      async updateTask(taskId, patch) {
        setData((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.map((task) => (task.id === taskId ? patchTask(task, patch) : task)),
                assignments: patch.resourceAssignments
                  ? [
                      ...current.assignments.filter((a) => a.taskId !== taskId),
                      ...patch.resourceAssignments.map((a) => ({
                        id: makeId('asg'),
                        taskId,
                        resourceId: a.resourceId,
                        units: a.units ?? 1,
                        role: a.role ?? '',
                      })),
                    ]
                  : current.assignments,
              }
            : current,
        )
        return true
      },
      async batchUpdateTasks(updates) {
        const byId = new Map(updates.map((update) => [update.id, update]))
        setData((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.map((task) => {
                  const update = byId.get(task.id)
                  return update ? patchTask(task, update) : task
                }),
              }
            : current,
        )
        return true
      },
      async deleteTask(taskId) {
        setData((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.filter((task) => task.id !== taskId),
                dependencies: current.dependencies.filter(
                  (dep) => dep.predecessorId !== taskId && dep.successorId !== taskId,
                ),
                assignments: current.assignments.filter((a) => a.taskId !== taskId),
              }
            : current,
        )
        return true
      },
      async createDependency(input) {
        setData((current) =>
          current
            ? {
                ...current,
                dependencies: [
                  ...current.dependencies,
                  {
                    id: makeId('dep'),
                    predecessorId: input.predecessorId,
                    successorId: input.successorId,
                    type: input.type ?? 'FS',
                    lagDays: input.lagDays ?? 0,
                  },
                ],
              }
            : current,
        )
        return true
      },
      async deleteDependency(dependencyId) {
        setData((current) =>
          current
            ? { ...current, dependencies: current.dependencies.filter((d) => d.id !== dependencyId) }
            : current,
        )
        return true
      },
      async createCalendar(input) {
        setData((current) =>
          current
            ? {
                ...current,
                calendars: [...current.calendars, { id: makeId('cal'), ...input }],
              }
            : current,
        )
        return true
      },
      async updateCalendar(calendarId, patch) {
        setData((current) =>
          current
            ? {
                ...current,
                calendars: current.calendars.map((calendar) =>
                  calendar.id === calendarId
                    ? { ...calendar, ...patch }
                    : patch.isDefault
                      ? { ...calendar, isDefault: false }
                      : calendar,
                ),
              }
            : current,
        )
        return true
      },
      async deleteCalendar(calendarId) {
        setData((current) =>
          current
            ? { ...current, calendars: current.calendars.filter((c) => c.id !== calendarId) }
            : current,
        )
        return true
      },
      async createResource(input) {
        setData((current) =>
          current
            ? { ...current, resources: [...current.resources, { id: makeId('res'), ...input }] }
            : current,
        )
        return true
      },
      async updateResource(resourceId, patch) {
        setData((current) =>
          current
            ? {
                ...current,
                resources: current.resources.map((resource) =>
                  resource.id === resourceId ? { ...resource, ...patch } : resource,
                ),
              }
            : current,
        )
        return true
      },
      async deleteResource(resourceId) {
        setData((current) =>
          current
            ? {
                ...current,
                resources: current.resources.filter((r) => r.id !== resourceId),
                assignments: current.assignments.filter((a) => a.resourceId !== resourceId),
              }
            : current,
        )
        return true
      },
      async createBaseline(input) {
        setData((current) => {
          if (!current) return current
          const id = makeId('baseline')
          return {
            ...current,
            baselines: [
              ...current.baselines.map((b) => (input.isPrimary ? { ...b, isPrimary: false } : b)),
              { id, ...input, isPrimary: input.isPrimary },
            ],
            baselineTasks: [
              ...current.baselineTasks,
              ...current.tasks.map((task) => ({
                id: `bt-${id}-${task.id}`,
                baselineId: id,
                taskId: task.id,
                taskName: task.name,
                phaseId: task.phaseId,
                startDate: task.startDate,
                endDate: task.endDate,
                duration: task.duration,
              })),
            ],
          }
        })
        return true
      },
      async deleteBaseline(baselineId) {
        setData((current) =>
          current
            ? {
                ...current,
                baselines: current.baselines.filter((b) => b.id !== baselineId),
                baselineTasks: current.baselineTasks.filter((bt) => bt.baselineId !== baselineId),
              }
            : current,
        )
        return true
      },
    }),
    [],
  )

  const stats = React.useMemo(() => {
    if (!data) return null
    const network = analyzeScheduleNetwork(data.tasks, data.dependencies)
    const leveling = levelResources(data.tasks, data.dependencies, {
      calendars: data.calendars,
      resources: data.resources,
      assignments: data.assignments,
      withinFloatOnly: true,
    })
    const load = buildResourceLoadSeries(data.tasks, {
      calendars: data.calendars,
      resources: data.resources,
      assignments: data.assignments,
    })
    return {
      critical: network.criticalTaskIds.size,
      moves: leveling.moves.length,
      overloaded: load.filter((series) => series.overloadedDays > 0).length,
    }
  }, [data])

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Scheduling"
        description="Critical-path scheduling with a drag-editable Gantt, work-breakdown outline, working calendars, baselines, and resource levelling. Everything on this page runs against an in-memory adapter."
      />

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Critical tasks" value={stats.critical} />
          <Stat label="Levelling moves proposed" value={stats.moves} />
          <Stat label="Overbooked resources" value={stats.overloaded} />
        </div>
      ) : null}

      {data ? (
        <SchedulingProvider>
          <ScheduleWorkspace data={data} adapter={adapter} />
        </SchedulingProvider>
      ) : (
        <div className="h-96 animate-pulse rounded-lg border border-border bg-bg-subtle" />
      )}
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fg">{value}</p>
    </div>
  )
}
