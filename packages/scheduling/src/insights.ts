/**
 * Schedule health: one pass over the plan that answers every question the
 * toolbar, quick filters and status badges ask.
 *
 * The probes are deliberately separate sets rather than a single "is this task
 * bad" flag, so a surface can explain WHY a row needs attention — missing
 * dates, a blown deadline, a violated constraint, an actual-date
 * contradiction, broken logic, or an overbooked resource.
 */

import {
  addDays,
  diffDays,
  formatISODate,
  isWorkingDay,
  normalizeCalendarDate,
  parseDate,
  todayDate,
} from './dates'
import { getSummaryTaskIds, getTaskAncestorIds, sortTasksByOrder } from './hierarchy'
import { analyzeScheduleNetwork, computeDependencyViolations } from './network'
import type {
  ScheduleCalendar,
  ScheduleDependency,
  ScheduleFilters,
  ScheduleInsightOptions,
  ScheduleInsights,
  ScheduleQuickFilter,
  ScheduleTask,
  ScheduleTaskVariance,
} from './types'

/** The working days a task actually occupies, on its effective calendar. */
export function getTaskWorkingDates(task: ScheduleTask, calendar?: ScheduleCalendar | null) {
  const startDate = parseDate(task.actualStart ?? task.startDate)
  const endDate = parseDate(task.actualEnd ?? task.endDate)
  if (!startDate && !endDate) return []

  const resolvedStart = startDate ?? endDate!
  const resolvedEnd = endDate ?? startDate!
  const activeDates: Date[] = []

  if (resolvedEnd.getTime() <= resolvedStart.getTime()) {
    if (isWorkingDay(resolvedStart, calendar)) activeDates.push(resolvedStart)
    return activeDates
  }

  for (
    let current = normalizeCalendarDate(resolvedStart);
    current.getTime() < resolvedEnd.getTime();
    current = addDays(current, 1)
  ) {
    if (isWorkingDay(current, calendar)) activeDates.push(current)
  }

  // A task planned entirely across non-working days still consumes its start.
  if (activeDates.length === 0 && isWorkingDay(resolvedStart, calendar)) {
    activeDates.push(resolvedStart)
  }

  return activeDates
}

/** Drift against the baseline, in days. Positive finish variance = late. */
export function getTaskVariance(task: ScheduleTask): ScheduleTaskVariance {
  const startDate = parseDate(task.actualStart ?? task.startDate)
  const endDate = parseDate(task.actualEnd ?? task.endDate)
  const baselineStart = parseDate(task.baselineStart)
  const baselineEnd = parseDate(task.baselineEnd)
  const startDays = startDate && baselineStart ? diffDays(startDate, baselineStart) : null
  const finishDays = endDate && baselineEnd ? diffDays(endDate, baselineEnd) : null
  const hasVariance = startDays !== null || finishDays !== null
  const largestVariance = Math.max(startDays ?? 0, finishDays ?? 0)
  const smallestVariance = Math.min(startDays ?? 0, finishDays ?? 0)

  return {
    startDays,
    finishDays,
    hasVariance,
    isBehind: largestVariance > 0,
    isAhead: smallestVariance < 0,
  }
}

/** Accept 0–1 or 0–100 and clamp; hosts differ on which they store. */
export function normalizeScheduleProgress(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const fraction = value > 1 ? value / 100 : value
  return Math.max(0, Math.min(1, fraction))
}

export function isTaskOverdue(task: ScheduleTask, referenceDate = todayDate()) {
  if (task.status === 'complete') return false
  const endDate = parseDate(task.endDate)
  if (!endDate) return false
  return endDate.getTime() < referenceDate.getTime()
}

/** Is the task live inside the next `lookaheadDays` window? */
export function isTaskInLookahead(
  task: ScheduleTask,
  lookaheadDays: number,
  referenceDate = todayDate(),
) {
  if (task.status === 'complete') return false

  const rawStart = parseDate(task.startDate)
  const rawEnd = parseDate(task.endDate)
  const startDate = rawStart ?? rawEnd
  const endDate = rawEnd ?? rawStart
  if (!startDate || !endDate) return false

  const windowEnd = addDays(referenceDate, lookaheadDays)
  return endDate.getTime() >= referenceDate.getTime() && startDate.getTime() <= windowEnd.getTime()
}

export function buildScheduleInsights(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
  referenceDate = todayDate(),
  options: ScheduleInsightOptions = {},
): ScheduleInsights {
  const summaryTaskIds = getSummaryTaskIds(tasks)
  const leafTasks = tasks.filter((task) => !summaryTaskIds.has(task.id))
  const network = analyzeScheduleNetwork(tasks, dependencies)
  const dependencyViolations = computeDependencyViolations(tasks, dependencies)
  const calendarById = new Map((options.calendars ?? []).map((calendar) => [calendar.id, calendar]))
  const resourceById = new Map((options.resources ?? []).map((resource) => [resource.id, resource]))
  const assignmentsByTaskId = new Map<string, { resourceId: string; units: number }[]>()
  for (const assignment of options.taskAssignments ?? []) {
    if (!assignmentsByTaskId.has(assignment.taskId)) assignmentsByTaskId.set(assignment.taskId, [])
    assignmentsByTaskId.get(assignment.taskId)!.push(assignment)
  }

  const violatingDependencyIds = new Set(dependencyViolations.map((v) => v.dependencyId))
  const violatingTaskIds = new Set<string>()
  for (const violation of dependencyViolations) {
    violatingTaskIds.add(violation.predecessorId)
    violatingTaskIds.add(violation.successorId)
  }

  const predecessorCounts = new Map<string, number>()
  const successorCounts = new Map<string, number>()
  for (const dependency of dependencies) {
    predecessorCounts.set(
      dependency.successorId,
      (predecessorCounts.get(dependency.successorId) ?? 0) + 1,
    )
    successorCounts.set(
      dependency.predecessorId,
      (successorCounts.get(dependency.predecessorId) ?? 0) + 1,
    )
  }

  const overdueTaskIds = new Set<string>()
  const lookahead14TaskIds = new Set<string>()
  const lookahead28TaskIds = new Set<string>()
  const varianceTaskIds = new Set<string>()
  const behindBaselineTaskIds = new Set<string>()
  const missingDateTaskIds = new Set<string>()
  const unassignedTaskIds = new Set<string>()
  const isolatedTaskIds = new Set<string>()
  const openEndedTaskIds = new Set<string>()
  const deadlineMissTaskIds = new Set<string>()
  const constraintViolationTaskIds = new Set<string>()
  const actualDateGapTaskIds = new Set<string>()
  const resourceConflictTaskIds = new Set<string>()
  const overallocatedResourceIds = new Set<string>()
  const resourceOverloadByResource = new Map<string, number>()
  const attentionTaskIds = new Set<string>()

  let milestoneTasks = 0
  let completeTasks = 0
  let inProgressTasks = 0

  const resourceLoadByDay = new Map<string, Map<string, number>>()

  for (const task of leafTasks) {
    if (task.taskType === 'milestone') milestoneTasks += 1
    if (task.status === 'complete') completeTasks += 1
    if (task.status === 'in_progress') inProgressTasks += 1

    if (!task.startDate || !task.endDate) {
      missingDateTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    if (!task.assignee.trim()) unassignedTaskIds.add(task.id)

    const deadlineDate = parseDate(task.deadlineDate)
    const finishDate = parseDate(task.actualEnd ?? task.endDate)
    if (deadlineDate && finishDate && finishDate.getTime() > deadlineDate.getTime()) {
      deadlineMissTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    const constraintDate = parseDate(task.constraintDate)
    const plannedStart = parseDate(task.actualStart ?? task.startDate)
    if (constraintDate) {
      const startCompare =
        plannedStart &&
        ((task.constraintType === 'snet' && plannedStart.getTime() < constraintDate.getTime()) ||
          (task.constraintType === 'snlt' && plannedStart.getTime() > constraintDate.getTime()) ||
          (task.constraintType === 'mso' && diffDays(plannedStart, constraintDate) !== 0))
      const finishCompare =
        finishDate &&
        ((task.constraintType === 'fnet' && finishDate.getTime() < constraintDate.getTime()) ||
          (task.constraintType === 'fnlt' && finishDate.getTime() > constraintDate.getTime()) ||
          (task.constraintType === 'mfo' && diffDays(finishDate, constraintDate) !== 0))
      if (startCompare || finishCompare) {
        constraintViolationTaskIds.add(task.id)
        attentionTaskIds.add(task.id)
      }
    }

    // Progress reporting that contradicts itself: started with no start, or
    // finished without a finish date.
    if (
      (task.actualStart && task.status === 'not_started') ||
      (task.actualEnd && task.status !== 'complete') ||
      (task.status === 'complete' && !task.actualEnd)
    ) {
      actualDateGapTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    if (isTaskOverdue(task, referenceDate)) {
      overdueTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    if (isTaskInLookahead(task, 14, referenceDate)) lookahead14TaskIds.add(task.id)
    if (isTaskInLookahead(task, 28, referenceDate)) lookahead28TaskIds.add(task.id)

    const variance = getTaskVariance(task)
    if (variance.hasVariance) varianceTaskIds.add(task.id)
    if (variance.isBehind) {
      behindBaselineTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    const predecessorCount = predecessorCounts.get(task.id) ?? 0
    const successorCount = successorCounts.get(task.id) ?? 0
    if (predecessorCount === 0 && successorCount === 0) {
      isolatedTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }
    // Dangling logic: unfinished work nothing depends on can slip unnoticed.
    if (task.taskType !== 'milestone' && task.status !== 'complete' && successorCount === 0) {
      openEndedTaskIds.add(task.id)
      attentionTaskIds.add(task.id)
    }

    const taskAssignments = assignmentsByTaskId.get(task.id) ?? []
    const taskCalendar = task.calendarId ? calendarById.get(task.calendarId) : null
    for (const assignment of taskAssignments) {
      const resource = resourceById.get(assignment.resourceId)
      const workingCalendar =
        (resource?.calendarId ? calendarById.get(resource.calendarId) : null) ?? taskCalendar ?? null
      for (const date of getTaskWorkingDates(task, workingCalendar)) {
        const dayKey = formatISODate(date)
        if (!resourceLoadByDay.has(assignment.resourceId)) {
          resourceLoadByDay.set(assignment.resourceId, new Map())
        }
        const dayLoad = resourceLoadByDay.get(assignment.resourceId)!
        dayLoad.set(dayKey, (dayLoad.get(dayKey) ?? 0) + (assignment.units ?? resource?.defaultUnits ?? 1))
      }
    }
  }

  for (const taskId of violatingTaskIds) attentionTaskIds.add(taskId)

  for (const [resourceId, loadByDay] of resourceLoadByDay) {
    const resource = resourceById.get(resourceId)
    const capacity = resource?.capacityPerDay ?? resource?.defaultUnits ?? 1
    let maxOverload = 0

    for (const load of loadByDay.values()) {
      const overload = load - capacity
      if (overload > 0) maxOverload = Math.max(maxOverload, overload)
    }

    if (maxOverload > 0) {
      overallocatedResourceIds.add(resourceId)
      resourceOverloadByResource.set(resourceId, maxOverload)
      for (const task of leafTasks) {
        if ((assignmentsByTaskId.get(task.id) ?? []).some((a) => a.resourceId === resourceId)) {
          resourceConflictTaskIds.add(task.id)
          attentionTaskIds.add(task.id)
        }
      }
    }
  }

  return {
    totalTasks: leafTasks.length,
    milestoneTasks,
    completeTasks,
    inProgressTasks,
    criticalTaskIds: network.criticalTaskIds,
    totalFloatByTask: network.totalFloatByTask,
    overdueTaskIds,
    lookahead14TaskIds,
    lookahead28TaskIds,
    varianceTaskIds,
    behindBaselineTaskIds,
    missingDateTaskIds,
    unassignedTaskIds,
    isolatedTaskIds,
    openEndedTaskIds,
    deadlineMissTaskIds,
    constraintViolationTaskIds,
    actualDateGapTaskIds,
    resourceConflictTaskIds,
    overallocatedResourceIds,
    resourceOverloadByResource,
    attentionTaskIds,
    dependencyViolations,
    violatingDependencyIds,
    violatingTaskIds,
    hasCycle: network.hasCycle,
  }
}

/**
 * Narrow to a quick-filter set, keeping every matching row's ancestors so the
 * outline stays navigable instead of collapsing into orphaned children.
 */
export function applyQuickFilter(
  tasks: ScheduleTask[],
  quickFilter: ScheduleQuickFilter,
  insights: ScheduleInsights,
): ScheduleTask[] {
  if (quickFilter === 'all') return tasks

  const allowedIds =
    quickFilter === 'lookahead_14'
      ? insights.lookahead14TaskIds
      : quickFilter === 'lookahead_28'
        ? insights.lookahead28TaskIds
        : quickFilter === 'critical'
          ? insights.criticalTaskIds
          : quickFilter === 'overdue'
            ? insights.overdueTaskIds
            : quickFilter === 'variance'
              ? insights.behindBaselineTaskIds
              : insights.attentionTaskIds

  const expandedIds = new Set<string>(allowedIds)
  for (const task of tasks) {
    if (!allowedIds.has(task.id)) continue
    for (const ancestorId of getTaskAncestorIds(tasks, task.id)) expandedIds.add(ancestorId)
  }

  return tasks.filter((task) => expandedIds.has(task.id))
}

export function filterTasks(tasks: ScheduleTask[], filters: ScheduleFilters): ScheduleTask[] {
  return tasks.filter((task) => {
    if (filters.phaseIds.length > 0 && !filters.phaseIds.includes(task.phaseId ?? '')) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
    if (filters.assignees.length > 0 && !filters.assignees.includes(task.assignee)) return false

    if (filters.dateFrom) {
      const from = parseDate(filters.dateFrom)
      const endDate = parseDate(task.endDate)
      if (from && endDate && endDate < from) return false
    }

    if (filters.dateTo) {
      const to = parseDate(filters.dateTo)
      const startDate = parseDate(task.startDate)
      if (to && startDate && startDate > to) return false
    }

    return true
  })
}

export { sortTasksByOrder }
