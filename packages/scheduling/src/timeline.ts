/**
 * Timeline geometry: the columns a Gantt draws, the bands above them, and
 * where a bar sits inside the visible span.
 *
 * Column counts are capped per zoom level. A five-year plan at day zoom is
 * ~1,800 DOM columns per row — the cap keeps a mis-typed date from freezing
 * the browser.
 */

import {
  addDays,
  defaultDateFormatters,
  diffDays,
  isNonWorkingDay,
  monthKey,
  parseDate,
  snapToDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  todayDate,
  yearKey,
  type ScheduleDateFormatters,
} from './dates'
import { sortTasksByOrder } from './hierarchy'
import type {
  ScheduleCalendar,
  SchedulePhase,
  ScheduleTask,
  TaskGroup,
  TimelineColumn,
  TimelineHeaderBand,
  ZoomLevel,
} from './types'

const MAX_COLUMNS: Record<ZoomLevel, number> = {
  day: 366,
  week: 156,
  month: 120,
}

/** Fraction-of-span placement for one bar, clipped to the visible window. */
export function getBarPosition(
  startDate: Date,
  endDate: Date,
  timelineStartMs: number,
  timelineEndMs: number,
): { left: number; width: number } {
  const span = timelineEndMs - timelineStartMs || 1
  const rawStart = (startDate.getTime() - timelineStartMs) / span
  const rawEnd = (endDate.getTime() - timelineStartMs) / span
  if (rawEnd < 0 || rawStart > 1) {
    return { left: Math.max(0, Math.min(1, rawStart)), width: 0 }
  }
  const barStart = Math.max(0, Math.min(1, rawStart))
  const barEnd = Math.max(0, Math.min(1, rawEnd))
  // Never collapse to zero: a same-day task must still be clickable.
  const barWidth = Math.max(0.004, barEnd - barStart)
  return { left: barStart, width: barWidth }
}

/** Phase bands derived from their tasks, falling back to the stored dates. */
export function computePhaseDatesFromTasks(
  tasks: ScheduleTask[],
  phases: SchedulePhase[],
): Map<string, { startDate: Date; endDate: Date }> {
  const result = new Map<string, { startDate: Date; endDate: Date }>()

  for (const phase of phases) {
    const phaseTasks = tasks.filter((task) => task.phaseId === phase.id)
    if (phaseTasks.length === 0) {
      const startDate = parseDate(phase.startDate)
      const endDate = parseDate(phase.endDate)
      if (startDate && endDate) result.set(phase.id, { startDate, endDate })
      continue
    }

    let earliest = Infinity
    let latest = -Infinity

    for (const task of phaseTasks) {
      const startDate = parseDate(task.startDate)
      const endDate = parseDate(task.endDate)
      if (startDate) earliest = Math.min(earliest, startDate.getTime())
      if (endDate) latest = Math.max(latest, endDate.getTime())
    }

    if (earliest !== Infinity && latest !== -Infinity) {
      result.set(phase.id, { startDate: new Date(earliest), endDate: new Date(latest) })
    }
  }

  return result
}

export function groupTasksByPhase(
  tasks: ScheduleTask[],
  phases: SchedulePhase[],
  phaseDates: Map<string, { startDate: Date; endDate: Date }>,
): TaskGroup[] {
  const groups: TaskGroup[] = []
  const byPhase = new Map<string | null, ScheduleTask[]>()

  for (const task of tasks) {
    const key = task.phaseId
    if (!byPhase.has(key)) byPhase.set(key, [])
    byPhase.get(key)!.push(task)
  }

  for (const phase of phases) {
    groups.push({
      phase,
      tasks: sortTasksByOrder(byPhase.get(phase.id) ?? []),
      phaseDates: phaseDates.get(phase.id) ?? null,
    })
  }

  const standaloneTasks = byPhase.get(null) ?? []
  if (standaloneTasks.length > 0) {
    groups.push({ phase: null, tasks: sortTasksByOrder(standaloneTasks), phaseDates: null })
  }

  return groups
}

export function generateColumns(
  start: Date,
  end: Date,
  zoomLevel: ZoomLevel,
  calendar?: ScheduleCalendar | null,
  formatters?: ScheduleDateFormatters,
): TimelineColumn[] {
  const format = formatters ?? defaultDateFormatters
  const columns: TimelineColumn[] = []
  const today = todayDate()
  const totalDays = Math.max(0, diffDays(end, start))
  const maxColumns = MAX_COLUMNS[zoomLevel]

  if (zoomLevel === 'day') {
    for (let index = 0; index < Math.min(totalDays, maxColumns); index += 1) {
      const date = addDays(start, index)
      columns.push({
        date,
        label: String(date.getDate()),
        subLabel: format.weekdayShort(date),
        groupKey: monthKey(date),
        groupLabel: format.monthYear(date),
        isToday: diffDays(date, today) === 0,
        isNonWorking: isNonWorkingDay(date, calendar),
      })
    }
    return columns
  }

  if (zoomLevel === 'week') {
    let current = startOfWeek(start)
    while (current < end && columns.length < maxColumns) {
      columns.push({
        date: current,
        label: format.shortDate(current),
        groupKey: monthKey(current),
        groupLabel: format.monthYear(current),
        isToday: today >= current && today < addDays(current, 7),
        isNonWorking: false,
      })
      current = addDays(current, 7)
    }
    return columns
  }

  let current = startOfMonth(start)
  while (current < end && columns.length < maxColumns) {
    columns.push({
      date: current,
      label: format.monthShort(current),
      groupKey: yearKey(current),
      groupLabel: String(current.getFullYear()),
      isToday:
        today.getFullYear() === current.getFullYear() && today.getMonth() === current.getMonth(),
      isNonWorking: false,
    })
    current = startOfNextMonth(current)
  }

  return columns
}

/** Collapse columns into their parent bands (months over days, years over months). */
export function buildTimelineHeaderBands(columns: TimelineColumn[]): TimelineHeaderBand[] {
  const bands: TimelineHeaderBand[] = []

  for (const column of columns) {
    const current = bands[bands.length - 1]
    if (current && current.key === column.groupKey) {
      current.span += 1
      continue
    }
    bands.push({ key: column.groupKey, label: column.groupLabel, span: 1 })
  }

  return bands
}

export function getTimelineBounds(
  columns: TimelineColumn[],
  zoomLevel: ZoomLevel,
): { startMs: number; endMs: number } {
  if (columns.length === 0) return { startMs: 0, endMs: 1 }

  const startMs = columns[0]!.date.getTime()
  const lastDate = columns[columns.length - 1]!.date
  const endDate =
    zoomLevel === 'day'
      ? addDays(lastDate, 1)
      : zoomLevel === 'week'
        ? addDays(lastDate, 7)
        : startOfNextMonth(lastDate)

  return { startMs, endMs: endDate.getTime() }
}

/** CSS-percentage position of the today marker, or null when off-screen. */
export function getTodayPosition(timelineStartMs: number, timelineEndMs: number): string | null {
  const today = todayDate()
  const span = timelineEndMs - timelineStartMs
  if (span <= 0) return null

  const position = (today.getTime() - timelineStartMs) / span
  if (position < 0 || position > 1) return null
  return `${(position * 100).toFixed(2)}%`
}

/** Drag a bar or one of its edges by a pixel-derived millisecond delta. */
export function applyDragDelta(
  startDate: Date,
  endDate: Date,
  deltaMs: number,
  edge: 'start' | 'end' | 'move',
): { startDate: Date; endDate: Date } {
  if (edge === 'move') {
    return {
      startDate: snapToDay(startDate.getTime() + deltaMs),
      endDate: snapToDay(endDate.getTime() + deltaMs),
    }
  }

  if (edge === 'start') {
    const nextStart = snapToDay(startDate.getTime() + deltaMs)
    // An edge drag can never invert the bar.
    return {
      startDate: nextStart.getTime() < endDate.getTime() ? nextStart : addDays(endDate, -1),
      endDate,
    }
  }

  const nextEnd = snapToDay(endDate.getTime() + deltaMs)
  return {
    startDate,
    endDate: nextEnd.getTime() > startDate.getTime() ? nextEnd : addDays(startDate, 1),
  }
}
