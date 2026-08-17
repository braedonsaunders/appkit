import type {
  ScheduleBaseline,
  ScheduleBaselineTask,
  ScheduleCalendar,
  ScheduleData,
  ScheduleDependency,
  SchedulePhase,
  ScheduleResource,
  ScheduleTask,
  ScheduleTaskAssignment,
} from '@braedonsaunders/scheduling'

/**
 * A small but complete plan: three phases, an outline with summary rollups, a
 * milestone, all four dependency types, a shared crew that is deliberately
 * double-booked (so leveling has something real to solve), and a baseline the
 * plan has already slipped against.
 *
 * Dates are generated relative to a caller-supplied anchor so the demo always
 * has work in the recent past, work in flight, and work ahead.
 */

function iso(anchor: Date, offsetDays: number) {
  const date = new Date(anchor)
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function task(
  partial: Partial<ScheduleTask> & Pick<ScheduleTask, 'id' | 'name' | 'order'>,
): ScheduleTask {
  return {
    phaseId: null,
    calendarId: 'cal-standard',
    parentTaskId: null,
    outlineLevel: 0,
    description: '',
    taskType: 'task',
    status: 'not_started',
    startDate: null,
    endDate: null,
    duration: 0,
    progress: 0,
    assignee: '',
    constraintType: 'asap',
    constraintDate: null,
    deadlineDate: null,
    actualStart: null,
    actualEnd: null,
    baselineStart: null,
    baselineEnd: null,
    ...partial,
  }
}

export function buildScheduleSeed(anchor: Date): ScheduleData {
  const phases: SchedulePhase[] = [
    { id: 'phase-1', number: '1', name: 'Preconstruction', order: 1 },
    { id: 'phase-2', number: '2', name: 'Structure', order: 2 },
    { id: 'phase-3', number: '3', name: 'Fit-out', order: 3 },
  ]

  const calendars: ScheduleCalendar[] = [
    {
      id: 'cal-standard',
      name: 'Standard week',
      description: 'Monday to Friday',
      isDefault: true,
      workingDays: { '0': false, '1': true, '2': true, '3': true, '4': true, '5': true, '6': false },
      holidays: [iso(anchor, 24)],
    },
    {
      id: 'cal-six-day',
      name: 'Six-day crew',
      description: 'Monday to Saturday',
      isDefault: false,
      workingDays: { '0': false, '1': true, '2': true, '3': true, '4': true, '5': true, '6': true },
    },
  ]

  const resources: ScheduleResource[] = [
    {
      id: 'res-crew-a',
      name: 'Crew A',
      role: 'Site crew',
      kind: 'crew',
      calendarId: 'cal-standard',
      defaultUnits: 1,
      capacityPerDay: 1,
      costRate: 780,
    },
    {
      id: 'res-crane',
      name: 'Tower crane',
      role: 'Lifting',
      kind: 'equipment',
      calendarId: 'cal-six-day',
      defaultUnits: 1,
      capacityPerDay: 1,
      costRate: 1450,
    },
    {
      id: 'res-electrical',
      name: 'Electrical sub',
      role: 'Subcontract',
      kind: 'subcontractor',
      calendarId: 'cal-standard',
      defaultUnits: 1,
      capacityPerDay: 2,
      costRate: 960,
    },
  ]

  const tasks: ScheduleTask[] = [
    task({
      id: 't-precon',
      name: 'Preconstruction',
      order: 1,
      phaseId: 'phase-1',
      taskType: 'summary',
    }),
    task({
      id: 't-permits',
      name: 'Permits and approvals',
      order: 2,
      phaseId: 'phase-1',
      parentTaskId: 't-precon',
      outlineLevel: 1,
      startDate: iso(anchor, -28),
      endDate: iso(anchor, -14),
      duration: 14,
      progress: 1,
      status: 'complete',
      assignee: 'Dana Okafor',
      actualStart: iso(anchor, -28),
      actualEnd: iso(anchor, -12),
    }),
    task({
      id: 't-mobilize',
      name: 'Site mobilisation',
      order: 3,
      phaseId: 'phase-1',
      parentTaskId: 't-precon',
      outlineLevel: 1,
      startDate: iso(anchor, -12),
      endDate: iso(anchor, -5),
      duration: 7,
      progress: 1,
      status: 'complete',
      assignee: 'Dana Okafor',
      actualStart: iso(anchor, -12),
      actualEnd: iso(anchor, -4),
    }),
    task({
      id: 't-structure',
      name: 'Structure',
      order: 4,
      phaseId: 'phase-2',
      taskType: 'summary',
    }),
    task({
      id: 't-foundations',
      name: 'Foundations',
      order: 5,
      phaseId: 'phase-2',
      parentTaskId: 't-structure',
      outlineLevel: 1,
      startDate: iso(anchor, -4),
      endDate: iso(anchor, 10),
      duration: 14,
      progress: 0.55,
      status: 'in_progress',
      assignee: 'Rae Lindqvist',
      actualStart: iso(anchor, -4),
    }),
    task({
      id: 't-steel',
      name: 'Steel erection',
      order: 6,
      phaseId: 'phase-2',
      parentTaskId: 't-structure',
      outlineLevel: 1,
      startDate: iso(anchor, 10),
      endDate: iso(anchor, 31),
      duration: 21,
      assignee: 'Rae Lindqvist',
      deadlineDate: iso(anchor, 28),
    }),
    task({
      id: 't-topping-out',
      name: 'Topping out',
      order: 7,
      phaseId: 'phase-2',
      parentTaskId: 't-structure',
      outlineLevel: 1,
      taskType: 'milestone',
      startDate: iso(anchor, 31),
      endDate: iso(anchor, 31),
      duration: 0,
    }),
    task({
      id: 't-fitout',
      name: 'Fit-out',
      order: 8,
      phaseId: 'phase-3',
      taskType: 'summary',
    }),
    task({
      id: 't-envelope',
      name: 'Building envelope',
      order: 9,
      phaseId: 'phase-3',
      parentTaskId: 't-fitout',
      outlineLevel: 1,
      startDate: iso(anchor, 31),
      endDate: iso(anchor, 52),
      duration: 21,
      assignee: 'Kit Bhattacharya',
    }),
    // Deliberately overlaps the envelope on the same crew: this is the
    // conflict the leveling panel resolves.
    task({
      id: 't-rough-in',
      name: 'Electrical rough-in',
      order: 10,
      phaseId: 'phase-3',
      parentTaskId: 't-fitout',
      outlineLevel: 1,
      startDate: iso(anchor, 31),
      endDate: iso(anchor, 45),
      duration: 14,
      assignee: 'Kit Bhattacharya',
    }),
    task({
      id: 't-commissioning',
      name: 'Commissioning',
      order: 11,
      phaseId: 'phase-3',
      parentTaskId: 't-fitout',
      outlineLevel: 1,
      startDate: iso(anchor, 52),
      endDate: iso(anchor, 62),
      duration: 10,
      constraintType: 'fnlt',
      constraintDate: iso(anchor, 60),
    }),
  ]

  const dependencies: ScheduleDependency[] = [
    { id: 'dep-1', predecessorId: 't-permits', successorId: 't-mobilize', type: 'FS', lagDays: 0 },
    { id: 'dep-2', predecessorId: 't-mobilize', successorId: 't-foundations', type: 'FS', lagDays: 0 },
    { id: 'dep-3', predecessorId: 't-foundations', successorId: 't-steel', type: 'FS', lagDays: 0 },
    { id: 'dep-4', predecessorId: 't-steel', successorId: 't-topping-out', type: 'FS', lagDays: 0 },
    { id: 'dep-5', predecessorId: 't-topping-out', successorId: 't-envelope', type: 'FS', lagDays: 0 },
    { id: 'dep-6', predecessorId: 't-envelope', successorId: 't-rough-in', type: 'SS', lagDays: 0 },
    { id: 'dep-7', predecessorId: 't-envelope', successorId: 't-commissioning', type: 'FS', lagDays: 0 },
    { id: 'dep-8', predecessorId: 't-rough-in', successorId: 't-commissioning', type: 'FF', lagDays: 7 },
  ]

  const assignments: ScheduleTaskAssignment[] = [
    { id: 'asg-1', taskId: 't-foundations', resourceId: 'res-crew-a', units: 1, role: 'Lead' },
    { id: 'asg-2', taskId: 't-steel', resourceId: 'res-crane', units: 1, role: 'Lift' },
    { id: 'asg-3', taskId: 't-steel', resourceId: 'res-crew-a', units: 1, role: 'Erect' },
    { id: 'asg-4', taskId: 't-envelope', resourceId: 'res-crew-a', units: 1, role: 'Install' },
    { id: 'asg-5', taskId: 't-rough-in', resourceId: 'res-crew-a', units: 1, role: 'Assist' },
    { id: 'asg-6', taskId: 't-rough-in', resourceId: 'res-electrical', units: 1, role: 'Rough-in' },
  ]

  const baselines: ScheduleBaseline[] = [
    {
      id: 'baseline-1',
      name: 'Contract baseline',
      description: 'Signed programme',
      kind: 'primary',
      isPrimary: true,
      capturedAt: iso(anchor, -30),
    },
  ]

  // The baseline sits a few days ahead of the plan, so variance chips and the
  // "behind baseline" quick filter have something to show.
  const baselineTasks: ScheduleBaselineTask[] = tasks
    .filter((item) => item.startDate && item.endDate)
    .map((item, index) => ({
      id: `bt-${item.id}`,
      baselineId: 'baseline-1',
      taskId: item.id,
      taskName: item.name,
      phaseId: item.phaseId,
      startDate: item.startDate,
      endDate: shiftIso(item.endDate, index % 3 === 0 ? -4 : 0),
      duration: item.duration,
    }))

  return { tasks, dependencies, phases, calendars, resources, assignments, baselines, baselineTasks }
}

function shiftIso(value: string | null, days: number) {
  if (!value || days === 0) return value
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
