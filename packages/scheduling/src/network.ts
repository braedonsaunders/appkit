/**
 * The dependency network: critical-path analysis, logic violations, and cycle
 * detection.
 *
 * Forward pass → early start/finish. Backward pass → late start/finish. Total
 * float is the difference; zero float is the critical path. Summary rows are
 * excluded throughout — they are derived from their children, so scheduling
 * them would double-count the same work in the longest path.
 */

import { diffDays, parseDate } from './dates'
import { getSummaryTaskIds } from './hierarchy'
import type {
  DependencyEdge,
  ScheduleDependency,
  ScheduleDependencyViolation,
  ScheduleNetworkSummary,
  ScheduleTask,
} from './types'

/** Float within this many days of zero counts as critical. */
const CRITICAL_FLOAT_EPSILON = 0.001

interface ScheduleNetworkNode {
  duration: number
  es: number
  ef: number
  ls: number
  lf: number
  float: number
}

/** Actual dates win over planned ones — the network follows reality. */
export function getTaskDuration(task: ScheduleTask) {
  const startDate = parseDate(task.actualStart ?? task.startDate)
  const endDate = parseDate(task.actualEnd ?? task.endDate)
  if (startDate && endDate) return Math.max(0, diffDays(endDate, startDate))
  return Math.max(0, task.duration ?? 0)
}

/**
 * Days from the predecessor's early START to the successor's early start, for
 * each relationship type. Expressing all four types as an offset from ES keeps
 * the forward/backward passes to a single arithmetic form.
 */
function getDependencyWeight(
  dependency: ScheduleDependency,
  predecessor: ScheduleTask,
  successor: ScheduleTask,
) {
  const predecessorDuration = getTaskDuration(predecessor)
  const successorDuration = getTaskDuration(successor)

  switch (dependency.type) {
    case 'SS':
      return dependency.lagDays
    case 'FF':
      return predecessorDuration - successorDuration + dependency.lagDays
    case 'SF':
      return -successorDuration + dependency.lagDays
    case 'FS':
    default:
      return predecessorDuration + dependency.lagDays
  }
}

export function buildDependencyEdges(dependencies: ScheduleDependency[]): DependencyEdge[] {
  return dependencies.map((dependency) => ({
    id: dependency.id,
    fromId: dependency.predecessorId,
    toId: dependency.successorId,
    type: dependency.type,
    lagDays: dependency.lagDays,
  }))
}

/** The two dates a dependency arrow is drawn between. */
export function resolveDependencyAnchorDates(
  dependency: ScheduleDependency,
  predecessor: ScheduleTask,
  successor: ScheduleTask,
): { from: Date; to: Date } | null {
  const predecessorStart = parseDate(predecessor.startDate)
  const predecessorEnd = parseDate(predecessor.endDate)
  const successorStart = parseDate(successor.startDate)
  const successorEnd = parseDate(successor.endDate)

  switch (dependency.type) {
    case 'SS':
      return predecessorStart && successorStart
        ? { from: predecessorStart, to: successorStart }
        : null
    case 'FF':
      return predecessorEnd && successorEnd ? { from: predecessorEnd, to: successorEnd } : null
    case 'SF':
      return predecessorStart && successorEnd ? { from: predecessorStart, to: successorEnd } : null
    case 'FS':
    default:
      return predecessorEnd && successorStart ? { from: predecessorEnd, to: successorStart } : null
  }
}

/**
 * Slack between the two anchored dates, net of lag. Negative means the planned
 * dates contradict the logic (the successor starts before its predecessor
 * allows).
 */
export function getDependencyGapDays(
  dependency: ScheduleDependency,
  predecessor: ScheduleTask,
  successor: ScheduleTask,
) {
  const anchors = resolveDependencyAnchorDates(dependency, predecessor, successor)
  if (!anchors) return null
  return diffDays(anchors.to, anchors.from) - dependency.lagDays
}

export function computeDependencyViolations(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
): ScheduleDependencyViolation[] {
  const summaryTaskIds = getSummaryTaskIds(tasks)
  const taskMap = new Map(
    tasks.filter((task) => !summaryTaskIds.has(task.id)).map((task) => [task.id, task]),
  )
  const violations: ScheduleDependencyViolation[] = []

  for (const dependency of dependencies) {
    const predecessor = taskMap.get(dependency.predecessorId)
    const successor = taskMap.get(dependency.successorId)
    if (!predecessor || !successor) continue

    const gapDays = getDependencyGapDays(dependency, predecessor, successor)
    if (gapDays === null || gapDays >= 0) continue

    violations.push({
      dependencyId: dependency.id,
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
      type: dependency.type,
      lagDays: dependency.lagDays,
      shortfallDays: Math.abs(gapDays),
    })
  }

  return violations
}

/**
 * Would linking these two tasks close a loop? Call this BEFORE persisting a
 * dependency: a cycle makes the critical path undefined for the whole plan.
 */
export function wouldCreateDependencyCycle(
  dependencies: ScheduleDependency[],
  predecessorId: string,
  successorId: string,
) {
  if (predecessorId === successorId) return true

  const adjacency = new Map<string, string[]>()
  for (const dependency of dependencies) {
    if (!adjacency.has(dependency.predecessorId)) adjacency.set(dependency.predecessorId, [])
    adjacency.get(dependency.predecessorId)!.push(dependency.successorId)
  }

  const stack = [successorId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === predecessorId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) stack.push(next)
    }
  }

  return false
}

/**
 * Full CPM pass. Returns total float per task and the critical set, or
 * `hasCycle` when the logic contains a loop (in which case float is undefined
 * and reported as empty rather than guessed at).
 */
export function analyzeScheduleNetwork(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
): ScheduleNetworkSummary {
  const summaryTaskIds = getSummaryTaskIds(tasks)
  const schedulableTasks = tasks.filter((task) => !summaryTaskIds.has(task.id))

  if (schedulableTasks.length === 0) {
    return { totalFloatByTask: new Map(), criticalTaskIds: new Set(), hasCycle: false }
  }

  const taskMap = new Map(schedulableTasks.map((task) => [task.id, task]))
  const successors = new Map<string, ScheduleDependency[]>()
  const predecessors = new Map<string, ScheduleDependency[]>()
  for (const dependency of dependencies) {
    if (!taskMap.has(dependency.predecessorId) || !taskMap.has(dependency.successorId)) continue
    if (!successors.has(dependency.predecessorId)) successors.set(dependency.predecessorId, [])
    if (!predecessors.has(dependency.successorId)) predecessors.set(dependency.successorId, [])
    successors.get(dependency.predecessorId)!.push(dependency)
    predecessors.get(dependency.successorId)!.push(dependency)
  }

  const nodes = new Map<string, ScheduleNetworkNode>()
  for (const task of schedulableTasks) {
    nodes.set(task.id, {
      duration: getTaskDuration(task),
      es: 0,
      ef: 0,
      ls: Infinity,
      lf: Infinity,
      float: 0,
    })
  }

  // Kahn topological sort. If it can't consume every node, the logic loops.
  const inDegree = new Map<string, number>()
  for (const task of schedulableTasks) inDegree.set(task.id, 0)
  for (const dependency of dependencies) {
    if (inDegree.has(dependency.successorId) && taskMap.has(dependency.predecessorId)) {
      inDegree.set(dependency.successorId, (inDegree.get(dependency.successorId) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const dependency of successors.get(id) ?? []) {
      const successorId = dependency.successorId
      const nextDegree = (inDegree.get(successorId) ?? 1) - 1
      inDegree.set(successorId, nextDegree)
      if (nextDegree === 0) queue.push(successorId)
    }
  }

  if (sorted.length !== schedulableTasks.length) {
    return { totalFloatByTask: new Map(), criticalTaskIds: new Set(), hasCycle: true }
  }

  // Forward pass — earliest each task can start given its predecessors.
  for (const id of sorted) {
    const node = nodes.get(id)!
    const candidateStarts = [0]
    for (const dependency of predecessors.get(id) ?? []) {
      const predecessorNode = nodes.get(dependency.predecessorId)
      const predecessorTask = taskMap.get(dependency.predecessorId)
      const successorTask = taskMap.get(dependency.successorId)
      if (!predecessorNode || !predecessorTask || !successorTask) continue
      candidateStarts.push(
        predecessorNode.es + getDependencyWeight(dependency, predecessorTask, successorTask),
      )
    }
    node.es = Math.max(...candidateStarts)
    node.ef = node.es + node.duration
  }

  const projectEnd = Math.max(...Array.from(nodes.values()).map((node) => node.ef))

  // Backward pass — latest each task can start without pushing the finish out.
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const id = sorted[index]!
    const node = nodes.get(id)!
    let latestStart = projectEnd - node.duration

    for (const dependency of successors.get(id) ?? []) {
      const successorNode = nodes.get(dependency.successorId)
      const predecessorTask = taskMap.get(dependency.predecessorId)
      const successorTask = taskMap.get(dependency.successorId)
      if (!successorNode || !predecessorTask || !successorTask) continue
      latestStart = Math.min(
        latestStart,
        successorNode.ls - getDependencyWeight(dependency, predecessorTask, successorTask),
      )
    }

    node.ls = latestStart
    node.lf = latestStart + node.duration
    node.float = latestStart - node.es
  }

  const totalFloatByTask = new Map<string, number>()
  const criticalTaskIds = new Set<string>()
  for (const [id, node] of nodes) {
    const totalFloat = Number.isFinite(node.float) ? node.float : 0
    totalFloatByTask.set(id, totalFloat)
    if (Math.abs(totalFloat) < CRITICAL_FLOAT_EPSILON) criticalTaskIds.add(id)
  }

  return { totalFloatByTask, criticalTaskIds, hasCycle: false }
}

export function computeCriticalPath(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
): Set<string> {
  return analyzeScheduleNetwork(tasks, dependencies).criticalTaskIds
}
