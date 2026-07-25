'use client'

/**
 * Right-click menu for a task row: edit, outline moves, type conversion,
 * status, duplicate, delete.
 *
 * Type conversion carries the field changes the new type implies — converting
 * to a milestone zeroes the duration and pins the finish to the start, because
 * a "milestone" that still spans five days is a bar wearing a diamond.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Diamond,
  Pause,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@appkit/ui'
import type { ScheduleTask, ScheduleTaskPatchInput, ScheduleTaskStatus } from '../types'
import { useSchedulingLabels } from './context'

export interface ContextMenuState {
  x: number
  y: number
  task: ScheduleTask
}

export interface ScheduleContextMenuProps {
  menu: ContextMenuState | null
  onClose: () => void
  onEdit: (task: ScheduleTask) => void
  onDelete: (taskId: string) => void
  onUpdate: (taskId: string, patch: ScheduleTaskPatchInput) => void
  onDuplicate?: (task: ScheduleTask) => void
  onCreateSibling?: (task: ScheduleTask) => void
  onCreateChild?: (task: ScheduleTask) => void
  onIndent?: (taskId: string) => void
  onOutdent?: (taskId: string) => void
  onMove?: (taskId: string, direction: 'up' | 'down') => void
}

const STATUS_ICONS: Record<ScheduleTaskStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  on_hold: Pause,
  complete: CheckCircle2,
}
const STATUS_ORDER: ScheduleTaskStatus[] = ['not_started', 'in_progress', 'on_hold', 'complete']

/** Menu box estimate, used only to keep it inside the viewport. */
const MENU_WIDTH = 220
const MENU_HEIGHT = 430
const VIEWPORT_MARGIN = 8

export function ScheduleContextMenu({
  menu,
  onClose,
  onEdit,
  onDelete,
  onUpdate,
  onDuplicate,
  onCreateSibling,
  onCreateChild,
  onIndent,
  onOutdent,
  onMove,
}: ScheduleContextMenuProps) {
  const labels = useSchedulingLabels()
  const ref = useRef<HTMLDivElement>(null)
  const [statusOpen, setStatusOpen] = useState(false)

  useEffect(() => {
    if (!menu) return
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu, onClose])

  useEffect(() => setStatusOpen(false), [menu])

  if (!menu) return null

  const { x, y, task } = menu
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT - VIEWPORT_MARGIN)

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="schedule-context-menu"
      className="fixed z-[100] min-w-[220px] rounded-lg border border-border bg-elevated py-1 text-xs shadow-xl"
      style={{ left: clampedX, top: clampedY }}
    >
      <MenuItem icon={Pencil} label={labels.editor.title} onClick={act(() => onEdit(task))} />
      {onCreateSibling && (
        <MenuItem icon={Plus} label={labels.toolbar.addTask} onClick={act(() => onCreateSibling(task))} />
      )}
      {onCreateChild && (
        <MenuItem
          icon={Plus}
          label={`${labels.toolbar.addTask} — ${labels.badges.summary}`}
          onClick={act(() => onCreateChild(task))}
        />
      )}

      <Separator />

      {onIndent && (
        <MenuItem icon={ChevronRight} label={labels.toolbar.indent} onClick={act(() => onIndent(task.id))} />
      )}
      {onOutdent && (
        <MenuItem
          icon={ChevronRight}
          iconClassName="rotate-180"
          label={labels.toolbar.outdent}
          onClick={act(() => onOutdent(task.id))}
        />
      )}
      {onMove && (
        <>
          <MenuItem icon={ArrowUp} label={labels.menu.earlier} onClick={act(() => onMove(task.id, 'up'))} />
          <MenuItem icon={ArrowDown} label={labels.menu.later} onClick={act(() => onMove(task.id, 'down'))} />
        </>
      )}

      <Separator />

      {task.taskType !== 'task' ? (
        <MenuItem
          icon={Diamond}
          label={labels.taskType.task}
          onClick={act(() =>
            onUpdate(task.id, { taskType: 'task', duration: Math.max(task.duration, 1) }),
          )}
        />
      ) : null}
      {task.taskType !== 'milestone' ? (
        <MenuItem
          icon={Diamond}
          label={labels.taskType.milestone}
          onClick={act(() =>
            onUpdate(task.id, {
              taskType: 'milestone',
              duration: 0,
              progress: 0,
              endDate: task.startDate,
            }),
          )}
        />
      ) : null}
      {task.taskType !== 'summary' ? (
        <MenuItem
          icon={Diamond}
          label={labels.taskType.summary}
          onClick={act(() =>
            onUpdate(task.id, { taskType: 'summary', duration: Math.max(task.duration, 1) }),
          )}
        />
      ) : null}

      <Separator />

      <div
        className="relative"
        onMouseEnter={() => setStatusOpen(true)}
        onMouseLeave={() => setStatusOpen(false)}
      >
        <div className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-fg-muted transition-colors hover:bg-surface-hover">
          <Clock className="h-3.5 w-3.5 text-fg-subtle" />
          <span className="flex-1">{labels.columns.status}</span>
          <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
        </div>
        {statusOpen && (
          <div className="absolute top-0 left-full ml-1 min-w-[170px] rounded-lg border border-border bg-elevated py-1 shadow-xl">
            {STATUS_ORDER.map((status) => {
              const Icon = STATUS_ICONS[status]
              const isActive = task.status === status
              return (
                <div
                  key={status}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors',
                    isActive
                      ? 'bg-primary-subtle text-primary'
                      : 'text-fg-muted hover:bg-surface-hover',
                  )}
                  onClick={act(() =>
                    onUpdate(task.id, {
                      status,
                      ...(status === 'complete' ? { progress: 1 } : {}),
                    }),
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{labels.status[status]}</span>
                  {isActive ? <CheckCircle2 className="ml-auto h-3 w-3" /> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {onDuplicate && (
        <MenuItem icon={Copy} label={labels.menu.snapshot} onClick={act(() => onDuplicate(task))} />
      )}

      <Separator />

      <MenuItem
        icon={Trash2}
        label={labels.editor.delete}
        danger
        onClick={act(() => onDelete(task.id))}
      />
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  iconClassName,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  danger?: boolean
  iconClassName?: string
}) {
  return (
    <div
      role="menuitem"
      className={cn(
        'flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors',
        danger ? 'text-danger hover:bg-danger-subtle' : 'text-fg-muted hover:bg-surface-hover',
      )}
      onClick={onClick}
    >
      <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
      <span>{label}</span>
    </div>
  )
}

function Separator() {
  return <div className="my-1 border-t border-border" />
}

/** Track right-click position and target task for the menu above. */
export function useScheduleContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const handleContextMenu = useCallback((event: React.MouseEvent, task: ScheduleTask) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, task })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  return { menu, handleContextMenu, closeMenu }
}
