/**
 * Resource leveling.
 *
 * Critical-path analysis answers "how fast could this go if people were
 * infinite". Leveling answers the real question: given that a crew can only be
 * in one place at a time, when does the work actually happen?
 *
 * The algorithm is serial list scheduling — the standard resource-constrained
 * project-scheduling heuristic, and the one every planning tool ships:
 *
 *   1. Order tasks topologically so no task is placed before its predecessors.
 *   2. Among the tasks whose predecessors are already placed, take the one
 *      with the LEAST total float (ties broken by outline order) — delaying a
 *      critical task costs the whole project, delaying a floaty one costs
 *      nothing.
 *   3. Push it to the first day where its dependencies are satisfied AND every
 *      resource it books has spare capacity for the whole span.
 *   4. Book that capacity and continue.
 *
 * `withinFloatOnly` is the difference between "keep the finish date and tell
 * me what's still overbooked" and "fix every conflict, whatever it costs".
 * Neither answer is guessed at: whatever cannot be resolved is returned in
 * `unresolved` rather than silently left overallocated.
 *
 * Nothing here mutates the input. Leveling produces a set of proposed MOVES;
 * the host decides whether to apply them, which is what makes it safe to show
 * a preview before touching a plan someone is working to.
 */

import {
  addDays,
  diffDays,
  formatISODate,
  isWorkingDay,
  nextWorkingDay,
  normalizeCalendarDate,
  parseDate,
  todayDate,
} from './dates'
import { getSummaryTaskIds, sortTasksByOrder } from './hierarchy'
import { analyzeScheduleNetwork, getTaskDuration } from './network'
import type {
  ScheduleCalendar,
  ScheduleDependency,
  ScheduleResource,
  ScheduleTask,
  ScheduleTaskAssignment,
} from './types'

/** How far past a task's earliest feasible start leveling will search. */
const DEFAULT_MAX_DELAY_DAYS = 365

export interface ResourceLevelingOptions {
  calendars?: ScheduleCalendar[]
  resources?: ScheduleResource[]
  assignments?: ScheduleTaskAssignment[]
  /**
   * Never delay a task beyond its total float — i.e. never push the project
   * finish out. Conflicts that can't be solved inside float are reported as
   * unresolved instead of being buried. Default true.
   */
  withinFloatOnly?: boolean
  /** Leave completed/in-flight work where it is. Default true. */
  freezeStartedTasks?: boolean
  /** Upper bound on the forward search per task. Default 365 days. */
  maxDelayDays?: number
  /** Earliest date leveling may schedule into. Defaults to the plan's start. */
  anchorDate?: Date
}

export interface ScheduleLevelingMove {
  taskId: string
  taskName: string
  fromStart: string | null
  fromEnd: string | null
  toStart: string
  toEnd: string
  delayDays: number
  /** Which resources were the binding constraint on the chosen day. */
  blockedByResourceIds: string[]
  /** Total float the task had before leveling; how much slack it consumed. */
  floatDays: number
}

export interface ScheduleLevelingConflict {
  taskId: string
  taskName: string
  resourceIds: string[]
  /** Days of delay leveling would have needed but was not allowed to take. */
  requiredDelayDays: number
  reason: 'exceeds_float' | 'exceeds_search_window' | 'capacity_below_demand'
}

export interface ScheduleLevelingResult {
  moves: ScheduleLevelingMove[]
  unresolved: ScheduleLevelingConflict[]
  /** Days the plan's last finish moved out. 0 when levelled inside float. */
  projectDelayDays: number
  /** True when the logic contains a cycle — nothing was levelled. */
  hasCycle: boolean
}

export interface ResourceLoadDay {
  date: string
  load: number
  capacity: number
  /** Load beyond capacity; 0 when within capacity. */
  overload: number
}

export interface ResourceLoadSeries {
  resourceId: string
  resourceName: string
  capacityPerDay: number
  days: ResourceLoadDay[]
  peakLoad: number
  overloadedDays: number
}

interface LevelingTask {
  task: ScheduleTask
  durationDays: number
  calendar: ScheduleCalendar | null
  bookings: { resourceId: string; units: number }[]
  floatDays: number
  /** Placed start, in whole days from the anchor. */
  placedStart: number
  placed: boolean
  frozen: boolean
}

function resolveCalendar(
  task: ScheduleTask,
  calendarById: Map<string, ScheduleCalendar>,
): ScheduleCalendar | null {
  if (task.calendarId) return calendarById.get(task.calendarId) ?? null
  for (const calendar of calendarById.values()) {
    if (calendar.isDefault) return calendar
  }
  return null
}

/** The working days a span [startOffset, startOffset+duration) occupies. */
function workingDayKeys(
  anchor: Date,
  startOffset: number,
  durationDays: number,
  calendar: ScheduleCalendar | null,
) {
  const keys: string[] = []
  const span = Math.max(1, durationDays)
  for (let index = 0; index < span; index += 1) {
    const date = addDays(anchor, startOffset + index)
    if (isWorkingDay(date, calendar)) keys.push(formatISODate(date))
  }
  // A span that lands entirely on non-working days still consumes its start
  // day — otherwise it would look free and stack infinitely.
  if (keys.length === 0) keys.push(formatISODate(addDays(anchor, startOffset)))
  return keys
}

/**
 * Offset (in days from the anchor) at which the successor may start, given a
 * placed predecessor — the same four relationship forms the CPM pass uses.
 */
function successorEarliestStart(
  dependency: ScheduleDependency,
  predecessor: LevelingTask,
  successor: LevelingTask,
) {
  const predecessorStart = predecessor.placedStart
  const predecessorDuration = predecessor.durationDays
  const successorDuration = successor.durationDays

  switch (dependency.type) {
    case 'SS':
      return predecessorStart + dependency.lagDays
    case 'FF':
      return predecessorStart + predecessorDuration - successorDuration + dependency.lagDays
    case 'SF':
      return predecessorStart - successorDuration + dependency.lagDays
    case 'FS':
    default:
      return predecessorStart + predecessorDuration + dependency.lagDays
  }
}

/**
 * Level a schedule against finite resource capacity.
 *
 * Only leaf tasks participate — summary rows are derived, and moving a parent
 * independently of its children would desynchronize the outline.
 */
export function levelResources(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
  options: ResourceLevelingOptions = {},
): ScheduleLevelingResult {
  const withinFloatOnly = options.withinFloatOnly !== false
  const freezeStartedTasks = options.freezeStartedTasks !== false
  const maxDelayDays = options.maxDelayDays ?? DEFAULT_MAX_DELAY_DAYS

  const network = analyzeScheduleNetwork(tasks, dependencies)
  if (network.hasCycle) {
    return { moves: [], unresolved: [], projectDelayDays: 0, hasCycle: true }
  }

  const summaryTaskIds = getSummaryTaskIds(tasks)
  const leafTasks = sortTasksByOrder(tasks).filter((task) => !summaryTaskIds.has(task.id))
  if (leafTasks.length === 0) {
    return { moves: [], unresolved: [], projectDelayDays: 0, hasCycle: false }
  }

  const calendarById = new Map((options.calendars ?? []).map((c) => [c.id, c]))
  const resourceById = new Map((options.resources ?? []).map((r) => [r.id, r]))
  const assignmentsByTask = new Map<string, ScheduleTaskAssignment[]>()
  for (const assignment of options.assignments ?? []) {
    if (!assignmentsByTask.has(assignment.taskId)) assignmentsByTask.set(assignment.taskId, [])
    assignmentsByTask.get(assignment.taskId)!.push(assignment)
  }

  // Day 0 of the leveling window: the plan's own earliest planned start, so
  // levelled dates stay in the same neighbourhood as the dates a user typed.
  const plannedStarts = leafTasks
    .map((task) => parseDate(task.actualStart ?? task.startDate))
    .filter((value): value is Date => !!value)
  const anchor = normalizeCalendarDate(
    options.anchorDate ??
      (plannedStarts.length > 0
        ? new Date(Math.min(...plannedStarts.map((d) => d.getTime())))
        : todayDate()),
  )

  const originalFinishOffset = Math.max(
    0,
    ...leafTasks.map((task) => {
      const end = parseDate(task.actualEnd ?? task.endDate)
      return end ? diffDays(end, anchor) : 0
    }),
  )

  const levelingById = new Map<string, LevelingTask>()
  for (const task of leafTasks) {
    const calendar = resolveCalendar(task, calendarById)
    const start = parseDate(task.actualStart ?? task.startDate)
    const bookings = (assignmentsByTask.get(task.id) ?? []).map((assignment) => ({
      resourceId: assignment.resourceId,
      units: assignment.units ?? resourceById.get(assignment.resourceId)?.defaultUnits ?? 1,
    }))
    levelingById.set(task.id, {
      task,
      durationDays: Math.max(task.taskType === 'milestone' ? 0 : 1, getTaskDuration(task)),
      calendar,
      bookings,
      floatDays: network.totalFloatByTask.get(task.id) ?? 0,
      placedStart: start ? diffDays(start, anchor) : 0,
      placed: false,
      // Work that has already started is a fact, not a proposal.
      frozen:
        freezeStartedTasks &&
        (task.status === 'complete' || task.status === 'in_progress' || !!task.actualStart),
    })
  }

  const predecessorsByTask = new Map<string, ScheduleDependency[]>()
  const successorsByTask = new Map<string, ScheduleDependency[]>()
  const remainingPredecessors = new Map<string, number>()
  for (const task of leafTasks) remainingPredecessors.set(task.id, 0)
  for (const dependency of dependencies) {
    if (!levelingById.has(dependency.predecessorId) || !levelingById.has(dependency.successorId)) {
      continue
    }
    if (!predecessorsByTask.has(dependency.successorId)) {
      predecessorsByTask.set(dependency.successorId, [])
    }
    if (!successorsByTask.has(dependency.predecessorId)) {
      successorsByTask.set(dependency.predecessorId, [])
    }
    predecessorsByTask.get(dependency.successorId)!.push(dependency)
    successorsByTask.get(dependency.predecessorId)!.push(dependency)
    remainingPredecessors.set(
      dependency.successorId,
      (remainingPredecessors.get(dependency.successorId) ?? 0) + 1,
    )
  }

  /** resourceId → ISO day → booked units. */
  const ledger = new Map<string, Map<string, number>>()
  const bookedUnits = (resourceId: string, dayKey: string) =>
    ledger.get(resourceId)?.get(dayKey) ?? 0
  const book = (resourceId: string, dayKey: string, units: number) => {
    if (!ledger.has(resourceId)) ledger.set(resourceId, new Map())
    const days = ledger.get(resourceId)!
    days.set(dayKey, (days.get(dayKey) ?? 0) + units)
  }

  /** Resources that are full on some day of this span; empty = span is free. */
  const blockingResources = (item: LevelingTask, startOffset: number) => {
    if (item.bookings.length === 0) return []
    const dayKeys = workingDayKeys(anchor, startOffset, item.durationDays, item.calendar)
    const blocked = new Set<string>()
    for (const booking of item.bookings) {
      const resource = resourceById.get(booking.resourceId)
      const capacity = resource?.capacityPerDay ?? resource?.defaultUnits ?? 1
      for (const dayKey of dayKeys) {
        if (bookedUnits(booking.resourceId, dayKey) + booking.units > capacity + 1e-9) {
          blocked.add(booking.resourceId)
          break
        }
      }
    }
    return [...blocked]
  }

  const commit = (item: LevelingTask, startOffset: number) => {
    item.placedStart = startOffset
    item.placed = true
    if (item.bookings.length === 0) return
    const dayKeys = workingDayKeys(anchor, startOffset, item.durationDays, item.calendar)
    for (const booking of item.bookings) {
      for (const dayKey of dayKeys) book(booking.resourceId, dayKey, booking.units)
    }
  }

  const moves: ScheduleLevelingMove[] = []
  const unresolved: ScheduleLevelingConflict[] = []

  // Frozen work claims its capacity first — leveling plans around reality.
  const ready: LevelingTask[] = []
  for (const task of leafTasks) {
    const item = levelingById.get(task.id)!
    if (item.frozen) {
      commit(item, item.placedStart)
      for (const dependency of successorsByTask.get(task.id) ?? []) {
        remainingPredecessors.set(
          dependency.successorId,
          (remainingPredecessors.get(dependency.successorId) ?? 1) - 1,
        )
      }
    }
  }
  for (const task of leafTasks) {
    const item = levelingById.get(task.id)!
    if (!item.frozen && (remainingPredecessors.get(task.id) ?? 0) === 0) ready.push(item)
  }

  const orderIndex = new Map(leafTasks.map((task, index) => [task.id, index]))
  const pickNext = () => {
    // Least float first; outline order breaks ties so the result is stable.
    let bestIndex = 0
    for (let index = 1; index < ready.length; index += 1) {
      const candidate = ready[index]!
      const best = ready[bestIndex]!
      if (
        candidate.floatDays < best.floatDays ||
        (candidate.floatDays === best.floatDays &&
          (orderIndex.get(candidate.task.id) ?? 0) < (orderIndex.get(best.task.id) ?? 0))
      ) {
        bestIndex = index
      }
    }
    return ready.splice(bestIndex, 1)[0]!
  }

  while (ready.length > 0) {
    const item = pickNext()
    const task = item.task

    // Earliest start the LOGIC allows, given everything already placed.
    let earliest = 0
    for (const dependency of predecessorsByTask.get(task.id) ?? []) {
      const predecessor = levelingById.get(dependency.predecessorId)
      if (!predecessor?.placed) continue
      earliest = Math.max(earliest, successorEarliestStart(dependency, predecessor, item))
    }

    // Hard "no earlier than" constraints are honoured; leveling only ever
    // pushes work later, so "no later than" constraints surface as violations
    // in the insight pass rather than being silently overridden here.
    const constraintDate = parseDate(task.constraintDate)
    if (constraintDate && (task.constraintType === 'snet' || task.constraintType === 'mso')) {
      earliest = Math.max(earliest, diffDays(constraintDate, anchor))
    }
    if (constraintDate && task.constraintType === 'fnet') {
      earliest = Math.max(earliest, diffDays(constraintDate, anchor) - item.durationDays)
    }

    const originalStart = item.placedStart
    // Never pull work earlier than it was planned: leveling resolves
    // contention, it does not re-plan the job.
    const searchStart = Math.max(earliest, originalStart)
    const floatBudget = Number.isFinite(item.floatDays) ? Math.max(0, item.floatDays) : 0
    const allowedDelay = withinFloatOnly ? Math.min(floatBudget, maxDelayDays) : maxDelayDays

    let chosen: number | null = null
    let lastBlockers: string[] = []
    for (let offset = 0; offset <= allowedDelay; offset += 1) {
      const candidate = searchStart + offset
      const blockers = blockingResources(item, candidate)
      if (blockers.length === 0) {
        chosen = candidate
        break
      }
      lastBlockers = blockers
    }

    if (chosen === null) {
      // Find what the delay WOULD have been, so the report is actionable
      // rather than just "couldn't do it".
      let requiredDelay = allowedDelay + 1
      for (let offset = allowedDelay + 1; offset <= maxDelayDays; offset += 1) {
        if (blockingResources(item, searchStart + offset).length === 0) {
          requiredDelay = offset
          break
        }
        requiredDelay = offset
      }
      const demandExceedsCapacity = item.bookings.some((booking) => {
        const resource = resourceById.get(booking.resourceId)
        return booking.units > (resource?.capacityPerDay ?? resource?.defaultUnits ?? 1) + 1e-9
      })
      unresolved.push({
        taskId: task.id,
        taskName: task.name,
        resourceIds: lastBlockers,
        requiredDelayDays: requiredDelay,
        reason: demandExceedsCapacity
          ? 'capacity_below_demand'
          : withinFloatOnly
            ? 'exceeds_float'
            : 'exceeds_search_window',
      })
      // Place it at its logic-earliest anyway: an unresolvable conflict must
      // not also corrupt the dependency chain behind it.
      chosen = searchStart
    }

    commit(item, chosen)

    if (chosen !== originalStart) {
      const toStart = addDays(anchor, chosen)
      const toEnd = addDays(anchor, chosen + item.durationDays)
      moves.push({
        taskId: task.id,
        taskName: task.name,
        fromStart: task.startDate,
        fromEnd: task.endDate,
        toStart: formatISODate(toStart),
        toEnd: formatISODate(toEnd),
        delayDays: chosen - originalStart,
        blockedByResourceIds: lastBlockers,
        floatDays: Number.isFinite(item.floatDays) ? item.floatDays : 0,
      })
    }

    for (const dependency of successorsByTask.get(task.id) ?? []) {
      const next = remainingPredecessors.get(dependency.successorId) ?? 0
      remainingPredecessors.set(dependency.successorId, next - 1)
      if (next - 1 === 0) {
        const successor = levelingById.get(dependency.successorId)
        if (successor && !successor.placed && !successor.frozen) ready.push(successor)
      }
    }
  }

  const leveledFinishOffset = Math.max(
    0,
    ...Array.from(levelingById.values()).map((item) => item.placedStart + item.durationDays),
  )

  return {
    moves,
    unresolved,
    projectDelayDays: Math.max(0, leveledFinishOffset - originalFinishOffset),
    hasCycle: false,
  }
}

/** Apply leveling moves to a task list. Pure — returns a new array. */
export function applyLevelingMoves(
  tasks: ScheduleTask[],
  moves: ScheduleLevelingMove[],
): ScheduleTask[] {
  const moveById = new Map(moves.map((move) => [move.taskId, move]))
  return tasks.map((task) => {
    const move = moveById.get(task.id)
    if (!move) return task
    const start = parseDate(move.toStart)
    const end = parseDate(move.toEnd)
    return {
      ...task,
      startDate: move.toStart,
      endDate: move.toEnd,
      duration: start && end ? Math.max(0, diffDays(end, start)) : task.duration,
    }
  })
}

/** Moves expressed as task patches, ready to persist. */
export function levelingMovesToPatches(moves: ScheduleLevelingMove[]) {
  return moves.map((move) => ({
    id: move.taskId,
    patch: { startDate: move.toStart, endDate: move.toEnd },
  }))
}

/**
 * Day-by-day load vs capacity per resource — the histogram under a Gantt that
 * shows WHERE the overbooking is, not just that it exists.
 */
export function buildResourceLoadSeries(
  tasks: ScheduleTask[],
  options: ResourceLevelingOptions = {},
): ResourceLoadSeries[] {
  const calendarById = new Map((options.calendars ?? []).map((c) => [c.id, c]))
  const resources = options.resources ?? []
  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const summaryTaskIds = getSummaryTaskIds(tasks)
  const leafTasks = tasks.filter((task) => !summaryTaskIds.has(task.id))
  const taskById = new Map(leafTasks.map((task) => [task.id, task]))

  const loadByResource = new Map<string, Map<string, number>>()
  for (const assignment of options.assignments ?? []) {
    const task = taskById.get(assignment.taskId)
    if (!task) continue
    const resource = resourceById.get(assignment.resourceId)
    const calendar =
      (resource?.calendarId ? calendarById.get(resource.calendarId) : null) ??
      (task.calendarId ? calendarById.get(task.calendarId) : null) ??
      null
    const units = assignment.units ?? resource?.defaultUnits ?? 1

    const start = parseDate(task.actualStart ?? task.startDate)
    const end = parseDate(task.actualEnd ?? task.endDate)
    if (!start && !end) continue
    const from = start ?? end!
    const to = end ?? start!

    if (!loadByResource.has(assignment.resourceId)) loadByResource.set(assignment.resourceId, new Map())
    const days = loadByResource.get(assignment.resourceId)!

    if (to.getTime() <= from.getTime()) {
      const day = nextWorkingDay(from, calendar)
      days.set(formatISODate(day), (days.get(formatISODate(day)) ?? 0) + units)
      continue
    }
    for (let cursor = from; cursor.getTime() < to.getTime(); cursor = addDays(cursor, 1)) {
      if (!isWorkingDay(cursor, calendar)) continue
      const key = formatISODate(cursor)
      days.set(key, (days.get(key) ?? 0) + units)
    }
  }

  return resources.map((resource) => {
    const days = loadByResource.get(resource.id) ?? new Map<string, number>()
    const capacity = resource.capacityPerDay ?? resource.defaultUnits ?? 1
    const series = [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, load]) => ({
        date,
        load,
        capacity,
        overload: Math.max(0, load - capacity),
      }))
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      capacityPerDay: capacity,
      days: series,
      peakLoad: series.reduce((max, day) => Math.max(max, day.load), 0),
      overloadedDays: series.filter((day) => day.overload > 0).length,
    }
  })
}
