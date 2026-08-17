'use client'

/**
 * One bar on the timeline: drag to move, drag an edge to resize.
 *
 * The drag is optimistic — the bar follows the pointer immediately and only
 * snaps back if the host rejects the change. Anything else makes a schedule
 * feel like it is arguing with you.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@braedonsaunders/appkit-ui'
import { applyDragDelta, getBarPosition } from '../timeline'
import { normalizeScheduleProgress } from '../insights'
import { scheduleColors } from '../palette'
import { useScheduleFormatters } from './context'

export interface GanttBarProps {
  taskId: string
  startDate: Date
  endDate: Date
  progress: number
  /** Resolved CSS colour for the bar fill (see `phaseColor`). */
  color: string
  isCritical: boolean
  taskName: string
  timelineStartMs: number
  timelineEndMs: number
  variant?: 'task' | 'summary'
  isDraggable?: boolean
  /** Return `false` to reject the drag and restore the original dates. */
  onDragEnd: (newStart: Date, newEnd: Date) => void | boolean | Promise<boolean | void>
  onClick: () => void
}

type DragMode = 'move' | 'resize-start' | 'resize-end' | null

/** Pointer travel before a press is treated as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3

export function GanttBar({
  taskId,
  startDate,
  endDate,
  progress,
  color,
  isCritical,
  taskName,
  timelineStartMs,
  timelineEndMs,
  variant = 'task',
  isDraggable = true,
  onDragEnd,
  onClick,
}: GanttBarProps) {
  const formatters = useScheduleFormatters()
  const barRef = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [previewDates, setPreviewDates] = useState<{ startDate: Date; endDate: Date } | null>(null)

  const dragStartX = useRef(0)
  const containerWidth = useRef(0)
  const msPerPixel = useRef(0)
  const suppressClick = useRef(false)
  const latestDates = useRef<{ startDate: Date; endDate: Date } | null>(null)

  const currentStart = previewDates?.startDate ?? startDate
  const currentEnd = previewDates?.endDate ?? endDate
  const { left, width } = getBarPosition(currentStart, currentEnd, timelineStartMs, timelineEndMs)
  const progressRatio = normalizeScheduleProgress(progress)
  const fill = isCritical ? scheduleColors.critical() : color

  // Once the host's saved dates catch up with the optimistic preview, drop it.
  useEffect(() => {
    if (!previewDates) return
    if (
      previewDates.startDate.getTime() === startDate.getTime() &&
      previewDates.endDate.getTime() === endDate.getTime()
    ) {
      setPreviewDates(null)
    }
  }, [endDate, previewDates, startDate])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      if (!isDraggable) return
      e.preventDefault()
      e.stopPropagation()

      const container = barRef.current?.parentElement
      if (!container) return

      containerWidth.current = container.getBoundingClientRect().width
      msPerPixel.current = (timelineEndMs - timelineStartMs) / Math.max(containerWidth.current, 1)
      dragStartX.current = e.clientX
      suppressClick.current = false
      latestDates.current = { startDate, endDate }
      setDragMode(mode)
      setPreviewDates({ startDate, endDate })

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - dragStartX.current
        if (Math.abs(dx) > DRAG_THRESHOLD_PX) suppressClick.current = true

        const nextDates = applyDragDelta(
          startDate,
          endDate,
          dx * msPerPixel.current,
          mode === 'move' ? 'move' : mode === 'resize-start' ? 'start' : 'end',
        )

        latestDates.current = nextDates
        setPreviewDates(nextDates)
      }

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)

        const finalDates = latestDates.current
        latestDates.current = null
        setDragMode(null)

        // A press that never moved is a click, not a zero-day reschedule.
        if (!suppressClick.current || !finalDates) {
          setPreviewDates(null)
          return
        }

        Promise.resolve(onDragEnd(finalDates.startDate, finalDates.endDate))
          .then((result) => {
            if (result === false) setPreviewDates(null)
          })
          .catch(() => setPreviewDates(null))
      }

      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp, { once: true })
    },
    [endDate, isDraggable, onDragEnd, startDate, timelineEndMs, timelineStartMs],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      onClick()
    },
    [onClick],
  )

  return (
    <div
      ref={barRef}
      data-testid={`gantt-bar-${taskId}`}
      className={cn(
        'group/bar absolute top-1/2 z-20 -translate-y-1/2',
        variant === 'summary' ? 'h-8 overflow-visible' : 'h-5 rounded-md',
        isDraggable ? (dragMode ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer',
      )}
      style={{
        left: `${(left * 100).toFixed(2)}%`,
        width: `${(width * 100).toFixed(2)}%`,
        ...(isCritical
          ? { boxShadow: `0 0 0 2px ${scheduleColors.critical(0.7)}, 0 4px 10px ${scheduleColors.critical(0.22)}` }
          : null),
      }}
      onClick={handleClick}
    >
      {variant === 'summary' ? (
        // The bracket silhouette every planning tool draws for a summary row.
        <div className="absolute inset-0">
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 100 32"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect x="0" y="5" width="100" height="20" rx="0.8" fill={fill} />
            <path d="M 0 5 L 0 25 L 12 5" fill="none" stroke={fill} strokeWidth="1.8" strokeLinejoin="miter" />
            <path d="M 0 5 H 100" fill="none" stroke={fill} strokeWidth="1.8" />
            <path d="M 100 5 L 100 25 L 88 5" fill="none" stroke={fill} strokeWidth="1.8" strokeLinejoin="miter" />
          </svg>
          <div className="absolute inset-0 flex items-center overflow-hidden px-3">
            <span className="truncate text-[10px] font-medium text-primary-fg">{taskName}</span>
          </div>
        </div>
      ) : (
        <>
          <div
            className="absolute inset-0 rounded-md opacity-85 transition-opacity hover:opacity-100"
            style={{ backgroundColor: fill }}
          />

          {progressRatio > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-l-md"
              style={{
                width: `${(progressRatio * 100).toFixed(0)}%`,
                backgroundColor: scheduleColors.progress(0.25),
              }}
            />
          )}

          <div className="absolute inset-0 flex items-center overflow-hidden px-2">
            <span className="truncate text-[10px] font-medium text-primary-fg">{taskName}</span>
          </div>

          {isDraggable ? (
            <>
              <div
                data-testid={`gantt-bar-start-${taskId}`}
                className="absolute top-0 bottom-0 left-0 z-30 w-2 cursor-col-resize rounded-l-md hover:bg-fg/20"
                onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
              />
              <div
                data-testid={`gantt-bar-end-${taskId}`}
                className="absolute top-0 right-0 bottom-0 z-30 w-2 cursor-col-resize rounded-r-md hover:bg-fg/20"
                onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
              />
              <div
                data-testid={`gantt-bar-move-${taskId}`}
                className="absolute inset-0 z-20 cursor-grab"
                onPointerDown={(e) => handlePointerDown(e, 'move')}
              />
            </>
          ) : null}
        </>
      )}

      <div className="pointer-events-none absolute -top-8 left-1/2 z-40 hidden -translate-x-1/2 rounded bg-fg px-2 py-0.5 text-[10px] whitespace-nowrap text-bg group-hover/bar:block">
        {taskName}: {formatters.shortDate(currentStart)} – {formatters.shortDate(currentEnd)}
      </div>
    </div>
  )
}
