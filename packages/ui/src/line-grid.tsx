'use client'

/**
 * LineGrid — a spreadsheet-grade line-item editor for documents (invoices,
 * bills, journals, estimates). Controlled: rows in, rows out; the parent owns
 * persistence and any computed columns.
 *
 *  - Enter commits + moves down (appending a row at the bottom)
 *  - Alt+↑/↓ moves the row, ⌘/Ctrl+D duplicates, ⌘/Ctrl+⌫ deletes
 *  - per-row grip menu: insert above/below, duplicate, remove
 *  - amount cells edit raw, normalize to 2dp on blur, flag non-numeric
 *  - columns are data: text / amount / select / readonly (+ custom render)
 */

import * as React from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from './button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from './dropdown-menu'
import { Select, type SelectOption } from './select'
import { cn } from './utils'

export type LineGridColumn<Row extends Record<string, unknown>> = {
  key: string
  label: string
  /** CSS grid track, e.g. 'minmax(180px,2fr)' or '110px'. */
  width: string
  type: 'text' | 'amount' | 'select' | 'readonly'
  align?: 'left' | 'right'
  options?: SelectOption[]
  placeholder?: string
  required?: boolean
  /** Renderer for readonly columns (computed cells). */
  render?: (row: Row, index: number) => React.ReactNode
}

export type LineGridLabels = {
  addLine: string
  keyboardHint: string
  insertAbove: string
  insertBelow: string
  duplicate: string
  removeLine: string
  clearLine: string
  lineActions: (n: number) => string
}

const DEFAULT_LABELS: LineGridLabels = {
  addLine: 'Add line',
  keyboardHint: 'Enter to add a row · Alt+↑/↓ to move · ⌘D to duplicate · ⌘⌫ to remove',
  insertAbove: 'Insert above',
  insertBelow: 'Insert below',
  duplicate: 'Duplicate',
  removeLine: 'Remove line',
  clearLine: 'Clear line',
  lineActions: (n) => `Line ${n} actions`,
}

function normalizeAmount(v: string): string {
  const n = Number(v)
  if (v.trim() === '' || Number.isNaN(n)) return v
  return n.toFixed(2)
}

export type LineGridProps<Row extends Record<string, unknown>> = {
  columns: LineGridColumn<Row>[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void
  emptyRow: () => Row
  readOnly?: boolean
  minRows?: number
  footer?: React.ReactNode
  labels?: Partial<LineGridLabels>
}

export function LineGrid<Row extends Record<string, unknown>>({
  columns,
  rows,
  onRowsChange,
  emptyRow,
  readOnly = false,
  minRows = 1,
  footer,
  labels: labelOverrides,
}: LineGridProps<Row>) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const containerRef = React.useRef<HTMLDivElement>(null)
  const focusedCol = React.useRef(0)

  const template = readOnly
    ? columns.map((c) => c.width).join(' ')
    : `34px ${columns.map((c) => c.width).join(' ')}`

  const setCell = React.useCallback(
    (i: number, key: string, value: unknown) => {
      onRowsChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
    },
    [rows, onRowsChange],
  )

  function focusCell(row: number, col: number) {
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-lg-row="${row}"][data-lg-col="${col}"] input, [data-lg-row="${row}"][data-lg-col="${col}"] button`,
      )
      el?.focus()
    })
  }

  const insertRow = (at: number) => {
    const next = [...rows]
    next.splice(at, 0, emptyRow())
    onRowsChange(next)
    focusCell(at, 0)
  }
  const duplicateRow = (i: number) => {
    const next = [...rows]
    next.splice(i + 1, 0, { ...rows[i]! })
    onRowsChange(next)
    focusCell(i + 1, 0)
  }
  const removeRow = (i: number) => {
    if (rows.length <= minRows) {
      onRowsChange(rows.map((r, j) => (j === i ? emptyRow() : r)))
      return
    }
    onRowsChange(rows.filter((_, j) => j !== i))
  }
  const moveRow = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(i, 1)
    next.splice(j, 0, row!)
    onRowsChange(next)
    focusCell(j, focusedCol.current)
  }

  function handleKeyDown(e: React.KeyboardEvent, i: number, colIndex: number) {
    focusedCol.current = colIndex
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      if ((e.target as HTMLElement).getAttribute('aria-expanded') === 'true') return
      e.preventDefault()
      if (i === rows.length - 1) {
        onRowsChange([...rows, emptyRow()])
        focusCell(i + 1, colIndex)
      } else {
        focusCell(i + 1, colIndex)
      }
      return
    }
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      moveRow(i, -1)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      moveRow(i, 1)
    } else if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      duplicateRow(i)
    } else if (mod && e.key === 'Backspace') {
      e.preventDefault()
      removeRow(i)
      focusCell(Math.max(0, i - 1), colIndex)
    }
  }

  const cellBase = 'flex min-h-[38px] items-center border-b border-border-subtle px-1'
  const inputBase =
    'w-full rounded-sm border-0 bg-transparent px-1.5 py-1 text-sm text-fg outline-none focus:ring-2 focus:ring-ring/50'

  return (
    <div>
      <div ref={containerRef} className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="grid min-w-fit" style={{ gridTemplateColumns: template }}>
          {!readOnly ? <div className="border-b border-border" /> : null}
          {columns.map((c) => (
            <div
              key={c.key}
              className={cn(
                'border-b border-border px-2.5 py-2 text-[11px] font-semibold tracking-wide text-fg-muted uppercase',
                c.align === 'right' && 'text-right',
              )}
            >
              {c.label}
              {c.required && !readOnly ? <span className="text-danger"> *</span> : null}
            </div>
          ))}

          {rows.map((row, i) => (
            <React.Fragment key={i}>
              {!readOnly ? (
                <div className={cn(cellBase, 'justify-center px-0')}>
                  <DropdownMenu
                    align="start"
                    className="w-44"
                    trigger={
                      <button
                        type="button"
                        aria-label={labels.lineActions(i + 1)}
                        className="group flex size-7 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                      >
                        <span className="text-[11px] tabular-nums group-hover:hidden">{i + 1}</span>
                        <GripVertical size={13} className="hidden group-hover:block" />
                      </button>
                    }
                  >
                    <DropdownMenuItem icon={<ArrowUp size={14} />} onSelect={() => insertRow(i)}>
                      {labels.insertAbove}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<ArrowDown size={14} />} onSelect={() => insertRow(i + 1)}>
                      {labels.insertBelow}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Copy size={14} />} onSelect={() => duplicateRow(i)}>
                      {labels.duplicate}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      icon={<Trash2 size={14} />}
                      variant="danger"
                      onSelect={() => removeRow(i)}
                    >
                      {rows.length > minRows ? labels.removeLine : labels.clearLine}
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>
              ) : null}

              {columns.map((c, colIndex) => {
                const value = row[c.key]
                if (readOnly || c.type === 'readonly') {
                  let display: React.ReactNode
                  if (c.render) display = c.render(row, i)
                  else if (c.type === 'select' && value)
                    display = c.options?.find((o) => o.value === value)?.label ?? ''
                  else display = (value as string) ?? ''
                  return (
                    <div
                      key={c.key}
                      className={cn(cellBase, 'px-2.5 text-sm', c.align === 'right' && 'justify-end tabular-nums')}
                    >
                      {display}
                    </div>
                  )
                }
                return (
                  <div
                    key={c.key}
                    data-lg-row={i}
                    data-lg-col={colIndex}
                    className={cellBase}
                    onKeyDown={(e) => handleKeyDown(e, i, colIndex)}
                  >
                    {c.type === 'select' ? (
                      <Select
                        value={(value as string) ?? ''}
                        onChange={(v) => setCell(i, c.key, v)}
                        options={c.options ?? []}
                        placeholder={c.placeholder ?? '—'}
                        triggerClassName="h-auto min-h-0 border-0 bg-transparent px-1.5 py-1 focus-visible:ring-1"
                      />
                    ) : c.type === 'amount' ? (
                      <input
                        inputMode="decimal"
                        value={(value as string) ?? ''}
                        placeholder={c.placeholder ?? '0.00'}
                        aria-invalid={
                          value !== '' && value != null && Number.isNaN(Number(value)) ? true : undefined
                        }
                        onChange={(e) => setCell(i, c.key, e.target.value)}
                        onBlur={(e) => setCell(i, c.key, normalizeAmount(e.target.value))}
                        className={cn(
                          inputBase,
                          'text-right tabular-nums',
                          value !== '' && value != null && Number.isNaN(Number(value)) &&
                            'text-danger focus:ring-danger/50',
                        )}
                      />
                    ) : (
                      <input
                        value={(value as string) ?? ''}
                        placeholder={c.placeholder}
                        onChange={(e) => setCell(i, c.key, e.target.value)}
                        className={inputBase}
                      />
                    )}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        {!readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={() => insertRow(rows.length)}>
            <Plus size={14} /> {labels.addLine}
          </Button>
        ) : (
          <span />
        )}
        {footer}
      </div>
      {!readOnly ? <p className="mt-1.5 text-[11px] text-fg-subtle">{labels.keyboardHint}</p> : null}
    </div>
  )
}
