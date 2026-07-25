/**
 * The work-breakdown outline: parent/child structure, indent/outdent/reorder,
 * and summary rollups.
 *
 * A summary task is never planned directly — its dates, duration, progress and
 * status are DERIVED from its children. That is why the network analysis and
 * the insight probes both exclude summary rows: scheduling a parent alongside
 * its children would double-count the same work.
 */

import { diffDays, formatISODate, parseDate } from './dates'
import type {
  ScheduleTask,
  ScheduleTaskStatus,
  TaskHierarchyInfo,
  TaskTreePlacement,
  TaskTreeUpdate,
} from './types'

/** Deepest outline level the tree tools will produce. */
export const MAX_OUTLINE_LEVEL = 12

export function sortTasksByOrder(tasks: ScheduleTask[]) {
  return [...tasks].sort((a, b) => a.order - b.order)
}

function clampOutlineLevel(level: number) {
  return Math.max(0, Math.min(MAX_OUTLINE_LEVEL, level))
}

/** Explicit summaries plus any task that has acquired children. */
export function getSummaryTaskIds(tasks: ScheduleTask[]): Set<string> {
  const summaryTaskIds = new Set(
    tasks.filter((task) => task.taskType === 'summary').map((task) => task.id),
  )
  const hierarchyInfo = buildTaskHierarchyInfo(tasks)
  for (const [taskId, info] of hierarchyInfo) {
    if (info.hasChildren) summaryTaskIds.add(taskId)
  }
  return summaryTaskIds
}

export function buildTaskHierarchyInfo(tasks: ScheduleTask[]): Map<string, TaskHierarchyInfo> {
  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const childCountByParent = new Map<string, number>()

  const resolveParentId = (task: ScheduleTask) =>
    task.parentTaskId && task.parentTaskId !== task.id && taskById.has(task.parentTaskId)
      ? task.parentTaskId
      : null

  for (const task of orderedTasks) {
    const parentId = resolveParentId(task)
    if (parentId) childCountByParent.set(parentId, (childCountByParent.get(parentId) ?? 0) + 1)
  }

  const infoById = new Map<string, TaskHierarchyInfo>()
  // `trail` makes a corrupt parent cycle render as depth 0 instead of blowing
  // the stack — a schedule with bad data still has to draw.
  const computeDepth = (task: ScheduleTask, trail = new Set<string>()): number => {
    if (trail.has(task.id)) return 0
    trail.add(task.id)
    const parentId = resolveParentId(task)
    const parentTask = parentId ? (taskById.get(parentId) ?? null) : null
    const depth = parentTask ? Math.min(MAX_OUTLINE_LEVEL, computeDepth(parentTask, trail) + 1) : 0
    trail.delete(task.id)
    return depth
  }

  for (const task of orderedTasks) {
    const childCount = childCountByParent.get(task.id) ?? 0
    infoById.set(task.id, {
      depth: computeDepth(task),
      parentId: resolveParentId(task),
      hasChildren: childCount > 0,
      childCount,
    })
  }

  return infoById
}

function getTaskChildrenByParent(tasks: ScheduleTask[]) {
  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const childrenByParent = new Map<string, ScheduleTask[]>()

  for (const task of orderedTasks) {
    const parentId =
      task.parentTaskId && task.parentTaskId !== task.id && taskById.has(task.parentTaskId)
        ? task.parentTaskId
        : null
    if (!parentId) continue
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId)!.push(task)
  }

  return { orderedTasks, taskById, childrenByParent }
}

function computeSummaryStatus(children: ScheduleTask[]): ScheduleTaskStatus {
  if (children.length === 0) return 'not_started'
  if (children.every((child) => child.status === 'complete')) return 'complete'
  if (children.every((child) => child.status === 'on_hold')) return 'on_hold'
  const anyStarted = children.some(
    (child) =>
      child.status === 'in_progress' ||
      child.status === 'complete' ||
      (child.progress ?? 0) > 0 ||
      !!child.actualStart ||
      !!child.actualEnd,
  )
  if (anyStarted) return 'in_progress'
  if (children.some((child) => child.status === 'on_hold')) return 'on_hold'
  return 'not_started'
}

/** Duration-weighted progress: a 20-day task outweighs a 1-day task. */
function computeRollupProgress(children: ScheduleTask[]) {
  if (children.length === 0) return 0
  const totalWeight = children.reduce((sum, child) => sum + Math.max(1, child.duration ?? 0), 0)
  if (totalWeight <= 0) return 0
  const progress = children.reduce(
    (sum, child) => sum + (child.progress ?? 0) * Math.max(1, child.duration ?? 0),
    0,
  )
  return Math.max(0, Math.min(1, progress / totalWeight))
}

/**
 * Return the task list with every parent replaced by its rolled-up summary.
 * Pure — the input rows are never mutated, so a host can render rollups
 * without writing derived values back to storage.
 */
export function rollupScheduleTasks(tasks: ScheduleTask[]): ScheduleTask[] {
  const { orderedTasks, taskById, childrenByParent } = getTaskChildrenByParent(tasks)
  const rolledById = new Map<string, ScheduleTask>()

  const rollTask = (taskId: string): ScheduleTask => {
    const cached = rolledById.get(taskId)
    if (cached) return cached

    const task = taskById.get(taskId)!
    const rolledChildren = (childrenByParent.get(taskId) ?? []).map((child) => rollTask(child.id))
    if (rolledChildren.length === 0) {
      rolledById.set(taskId, task)
      return task
    }

    const earliest = (values: (Date | null)[]) => {
      const times = values.filter((value): value is Date => !!value).map((value) => value.getTime())
      return times.length > 0 ? new Date(Math.min(...times)) : null
    }
    const latest = (values: (Date | null)[]) => {
      const times = values.filter((value): value is Date => !!value).map((value) => value.getTime())
      return times.length > 0 ? new Date(Math.max(...times)) : null
    }

    const earliestStart = earliest(
      rolledChildren.map((child) => parseDate(child.startDate ?? child.endDate)),
    )
    const latestEnd = latest(rolledChildren.map((child) => parseDate(child.endDate ?? child.startDate)))
    const earliestBaselineStart = earliest(
      rolledChildren.map((child) => parseDate(child.baselineStart ?? child.baselineEnd)),
    )
    const latestBaselineEnd = latest(
      rolledChildren.map((child) => parseDate(child.baselineEnd ?? child.baselineStart)),
    )
    const actualStarts = rolledChildren.map((child) => parseDate(child.actualStart))
    const actualEnds = rolledChildren
      .map((child) => parseDate(child.actualEnd))
      .filter((value): value is Date => !!value)

    const rolledTask: ScheduleTask = {
      ...task,
      taskType: 'summary',
      startDate: earliestStart ? formatISODate(earliestStart) : task.startDate,
      endDate: latestEnd ? formatISODate(latestEnd) : task.endDate,
      duration:
        earliestStart && latestEnd ? Math.max(0, diffDays(latestEnd, earliestStart)) : task.duration,
      progress: computeRollupProgress(rolledChildren),
      status: computeSummaryStatus(rolledChildren),
      actualStart: (() => {
        const value = earliest(actualStarts)
        return value ? formatISODate(value) : null
      })(),
      // A parent has only actually finished once EVERY child has.
      actualEnd:
        actualEnds.length === rolledChildren.length && actualEnds.length > 0
          ? formatISODate(new Date(Math.max(...actualEnds.map((value) => value.getTime()))))
          : null,
      baselineStart: earliestBaselineStart
        ? formatISODate(earliestBaselineStart)
        : task.baselineStart,
      baselineEnd: latestBaselineEnd ? formatISODate(latestBaselineEnd) : task.baselineEnd,
    }
    rolledById.set(taskId, rolledTask)
    return rolledTask
  }

  return orderedTasks.map((task) => rollTask(task.id))
}

export function getTaskDescendantIds(tasks: ScheduleTask[], taskId: string): string[] {
  const { childrenByParent } = getTaskChildrenByParent(tasks)
  const descendants: string[] = []
  const visited = new Set<string>()

  const walk = (parentId: string) => {
    if (visited.has(parentId)) return
    visited.add(parentId)
    for (const child of childrenByParent.get(parentId) ?? []) {
      descendants.push(child.id)
      walk(child.id)
    }
  }

  walk(taskId)
  return descendants
}

export function getTaskSubtreeIds(tasks: ScheduleTask[], taskId: string): string[] {
  return [taskId, ...getTaskDescendantIds(tasks, taskId)]
}

export function getTaskAncestorIds(tasks: ScheduleTask[], taskId: string): string[] {
  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const ancestors: string[] = []
  const visited = new Set<string>()
  let current = taskById.get(taskId) ?? null

  while (current?.parentTaskId && !visited.has(current.parentTaskId)) {
    const parent = taskById.get(current.parentTaskId) ?? null
    if (!parent) break
    ancestors.push(parent.id)
    visited.add(parent.id)
    current = parent
  }

  return ancestors
}

/** Indent under the row above — the outline-editing gesture users expect. */
export function buildIndentTaskUpdates(tasks: ScheduleTask[], taskId: string): TaskTreeUpdate[] {
  const orderedTasks = sortTasksByOrder(tasks)
  const hierarchyInfo = buildTaskHierarchyInfo(orderedTasks)
  const taskIndex = orderedTasks.findIndex((task) => task.id === taskId)
  if (taskIndex <= 0) return []

  const task = orderedTasks[taskIndex]!
  const previousTask = orderedTasks[taskIndex - 1]!
  const currentDepth = hierarchyInfo.get(taskId)?.depth ?? task.outlineLevel ?? 0
  const nextDepth = clampOutlineLevel(
    (hierarchyInfo.get(previousTask.id)?.depth ?? previousTask.outlineLevel ?? 0) + 1,
  )
  const nextParentId = previousTask.id

  if ((task.parentTaskId ?? null) === nextParentId && currentDepth === nextDepth) return []

  return [{ id: task.id, parentTaskId: nextParentId, outlineLevel: nextDepth }]
}

export function buildOutdentTaskUpdates(tasks: ScheduleTask[], taskId: string): TaskTreeUpdate[] {
  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const hierarchyInfo = buildTaskHierarchyInfo(orderedTasks)
  const task = taskById.get(taskId)
  if (!task?.parentTaskId) return []

  const parentTask = taskById.get(task.parentTaskId)
  if (!parentTask) return []

  const currentDepth = hierarchyInfo.get(taskId)?.depth ?? task.outlineLevel ?? 0
  const nextParentId = hierarchyInfo.get(parentTask.id)?.parentId ?? parentTask.parentTaskId ?? null
  const nextDepth = clampOutlineLevel(currentDepth - 1)

  return [{ id: task.id, parentTaskId: nextParentId, outlineLevel: nextDepth }]
}

function findSubtreeEndIndex(tasks: ScheduleTask[], taskId: string) {
  const subtreeIds = new Set(getTaskSubtreeIds(tasks, taskId))
  let endIndex = tasks.findIndex((task) => task.id === taskId)
  for (let index = endIndex; index < tasks.length; index += 1) {
    if (subtreeIds.has(tasks[index]!.id)) endIndex = index
  }
  return endIndex
}

function findNearestPreviousTaskAtDepth(
  tasks: ScheduleTask[],
  hierarchyInfo: Map<string, TaskHierarchyInfo>,
  beforeIndex: number,
  depth: number,
) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const candidate = tasks[index]!
    const candidateDepth = hierarchyInfo.get(candidate.id)?.depth ?? candidate.outlineLevel ?? 0
    if (candidateDepth === depth) return candidate
  }
  return null
}

/**
 * Move a task (with its whole subtree) relative to another row and return the
 * minimal set of patches. Dropping a task inside its own subtree is refused —
 * that would orphan the branch.
 */
export function buildReorderTaskUpdates(
  tasks: ScheduleTask[],
  taskId: string,
  targetTaskId: string,
  placement: TaskTreePlacement,
  depthHint?: number,
): TaskTreeUpdate[] {
  if (taskId === targetTaskId) return []

  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const hierarchyInfo = buildTaskHierarchyInfo(orderedTasks)
  const task = taskById.get(taskId)
  const targetTask = taskById.get(targetTaskId)
  if (!task || !targetTask) return []

  const blockIds = new Set(getTaskSubtreeIds(orderedTasks, taskId))
  if (blockIds.has(targetTaskId)) return []

  const taskBlock = orderedTasks.filter((item) => blockIds.has(item.id))
  if (taskBlock.length === 0) return []

  const remainingTasks = orderedTasks.filter((item) => !blockIds.has(item.id))
  const targetIndex = remainingTasks.findIndex((item) => item.id === targetTaskId)
  if (targetIndex < 0) return []

  let nextParentId: string | null = null
  let nextDepth = 0
  let insertIndex: number
  const targetDepth = hierarchyInfo.get(targetTask.id)?.depth ?? targetTask.outlineLevel ?? 0

  if (placement === 'inside') {
    nextParentId = targetTask.id
    nextDepth = clampOutlineLevel(targetDepth + 1)
    insertIndex = findSubtreeEndIndex(remainingTasks, targetTaskId) + 1
  } else {
    insertIndex =
      placement === 'before' ? targetIndex : findSubtreeEndIndex(remainingTasks, targetTaskId) + 1
    const requestedDepth = clampOutlineLevel(depthHint ?? targetDepth)
    const previousTask = remainingTasks[insertIndex - 1] ?? null
    const previousDepth = previousTask
      ? (hierarchyInfo.get(previousTask.id)?.depth ?? previousTask.outlineLevel ?? 0)
      : -1
    // You can only ever be one level deeper than the row above you.
    let resolvedDepth = Math.min(requestedDepth, previousDepth + 1)

    while (resolvedDepth > 0) {
      const parentTask = findNearestPreviousTaskAtDepth(
        remainingTasks,
        hierarchyInfo,
        insertIndex,
        resolvedDepth - 1,
      )
      if (parentTask) {
        nextParentId = parentTask.id
        nextDepth = resolvedDepth
        break
      }
      resolvedDepth -= 1
    }

    if (resolvedDepth <= 0) {
      nextParentId = null
      nextDepth = 0
    }
  }

  const nextOrder = [
    ...remainingTasks.slice(0, insertIndex),
    ...taskBlock,
    ...remainingTasks.slice(insertIndex),
  ]
  const currentDepth = hierarchyInfo.get(taskId)?.depth ?? task.outlineLevel ?? 0

  return nextOrder.flatMap((item, index) => {
    const patch: Omit<TaskTreeUpdate, 'id'> = {}
    const nextOrderValue = index + 1
    if (item.order !== nextOrderValue) patch.order = nextOrderValue
    if (item.id === taskId) {
      if ((item.parentTaskId ?? null) !== (nextParentId ?? null)) patch.parentTaskId = nextParentId
      if (currentDepth !== nextDepth) patch.outlineLevel = nextDepth
    }
    return Object.keys(patch).length > 0 ? [{ id: item.id, ...patch }] : []
  })
}

/** Depth-first display order, honouring collapsed parents. */
export function getVisibleTaskOrder(
  tasks: ScheduleTask[],
  collapsedTaskIds: Set<string> = new Set(),
) {
  const { orderedTasks, taskById, childrenByParent } = getTaskChildrenByParent(tasks)
  const orderedIds: string[] = []

  const visit = (task: ScheduleTask) => {
    orderedIds.push(task.id)
    if (collapsedTaskIds.has(task.id)) return
    for (const child of childrenByParent.get(task.id) ?? []) visit(child)
  }

  for (const task of orderedTasks) {
    const hasValidParent =
      task.parentTaskId && task.parentTaskId !== task.id && taskById.has(task.parentTaskId)
    if (!hasValidParent) visit(task)
  }

  return orderedIds
}

export function getVisibleTasks(tasks: ScheduleTask[], collapsedTaskIds: Set<string> = new Set()) {
  const orderedTasks = sortTasksByOrder(tasks)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  return getVisibleTaskOrder(tasks, collapsedTaskIds)
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is ScheduleTask => !!task)
}
