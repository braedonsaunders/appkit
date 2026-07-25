/**
 * Every user-visible string the scheduling surface can draw, in one
 * overridable contract.
 *
 * The package ships English defaults so a host can render a working Gantt with
 * zero configuration, and replaces any subset from its own i18n layer. Nothing
 * inside a component hardcodes a string — that is what makes this package
 * translatable without forking it.
 */

import type {
  DependencyType,
  ScheduleConstraintType,
  ScheduleQuickFilter,
  ScheduleResourceKind,
  ScheduleTaskStatus,
  ScheduleTaskType,
  ZoomLevel,
} from './types'

export interface SchedulingLabels {
  status: Record<ScheduleTaskStatus, string>
  taskType: Record<ScheduleTaskType, string>
  dependencyType: Record<DependencyType, string>
  dependencyTypeLong: Record<DependencyType, string>
  constraintType: Record<ScheduleConstraintType, string>
  resourceKind: Record<ScheduleResourceKind, string>
  quickFilter: Record<ScheduleQuickFilter, string>
  zoom: Record<ZoomLevel, string>
  view: { gantt: string; list: string; board: string }
  toolbar: {
    addTask: string
    addMilestone: string
    criticalPath: string
    baseline: string
    filters: string
    clearFilters: string
    today: string
    fitToWindow: string
    zoomIn: string
    zoomOut: string
    manageSchedule: string
    levelResources: string
    search: string
    collapseAll: string
    expandAll: string
    indent: string
    outdent: string
  }
  columns: {
    name: string
    /** The type FIELD's label — distinct from the type values in `taskType`. */
    taskType: string
    start: string
    finish: string
    duration: string
    progress: string
    status: string
    assignee: string
    float: string
    predecessors: string
    phase: string
    calendar: string
    constraint: string
    deadline: string
    actualStart: string
    actualFinish: string
    resources: string
    week: string
  }
  editor: {
    title: string
    description: string
    dates: string
    logic: string
    resources: string
    constraintDate: string
    deadlineDate: string
    lag: string
    addPredecessor: string
    removePredecessor: string
    units: string
    role: string
    save: string
    cancel: string
    delete: string
    deleteConfirm: string
    parentTask: string
    topLevel: string
    children: string
    successors: string
    noPredecessors: string
    noSuccessors: string
    noResources: string
    resourcesHint: string
    defaultCalendar: string
    summaryAuto: string
    rollupLocked: string
    endBeforeStart: string
    choosePredecessor: string
    cycleRejected: string
    removeDependencyFailed: string
    addChild: string
    duplicate: string
    /** "Convert to <type>" — the type name is passed in. */
    convertTo: (typeLabel: string) => string
  }
  insights: {
    heading: string
    critical: string
    overdue: string
    behindBaseline: string
    missingDates: string
    unassigned: string
    isolated: string
    openEnded: string
    deadlineMissed: string
    constraintViolation: string
    actualDateGap: string
    resourceConflict: string
    dependencyViolation: string
    cycleDetected: string
    noIssues: string
  }
  leveling: {
    heading: string
    description: string
    withinFloatOnly: string
    freezeStartedTasks: string
    preview: string
    apply: string
    noMoves: string
    movesSummary: string
    unresolvedSummary: string
    projectDelay: string
    reasonExceedsFloat: string
    reasonExceedsWindow: string
    reasonCapacityBelowDemand: string
    load: string
    capacity: string
    overloadedDays: string
  }
  list: {
    wbs: string
    flags: string
    variance: string
    onBaseline: string
    openEnd: string
    actuals: string
    visible: string
    critical: string
    overdue: string
    slip: string
    issues: string
    selected: string
    markInProgress: string
    markComplete: string
    clearSelection: string
    selectAll: string
    start: string
    done: string
    reopen: string
    hold: string
    noMatches: string
    reorderRequiresWbsSort: string
    resource: string
  }
  board: {
    heading: string
    unscheduled: string
    dropHint: string
    emptyColumn: string
  }
  menu: {
    viewTitle: string
    timelineTitle: string
    moveTimeline: string
    earlier: string
    later: string
    zoom: string
    healthTitle: string
    baselineTitle: string
    activeBaseline: string
    noBaselines: string
    saveBaseline: string
    showBaseline: string
    hideBaseline: string
    clearBaseline: string
    exportPdf: string
    primary: string
    snapshot: string
    more: string
    actionsTitle: string
    importSchedule: string
    showFilters: string
    hideFilters: string
    deadlineMisses: string
    resourceConflicts: string
    constraintViolations: string
    calendarsResources: string
    tbd: string
  }
  /** Compact toolbar chips for each quick filter. */
  quickFilterShort: Record<ScheduleQuickFilter, string>
  /** Short chips drawn on a task row. */
  badges: {
    summary: string
    overdue: string
    logic: string
    deadline: string
    constraint: string
    resource: string
    critical: string
    milestone: string
    untitled: string
    schedule: string
    reorderHint: string
    expand: string
    collapse: string
    resizeSplit: string
  }
  /**
   * Count-dependent strings. These are FUNCTIONS so plural rules stay in the
   * host's i18n layer — English "1 task / 2 tasks" is not a rule that
   * generalizes, and baking it in would mistranslate most locales.
   */
  format: {
    taskCount: (count: number) => string
    phaseCount: (count: number) => string
    childCount: (count: number) => string
    days: (count: number) => string
    floatDays: (count: number) => string
    slipDays: (count: number) => string
    aheadDays: (count: number) => string
  }
  empty: { title: string; description: string; action: string }
  common: { days: string; none: string; unassigned: string; noPhase: string; of: string }
}

export const defaultSchedulingLabels: SchedulingLabels = {
  status: {
    not_started: 'Not started',
    in_progress: 'In progress',
    complete: 'Complete',
    on_hold: 'On hold',
  },
  taskType: { task: 'Task', milestone: 'Milestone', summary: 'Summary' },
  dependencyType: { FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF' },
  dependencyTypeLong: {
    FS: 'Finish to start',
    SS: 'Start to start',
    FF: 'Finish to finish',
    SF: 'Start to finish',
  },
  constraintType: {
    asap: 'As soon as possible',
    alap: 'As late as possible',
    snet: 'Start no earlier than',
    snlt: 'Start no later than',
    fnet: 'Finish no earlier than',
    fnlt: 'Finish no later than',
    mso: 'Must start on',
    mfo: 'Must finish on',
  },
  resourceKind: {
    labor: 'Labour',
    crew: 'Crew',
    equipment: 'Equipment',
    subcontractor: 'Subcontractor',
  },
  quickFilter: {
    all: 'All tasks',
    lookahead_14: '2-week lookahead',
    lookahead_28: '4-week lookahead',
    critical: 'Critical path',
    overdue: 'Overdue',
    variance: 'Behind baseline',
    issues: 'Needs attention',
  },
  zoom: { day: 'Day', week: 'Week', month: 'Month' },
  view: { gantt: 'Gantt', list: 'List', board: 'Board' },
  toolbar: {
    addTask: 'Add task',
    addMilestone: 'Add milestone',
    criticalPath: 'Critical path',
    baseline: 'Baseline',
    filters: 'Filters',
    clearFilters: 'Clear filters',
    today: 'Today',
    fitToWindow: 'Fit to window',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    manageSchedule: 'Manage schedule',
    levelResources: 'Level resources',
    search: 'Search tasks',
    collapseAll: 'Collapse all',
    expandAll: 'Expand all',
    indent: 'Indent',
    outdent: 'Outdent',
  },
  columns: {
    name: 'Task',
    taskType: 'Type',
    start: 'Start',
    finish: 'Finish',
    duration: 'Duration',
    progress: 'Progress',
    status: 'Status',
    assignee: 'Assignee',
    float: 'Float',
    predecessors: 'Predecessors',
    phase: 'Phase',
    calendar: 'Calendar',
    constraint: 'Constraint',
    deadline: 'Deadline',
    actualStart: 'Actual start',
    actualFinish: 'Actual finish',
    resources: 'Resources',
    week: 'Week',
  },
  editor: {
    title: 'Task',
    description: 'Description',
    dates: 'Dates',
    logic: 'Logic',
    resources: 'Resources',
    constraintDate: 'Constraint date',
    deadlineDate: 'Deadline',
    lag: 'Lag (days)',
    addPredecessor: 'Add predecessor',
    removePredecessor: 'Remove predecessor',
    units: 'Units',
    role: 'Role',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleteConfirm: 'Delete this task and its dependencies?',
    parentTask: 'Parent task',
    topLevel: 'Top level',
    children: 'Children',
    successors: 'Successors',
    noPredecessors: 'No predecessors yet.',
    noSuccessors: 'Nothing depends on this task yet.',
    noResources: 'No resources assigned yet.',
    resourcesHint: 'Assign labour, crews, or equipment with daily units and a role note.',
    defaultCalendar: 'Default calendar',
    summaryAuto:
      'A task with children behaves as a summary and rolls up its child dates automatically.',
    rollupLocked: 'Start, finish, duration and progress are calculated from the child activities.',
    endBeforeStart: 'The finish date cannot be before the start date.',
    choosePredecessor: 'Choose a predecessor task first.',
    cycleRejected: 'That dependency would create a loop in the schedule.',
    removeDependencyFailed: 'Unable to remove the dependency right now.',
    addChild: 'Add child task',
    duplicate: 'Duplicate',
    convertTo: (typeLabel) => `Convert to ${typeLabel.toLowerCase()}`,
  },
  insights: {
    heading: 'Schedule health',
    critical: 'On the critical path',
    overdue: 'Overdue',
    behindBaseline: 'Behind baseline',
    missingDates: 'Missing dates',
    unassigned: 'Unassigned',
    isolated: 'No dependencies',
    openEnded: 'No successor',
    deadlineMissed: 'Past deadline',
    constraintViolation: 'Constraint violated',
    actualDateGap: 'Actual dates disagree with status',
    resourceConflict: 'Resource overbooked',
    dependencyViolation: 'Dependency violated',
    cycleDetected: 'Dependency loop — critical path unavailable',
    noIssues: 'No issues found',
  },
  leveling: {
    heading: 'Resource leveling',
    description:
      'Delay tasks so no resource is booked beyond its daily capacity. Review the proposed moves before applying them.',
    withinFloatOnly: 'Only delay within available float',
    freezeStartedTasks: 'Leave started work in place',
    preview: 'Preview',
    apply: 'Apply moves',
    noMoves: 'No resource conflicts — nothing to level.',
    movesSummary: 'proposed moves',
    unresolvedSummary: 'conflicts could not be resolved',
    projectDelay: 'Finish moves out by',
    reasonExceedsFloat: 'Would need more delay than the task has float',
    reasonExceedsWindow: 'No free window found in the search range',
    reasonCapacityBelowDemand: 'Task books more units than the resource has',
    load: 'Load',
    capacity: 'Capacity',
    overloadedDays: 'overloaded days',
  },
  list: {
    wbs: 'WBS',
    flags: 'Flags',
    variance: 'Variance',
    onBaseline: 'On baseline',
    openEnd: 'Open end',
    actuals: 'Actuals',
    visible: 'visible',
    critical: 'critical',
    overdue: 'overdue',
    slip: 'slip',
    issues: 'issues',
    selected: 'selected',
    markInProgress: 'Mark in progress',
    markComplete: 'Mark complete',
    clearSelection: 'Clear',
    selectAll: 'Select all tasks',
    start: 'Start',
    done: 'Done',
    reopen: 'Reopen',
    hold: 'Hold',
    noMatches: 'No schedule tasks match the current filters.',
    reorderRequiresWbsSort: 'Switch back to WBS sort to reorder tasks',
    resource: 'Resource',
  },
  board: {
    heading: 'Board',
    unscheduled: 'Unscheduled',
    dropHint: 'Drop a task here to move it to this status',
    emptyColumn: 'Nothing here',
  },
  menu: {
    viewTitle: 'Schedule view',
    timelineTitle: 'Timeline controls',
    moveTimeline: 'Move timeline',
    earlier: 'Earlier',
    later: 'Later',
    zoom: 'Zoom',
    healthTitle: 'Schedule health filter',
    baselineTitle: 'Baseline controls',
    activeBaseline: 'Active baseline',
    noBaselines: 'No baselines saved yet.',
    saveBaseline: 'Save baseline',
    showBaseline: 'Show baseline',
    hideBaseline: 'Hide baseline',
    clearBaseline: 'Clear primary baseline',
    exportPdf: 'Export schedule PDF',
    primary: 'Primary',
    snapshot: 'Snapshot',
    more: 'More',
    actionsTitle: 'Schedule actions',
    importSchedule: 'Import schedule',
    showFilters: 'Show filters',
    hideFilters: 'Hide filters',
    deadlineMisses: 'deadline misses',
    resourceConflicts: 'resource conflicts',
    constraintViolations: 'constraint violations',
    calendarsResources: 'calendars / resources',
    tbd: 'TBD',
  },
  quickFilterShort: {
    all: 'All',
    lookahead_14: '2W',
    lookahead_28: '4W',
    critical: 'Critical',
    overdue: 'Late',
    variance: 'Slip',
    issues: 'Issues',
  },
  badges: {
    summary: 'Summary',
    overdue: 'Overdue',
    logic: 'Logic',
    deadline: 'Deadline',
    constraint: 'Constraint',
    resource: 'Resource',
    critical: 'Critical',
    milestone: 'MS',
    untitled: 'Untitled',
    schedule: 'Schedule',
    reorderHint: 'Drag to reorder. Move right to nest under a task, or left to pull back out.',
    expand: 'Expand',
    collapse: 'Collapse',
    resizeSplit: 'Resize schedule split',
  },
  format: {
    taskCount: (count) => `${count} ${count === 1 ? 'task' : 'tasks'}`,
    phaseCount: (count) => `${count} ${count === 1 ? 'phase' : 'phases'}`,
    childCount: (count) => `${count} ${count === 1 ? 'child' : 'children'}`,
    days: (count) => `${count}d`,
    floatDays: (count) => `${count}d float`,
    slipDays: (count) => `+${count}d slip`,
    aheadDays: (count) => `${count}d ahead`,
  },
  empty: {
    title: 'No tasks yet',
    description: 'Add the first task to start building the schedule.',
    action: 'Add task',
  },
  common: {
    days: 'days',
    none: 'None',
    unassigned: 'Unassigned',
    noPhase: 'No phase',
    of: 'of',
  },
}

/** Deep-merge a host's partial overrides over the English defaults. */
export function mergeSchedulingLabels(
  overrides?: DeepPartial<SchedulingLabels>,
): SchedulingLabels {
  if (!overrides) return defaultSchedulingLabels
  const merged = { ...defaultSchedulingLabels } as Record<string, unknown>
  for (const [group, values] of Object.entries(overrides)) {
    if (!values) continue
    merged[group] = {
      ...(defaultSchedulingLabels as unknown as Record<string, Record<string, string>>)[group],
      ...(values as Record<string, string>),
    }
  }
  return merged as unknown as SchedulingLabels
}

export type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

/** Narrow a raw string to a known status/type key, or fall back. */
export function labelFor<T extends string>(
  map: Record<T, string>,
  key: string | null | undefined,
  fallback: string,
) {
  if (!key) return fallback
  return (map as Record<string, string>)[key] ?? fallback
}
