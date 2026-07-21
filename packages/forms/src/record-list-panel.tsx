'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react'
import { Button, Input, Label, Select, cn } from '@appkit/ui'
import type { ListColumnConfig, ListConfig } from './record-config'

const BUILTIN_LABEL: Record<string, string> = {
  id: 'ID',
  subject: 'Subject',
  site: 'Site',
  status: 'Status',
  created_at: 'Started',
  submitted_at: 'Submitted',
  submittedBy: 'By',
  pdf: 'PDF',
}
const BUILTIN_KEYS = Object.keys(BUILTIN_LABEL)
export const DEFAULT_RECORD_LIST_COLUMNS: ListColumnConfig[] = BUILTIN_KEYS.map((key) => ({ key, source: 'builtin' }))

const SORT_OPTIONS: { key: NonNullable<ListConfig['defaultSort']>['key']; label: string }[] = [
  { key: 'submitted_at', label: 'Submitted' },
  { key: 'created_at', label: 'Started' },
  { key: 'status', label: 'Status' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'closed', label: 'Closed' },
  { value: 'rejected', label: 'Rejected' },
]

function columnId(column: ListColumnConfig) {
  return `${column.source}:${column.key}`
}

export type RecordListPanelProps = {
  value?: ListConfig
  fields: { id: string; label: string }[]
  onChange: (config: ListConfig) => void
  onSave?: (config: ListConfig) => void | Promise<void>
  readOnly?: boolean
  className?: string
}

export function RecordListPanel({ value, fields, onChange, onSave, readOnly = false, className }: RecordListPanelProps) {
  const configured = Boolean(value?.columns?.length)
  const columns = value?.columns?.length ? value.columns : DEFAULT_RECORD_LIST_COLUMNS
  const [addKind, setAddKind] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  const present = React.useMemo(() => new Set(columns.map(columnId)), [columns])
  const fieldLabels = React.useMemo(() => new Map(fields.map((field) => [field.id, field.label])), [fields])
  const addableBuiltins = BUILTIN_KEYS.filter((key) => !present.has(`builtin:${key}`))
  const addableFields = fields.filter((field) => !present.has(`field:${field.id}`))
  const canAdd = addableBuiltins.length + addableFields.length > 0

  const commit = React.useCallback((patch: Partial<ListConfig>) => {
    onChange({ ...value, ...patch })
  }, [onChange, value])

  const setColumns = (next: ListColumnConfig[] | undefined) => commit({ columns: next })

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= columns.length) return
    const next = columns.map((column) => ({ ...column }))
    const current = next[index]
    const replacement = next[target]
    if (!current || !replacement) return
    next[index] = replacement
    next[target] = current
    setColumns(next)
  }

  function add() {
    if (!addKind) return
    const separator = addKind.indexOf(':')
    const source = addKind.slice(0, separator)
    const key = addKind.slice(separator + 1)
    if (source === 'builtin' && BUILTIN_KEYS.includes(key)) setColumns([...columns, { source, key }])
    if (source === 'field' && fieldLabels.has(key)) setColumns([...columns, { source, key }])
    setAddKind('')
  }

  const displayLabel = (column: ListColumnConfig) => column.source === 'builtin'
    ? BUILTIN_LABEL[column.key] ?? column.key
    : fieldLabels.get(column.key) ?? column.key

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-xs text-fg-muted">Choose the columns, default sort, and initial status filter for the record list.</p>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Columns</Label>
          <Button type="button" variant="ghost" size="sm" disabled={readOnly || !configured} onClick={() => setColumns(undefined)}>Reset defaults</Button>
        </div>
        <ul className="space-y-2">
          {columns.map((column, index) => (
            <li key={columnId(column)} className="rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{displayLabel(column)}</span>
                <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-muted">{column.source}</span>
                <div className="flex items-center gap-0.5">
                  <IconButton label="Move column up" disabled={readOnly || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></IconButton>
                  <IconButton label="Move column down" disabled={readOnly || index === columns.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></IconButton>
                  <IconButton label="Remove column" danger disabled={readOnly} onClick={() => setColumns(columns.filter((_, candidate) => candidate !== index))}><X size={14} /></IconButton>
                </div>
              </div>
              <Input
                value={column.label ?? ''}
                disabled={readOnly}
                onChange={(event) => {
                  const next = columns.map((candidate) => ({ ...candidate }))
                  next[index] = { ...column, label: event.target.value.trim() || undefined }
                  setColumns(next)
                }}
                placeholder={`Custom label (default: ${displayLabel(column)})`}
                className="mt-1.5 h-7 text-xs"
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Select value={addKind} onChange={(event) => setAddKind(event.target.value)} disabled={readOnly || !canAdd} className="flex-1">
            <option value="">{canAdd ? 'Add a column…' : 'All columns added'}</option>
            {addableBuiltins.length ? <optgroup label="Record columns">{addableBuiltins.map((key) => <option key={key} value={`builtin:${key}`}>{BUILTIN_LABEL[key]}</option>)}</optgroup> : null}
            {addableFields.length ? <optgroup label="Form fields">{addableFields.map((field) => <option key={field.id} value={`field:${field.id}`}>{field.label}</option>)}</optgroup> : null}
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={readOnly || !addKind} aria-label="Add column"><Plus size={14} /></Button>
        </div>
        <p className="text-[11px] text-fg-subtle">Drag-free ordering keeps the list editor keyboard accessible; use the arrow controls to set exact order.</p>
      </section>

      <section className="space-y-2">
        <Label className="text-xs">Default sort</Label>
        <div className="flex items-center gap-2">
          <Select value={value?.defaultSort?.key ?? 'submitted_at'} onChange={(event) => commit({ defaultSort: { key: event.target.value as NonNullable<ListConfig['defaultSort']>['key'], dir: value?.defaultSort?.dir ?? 'desc' } })} disabled={readOnly} className="flex-1">
            {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => commit({ defaultSort: { key: value?.defaultSort?.key ?? 'submitted_at', dir: value?.defaultSort?.dir === 'asc' ? 'desc' : 'asc' } })}
          >
            {value?.defaultSort?.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            {value?.defaultSort?.dir === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs">Default status</Label>
        <Select value={value?.defaultStatus ?? ''} disabled={readOnly} onChange={(event) => commit({ defaultStatus: event.target.value || undefined })}>
          {STATUS_OPTIONS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
        </Select>
        <p className="text-[11px] text-fg-subtle">People can still change the filter after the list opens.</p>
      </section>

      {onSave ? <Button type="button" disabled={pending || readOnly} className="w-full" onClick={() => startTransition(async () => onSave(value ?? {}))}><Check size={14} />{pending ? 'Saving…' : 'Save list settings'}</Button> : null}
    </div>
  )
}

function IconButton({ label, disabled, danger = false, onClick, children }: { label: string; disabled: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={cn('rounded p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-30', danger && 'hover:bg-danger-subtle hover:text-danger')}>{children}</button>
}
