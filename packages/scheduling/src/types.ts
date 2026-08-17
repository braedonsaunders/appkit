/**
 * @braedonsaunders/scheduling — the domain model.
 *
 * A schedule is a set of tasks arranged in a work-breakdown outline, linked by
 * typed dependencies, sized against working calendars, staffed by resources,
 * and measured against baselines. Everything here is dependency-free data: the
 * host owns persistence, identity, and authorization, and maps its own rows
 * into these shapes.
 *
 * Dates are calendar dates (`YYYY-MM-DD`) — never timestamps. A schedule is a
 * calendar-day instrument; carrying wall-clock time through it invites
 * timezone drift between the plan a user typed and the plan that is stored.
 */

/** A calendar date in `YYYY-MM-DD` form, or null when not yet planned. */
export type ScheduleDate = string | null

/** Bar (`task`), zero-duration marker (`milestone`), or rolled-up parent. */
export type ScheduleTaskType = 'task' | 'milestone' | 'summary'

export type ScheduleTaskStatus = 'not_started' | 'in_progress' | 'complete' | 'on_hold'

/** Finish-to-start, start-to-start, finish-to-finish, start-to-finish. */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

/**
 * Scheduling constraints, in the vocabulary every planning tool shares:
 * as-soon/late-as-possible, start/finish no-earlier/later-than, and the two
 * hard "must" pins.
 */
export type ScheduleConstraintType =
  | 'asap'
  | 'alap'
  | 'snet'
  | 'snlt'
  | 'fnet'
  | 'fnlt'
  | 'mso'
  | 'mfo'

export type ScheduleBaselineKind = 'primary' | 'secondary' | 'tertiary' | 'snapshot' | 'custom'

export type ScheduleResourceKind = 'labor' | 'crew' | 'equipment' | 'subcontractor'

/**
 * A working calendar. `workingDays` is keyed by `Date#getDay()` as a string
 * ('0' = Sunday … '6' = Saturday); an absent/empty map means Mon–Fri.
 * `holidays` are `YYYY-MM-DD` exceptions that are never working days.
 */
export interface ScheduleCalendar {
  id: string
  name: string
  description?: string
  isDefault?: boolean
  workingDays: Record<string, boolean>
  /** Non-working exception dates (statutory holidays, shutdowns). */
  holidays?: string[]
  shiftStartMinutes?: number
  shiftEndMinutes?: number
}

/**
 * Something a task consumes capacity from: a person, a crew, a machine, or a
 * subcontractor. `capacityPerDay` is expressed in the same units as an
 * assignment's `units` (1 = one full-time unit).
 */
export interface ScheduleResource {
  id: string
  name: string
  role?: string
  kind: ScheduleResourceKind
  /** Optional own calendar; falls back to the task calendar. */
  calendarId?: string | null
  color?: string | null
  defaultUnits: number
  capacityPerDay: number
  costRate?: number
}

/** One resource booked onto one task at `units` of capacity per working day. */
export interface ScheduleTaskAssignment {
  id: string
  taskId: string
  resourceId: string
  units: number
  role?: string
}

/** A named, frozen copy of the plan a schedule is measured against. */
export interface ScheduleBaseline {
  id: string
  name: string
  description?: string
  kind: ScheduleBaselineKind
  isPrimary: boolean
  capturedAt?: string
}

export interface ScheduleBaselineTask {
  id: string
  baselineId: string
  taskId: string
  taskName: string
  phaseId?: string | null
  startDate: ScheduleDate
  endDate: ScheduleDate
  duration: number
}

/**
 * A schedule grouping band — a project phase, stage, area, or contract
 * section. Purely presentational grouping; the outline (`parentTaskId`) is
 * what drives rollups and the critical path.
 */
export interface SchedulePhase {
  id: string
  /** Display number/code ("1", "02-100"). */
  number?: string
  name: string
  description?: string
  order: number
  startDate?: ScheduleDate
  endDate?: ScheduleDate
  /** Explicit colour override; otherwise the phase palette is used by index. */
  color?: string | null
}

/**
 * One row of the schedule.
 *
 * `duration` is in calendar days between start and finish. `progress` is a
 * 0–1 fraction. `order` is the flat display sequence; `parentTaskId` +
 * `outlineLevel` carry the work-breakdown outline.
 */
export interface ScheduleTask {
  id: string
  phaseId: string | null
  calendarId: string | null
  parentTaskId: string | null
  outlineLevel: number
  name: string
  description: string
  taskType: ScheduleTaskType
  status: ScheduleTaskStatus
  startDate: ScheduleDate
  endDate: ScheduleDate
  duration: number
  progress: number
  /** Free-text owner label. Capacity planning uses resource assignments. */
  assignee: string
  order: number
  constraintType: ScheduleConstraintType
  constraintDate: ScheduleDate
  deadlineDate: ScheduleDate
  actualStart: ScheduleDate
  actualEnd: ScheduleDate
  baselineStart: ScheduleDate
  baselineEnd: ScheduleDate
}

export interface ScheduleDependency {
  id: string
  predecessorId: string
  successorId: string
  type: DependencyType
  /** Positive = lag, negative = lead. Calendar days. */
  lagDays: number
}

/** The patch shape every editing surface emits. The host persists it. */
export interface ScheduleTaskPatchInput {
  phaseId?: string | null
  calendarId?: string | null
  parentTaskId?: string | null
  outlineLevel?: number
  name?: string
  description?: string
  taskType?: ScheduleTaskType
  status?: ScheduleTaskStatus
  startDate?: ScheduleDate
  endDate?: ScheduleDate
  duration?: number
  progress?: number
  assignee?: string
  order?: number
  constraintType?: ScheduleConstraintType
  constraintDate?: ScheduleDate
  deadlineDate?: ScheduleDate
  actualStart?: ScheduleDate
  actualEnd?: ScheduleDate
  resourceAssignments?: Array<{ resourceId: string; units?: number; role?: string }>
}

export interface ScheduleDependencyInput {
  predecessorId: string
  successorId: string
  type?: DependencyType
  lagDays?: number
}

/** The complete schedule a surface renders. */
export interface ScheduleData {
  tasks: ScheduleTask[]
  dependencies: ScheduleDependency[]
  phases: SchedulePhase[]
  calendars: ScheduleCalendar[]
  resources: ScheduleResource[]
  assignments: ScheduleTaskAssignment[]
  baselines: ScheduleBaseline[]
  baselineTasks: ScheduleBaselineTask[]
}

export const emptySchedule: ScheduleData = {
  tasks: [],
  dependencies: [],
  phases: [],
  calendars: [],
  resources: [],
  assignments: [],
  baselines: [],
  baselineTasks: [],
}

/* ------------------------------------------------------------------ */
/* View state                                                          */
/* ------------------------------------------------------------------ */

export type ZoomLevel = 'day' | 'week' | 'month'

export type ScheduleQuickFilter =
  | 'all'
  | 'lookahead_14'
  | 'lookahead_28'
  | 'critical'
  | 'overdue'
  | 'variance'
  | 'issues'

export interface ScheduleFilters {
  phaseIds: string[]
  statuses: ScheduleTaskStatus[]
  assignees: string[]
  dateFrom: string | null
  dateTo: string | null
}

export const emptyFilters: ScheduleFilters = {
  phaseIds: [],
  statuses: [],
  assignees: [],
  dateFrom: null,
  dateTo: null,
}

export interface TimelineColumn {
  date: Date
  label: string
  subLabel?: string
  groupKey: string
  groupLabel: string
  isToday: boolean
  isNonWorking: boolean
}

export interface TimelineHeaderBand {
  key: string
  label: string
  span: number
}

export interface TaskGroup {
  phase: SchedulePhase | null
  tasks: ScheduleTask[]
  phaseDates: { startDate: Date; endDate: Date } | null
}

export interface TaskHierarchyInfo {
  depth: number
  parentId: string | null
  hasChildren: boolean
  childCount: number
}

export type TaskTreePlacement = 'before' | 'after' | 'inside'

export type TaskTreeUpdate = { id: string } & Pick<
  ScheduleTaskPatchInput,
  'order' | 'outlineLevel' | 'parentTaskId'
>

export interface TaskTreeDropPosition {
  placement: TaskTreePlacement
  depth: number
}

export interface DependencyEdge {
  id: string
  fromId: string
  toId: string
  type: string
  lagDays: number
}

export interface ScheduleTaskVariance {
  startDays: number | null
  finishDays: number | null
  hasVariance: boolean
  isBehind: boolean
  isAhead: boolean
}

export interface ScheduleDependencyViolation {
  dependencyId: string
  predecessorId: string
  successorId: string
  type: DependencyType
  lagDays: number
  shortfallDays: number
}

export interface ScheduleNetworkSummary {
  totalFloatByTask: Map<string, number>
  criticalTaskIds: Set<string>
  hasCycle: boolean
}

export interface ScheduleInsights {
  totalTasks: number
  milestoneTasks: number
  completeTasks: number
  inProgressTasks: number
  criticalTaskIds: Set<string>
  totalFloatByTask: Map<string, number>
  overdueTaskIds: Set<string>
  lookahead14TaskIds: Set<string>
  lookahead28TaskIds: Set<string>
  varianceTaskIds: Set<string>
  behindBaselineTaskIds: Set<string>
  missingDateTaskIds: Set<string>
  unassignedTaskIds: Set<string>
  isolatedTaskIds: Set<string>
  openEndedTaskIds: Set<string>
  deadlineMissTaskIds: Set<string>
  constraintViolationTaskIds: Set<string>
  actualDateGapTaskIds: Set<string>
  resourceConflictTaskIds: Set<string>
  overallocatedResourceIds: Set<string>
  resourceOverloadByResource: Map<string, number>
  attentionTaskIds: Set<string>
  dependencyViolations: ScheduleDependencyViolation[]
  violatingDependencyIds: Set<string>
  violatingTaskIds: Set<string>
  hasCycle: boolean
}

export interface ScheduleInsightOptions {
  calendars?: ScheduleCalendar[]
  resources?: ScheduleResource[]
  taskAssignments?: ScheduleTaskAssignment[]
}
