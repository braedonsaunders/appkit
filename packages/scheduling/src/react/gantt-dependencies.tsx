'use client'

/**
 * Dependency arrows drawn over the timeline.
 *
 * Each link is an orthogonal three-segment path from the predecessor's anchor
 * to the successor's, so arrows stay readable when rows are far apart.
 * Critical links are drawn heavier, violated logic dashed in warning — a
 * schedule that contradicts itself should be visible without opening a report.
 */

import { useId, useMemo } from 'react'
import { resolveDependencyAnchorDates } from '../network'
import { scheduleColors } from '../palette'
import type { ScheduleDependency, ScheduleTask } from '../types'

export interface GanttDependenciesProps {
  dependencies: ScheduleDependency[]
  tasks: ScheduleTask[]
  /** Vertical centre (px) of each task row, keyed by task id. */
  taskRowCenters: Map<string, number>
  timelineStartMs: number
  timelineEndMs: number
  timelineWidth: number
  svgHeight: number
  criticalTaskIds: Set<string>
  violatingDependencyIds: Set<string>
  showCriticalPath: boolean
}

export function GanttDependencies({
  dependencies,
  tasks,
  taskRowCenters,
  timelineStartMs,
  timelineEndMs,
  timelineWidth,
  svgHeight,
  criticalTaskIds,
  violatingDependencyIds,
  showCriticalPath,
}: GanttDependenciesProps) {
  // Marker ids must be unique per instance, or a second Gantt on the same page
  // steals the first one's arrowheads.
  const markerPrefix = useId().replace(/:/g, '')
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const lines = useMemo(() => {
    const result: Array<{ id: string; path: string; isCritical: boolean; hasViolation: boolean }> = []

    for (const dep of dependencies) {
      const from = taskMap.get(dep.predecessorId)
      const to = taskMap.get(dep.successorId)
      if (!from || !to) continue

      const fromY = taskRowCenters.get(dep.predecessorId)
      const toY = taskRowCenters.get(dep.successorId)
      if (fromY === undefined || toY === undefined) continue

      const anchorDates = resolveDependencyAnchorDates(dep, from, to)
      if (!anchorDates) continue

      const span = timelineEndMs - timelineStartMs || 1
      const rawFromX = ((anchorDates.from.getTime() - timelineStartMs) / span) * timelineWidth
      const rawToX = ((anchorDates.to.getTime() - timelineStartMs) / span) * timelineWidth
      // Both ends off the same side: nothing of the link is visible.
      if ((rawFromX < 0 && rawToX < 0) || (rawFromX > timelineWidth && rawToX > timelineWidth)) {
        continue
      }

      const fromX = Math.max(0, Math.min(timelineWidth, rawFromX))
      const toX = Math.max(0, Math.min(timelineWidth, rawToX))
      const midX = fromX + (toX - fromX) * 0.5

      result.push({
        id: dep.id,
        path: `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`,
        isCritical:
          showCriticalPath &&
          criticalTaskIds.has(dep.predecessorId) &&
          criticalTaskIds.has(dep.successorId),
        hasViolation: violatingDependencyIds.has(dep.id),
      })
    }

    return result
  }, [
    dependencies,
    taskMap,
    taskRowCenters,
    timelineStartMs,
    timelineEndMs,
    timelineWidth,
    criticalTaskIds,
    violatingDependencyIds,
    showCriticalPath,
  ])

  if (lines.length === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      style={{ height: svgHeight }}
      viewBox={`0 0 ${Math.max(timelineWidth, 1)} ${svgHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker id={`${markerPrefix}-arrow`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={scheduleColors.link(0.45)} />
        </marker>
        <marker
          id={`${markerPrefix}-arrow-critical`}
          markerWidth="10"
          markerHeight="8"
          refX="10"
          refY="4"
          orient="auto"
        >
          <polygon points="0 0, 10 4, 0 8" fill={scheduleColors.critical()} />
        </marker>
        <marker
          id={`${markerPrefix}-arrow-warning`}
          markerWidth="9"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 9 3.5, 0 7" fill={scheduleColors.overload()} />
        </marker>
      </defs>
      {lines.map((line) => (
        <path
          key={line.id}
          d={line.path}
          fill="none"
          stroke={
            line.isCritical
              ? scheduleColors.critical()
              : line.hasViolation
                ? scheduleColors.overload(0.8)
                : scheduleColors.link(0.32)
          }
          strokeWidth={line.isCritical ? 2.4 : line.hasViolation ? 1.8 : 1.15}
          strokeDasharray={line.hasViolation && !line.isCritical ? '6 4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={`url(#${markerPrefix}-arrow${line.isCritical ? '-critical' : line.hasViolation ? '-warning' : ''})`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
