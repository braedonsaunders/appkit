'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from './button'
import { cn } from './utils'

export interface QueryChip {
  kind: 'condition'
  id: string
  field: React.ReactNode
  operator: React.ReactNode
  value: React.ReactNode
  disabled?: boolean
}

export interface QueryChipGroup {
  kind: 'group'
  id: string
  /** Visible, localized group indicator, such as “All” or “Any”. */
  label: string
  children: readonly QueryChipNode[]
}

export type QueryChipNode = QueryChip | QueryChipGroup

export interface QueryChipsProps {
  items: readonly QueryChipNode[]
  ariaLabel: string
  /** Labels include the condition's identity; hosts own localization. */
  editLabel: (chip: QueryChip) => string
  removeLabel: (chip: QueryChip) => string
  onEdit: (chip: QueryChip) => void
  onRemove: (chip: QueryChip) => void
  editingId?: string | null
  /** Hosts supply typed field/operator/value controls and commit/cancel actions. */
  renderEditor?: (chip: QueryChip) => React.ReactNode
  empty?: React.ReactNode
  actions?: React.ReactNode
  disabled?: boolean
  className?: string
}

/** Controlled expression display. Hosts retain their AST, editor, search and persistence. */
export function QueryChips({
  items,
  ariaLabel,
  editLabel,
  removeLabel,
  onEdit,
  onRemove,
  editingId,
  renderEditor,
  empty,
  actions,
  disabled,
  className,
}: QueryChipsProps) {
  function renderNode(node: QueryChipNode): React.ReactNode {
    if (node.kind === 'group') {
      return (
        <div
          key={node.id}
          role="group"
          aria-label={node.label}
          className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-border border-dashed bg-bg-subtle p-1.5"
        >
          <span className="px-1 text-xs font-semibold text-fg-muted">
            {node.label}
          </span>
          {node.children.map(renderNode)}
        </div>
      )
    }
    const isDisabled = disabled || node.disabled
    return (
      <div
        key={node.id}
        className="inline-flex max-w-full flex-wrap items-center rounded-md border border-border bg-surface text-sm"
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDisabled}
          aria-label={editLabel(node)}
          aria-expanded={renderEditor ? editingId === node.id : undefined}
          onClick={() => onEdit(node)}
          className="h-auto min-h-8 max-w-full justify-start gap-1.5 whitespace-normal rounded-r-none px-2 text-left"
        >
          <span className="font-medium text-fg">{node.field}</span>
          <span className="text-fg-subtle">{node.operator}</span>
          <span className="break-words text-primary">{node.value}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDisabled}
          aria-label={removeLabel(node)}
          onClick={() => onRemove(node)}
          className="h-8 w-8 shrink-0 rounded-l-none border-l border-border p-0"
        >
          <X size={12} aria-hidden="true" />
        </Button>
        {editingId === node.id && renderEditor ? (
          <div className="w-full basis-full border-t border-border p-2">
            {renderEditor(node)}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {items.length ? items.map(renderNode) : empty}
      {actions}
    </div>
  )
}
