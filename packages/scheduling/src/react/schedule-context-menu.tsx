'use client'

/**
 * Right-click menu for a task row, built on `@braedonsaunders/ui`'s ContextMenu: edit,
 * outline moves, type conversion, status, duplicate, delete.
 *
 * Everything is one flat list with separators rather than a hover submenu —
 * that is what the shared primitive draws, and a flat list is what actually
 * works on touch. The current status carries a check so the section reads as a
 * choice rather than eight unrelated commands.
 *
 * Type conversion carries the field changes the new type implies: converting to
 * a milestone zeroes the duration and pins the finish to the start, because a
 * "milestone" that still spans five days is a bar wearing a diamond.
 */

import { useCallback, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Diamond,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { ContextMenu, type ContextMenuEntry } from '@braedonsaunders/ui'
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

const STATUS_ORDER: ScheduleTaskStatus[] = ['not_started', 'in_progress', 'on_hold', 'complete']

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
  if (!menu) return null

  const { task } = menu
  const items: ContextMenuEntry[] = [
    { key: 'edit', label: labels.editor.title, icon: Pencil, onSelect: () => onEdit(task) },
    ...(onCreateSibling
      ? [
          {
            key: 'sibling',
            label: labels.toolbar.addTask,
            icon: Plus,
            onSelect: () => onCreateSibling(task),
          },
        ]
      : []),
    ...(onCreateChild
      ? [
          {
            key: 'child',
            label: labels.editor.addChild,
            icon: Plus,
            onSelect: () => onCreateChild(task),
          },
        ]
      : []),

    { key: 'sep-outline', separator: true as const },
    ...(onIndent
      ? [
          {
            key: 'indent',
            label: labels.toolbar.indent,
            icon: ChevronRight,
            onSelect: () => onIndent(task.id),
          },
        ]
      : []),
    ...(onOutdent
      ? [
          {
            key: 'outdent',
            label: labels.toolbar.outdent,
            icon: ChevronRight,
            onSelect: () => onOutdent(task.id),
          },
        ]
      : []),
    ...(onMove
      ? [
          {
            key: 'up',
            label: labels.menu.earlier,
            icon: ArrowUp,
            onSelect: () => onMove(task.id, 'up'),
          },
          {
            key: 'down',
            label: labels.menu.later,
            icon: ArrowDown,
            onSelect: () => onMove(task.id, 'down'),
          },
        ]
      : []),

    { key: 'sep-type', separator: true as const },
    ...(task.taskType !== 'task'
      ? [
          {
            key: 'to-task',
            label: labels.editor.convertTo(labels.taskType.task),
            icon: Diamond,
            onSelect: () =>
              onUpdate(task.id, { taskType: 'task', duration: Math.max(task.duration, 1) }),
          },
        ]
      : []),
    ...(task.taskType !== 'milestone'
      ? [
          {
            key: 'to-milestone',
            label: labels.editor.convertTo(labels.taskType.milestone),
            icon: Diamond,
            onSelect: () =>
              onUpdate(task.id, {
                taskType: 'milestone',
                duration: 0,
                progress: 0,
                endDate: task.startDate,
              }),
          },
        ]
      : []),
    ...(task.taskType !== 'summary'
      ? [
          {
            key: 'to-summary',
            label: labels.editor.convertTo(labels.taskType.summary),
            icon: Diamond,
            onSelect: () =>
              onUpdate(task.id, { taskType: 'summary', duration: Math.max(task.duration, 1) }),
          },
        ]
      : []),

    { key: 'sep-status', separator: true as const },
    ...STATUS_ORDER.map((status) => ({
      key: `status-${status}`,
      label: labels.status[status],
      // The check marks where the task is now; the rest are the moves available.
      icon: task.status === status ? Check : undefined,
      disabled: task.status === status,
      onSelect: () =>
        onUpdate(task.id, {
          status,
          // Marking complete without progress leaves the two disagreeing.
          ...(status === 'complete' ? { progress: 1 } : {}),
        }),
    })),

    ...(onDuplicate
      ? [
          { key: 'sep-duplicate', separator: true as const },
          {
            key: 'duplicate',
            label: labels.editor.duplicate,
            icon: Copy,
            onSelect: () => onDuplicate(task),
          },
        ]
      : []),

    { key: 'sep-delete', separator: true as const },
    {
      key: 'delete',
      label: labels.editor.delete,
      icon: Trash2,
      danger: true,
      onSelect: () => onDelete(task.id),
    },
  ]

  return (
    <ContextMenu open position={{ x: menu.x, y: menu.y }} items={items} onClose={onClose} />
  )
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
