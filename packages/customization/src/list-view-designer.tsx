'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import { Button, Checkbox, Input, Label, Select, cn } from '@appkit/ui'
import {
  OPERATORS_BY_KIND,
  customFieldDefKey,
  isCustomFieldKey,
} from './registry'
import { defaultListView } from './schema'
import type {
  FilterClause,
  FilterOperator,
  ListColumnPlacement,
  ListViewConfig,
  RecordTypeMeta,
} from './types'
import type {
  CustomFieldDefinition,
  CustomizationDesignerAdapter,
  CustomizationLabelResolver,
  ListViewDefinition,
} from './designer-types'

function humanize(value: string): string {
  const leaf = value.split('.').at(-1) ?? value
  return leaf
    .replace(/^_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (!moved) return items
  next.splice(to, 0, moved)
  return next
}

function ensureColumns(view: ListViewConfig, meta: RecordTypeMeta, fields: CustomFieldDefinition[]): ListViewConfig {
  const placed = new Set(view.columns.map((column) => column.key))
  for (const column of meta.listColumns) {
    if (!placed.has(column.key)) {
      view.columns.push({
        key: column.key,
        visible: !column.defaultHidden,
        width: column.defaultWidth ?? null,
        labelOverride: null,
      })
      placed.add(column.key)
    }
  }
  for (const field of fields.filter((candidate) => candidate.isActive && candidate.config.showInList)) {
    const key = `cf_${field.key}`
    if (!placed.has(key)) view.columns.push({ key, visible: true, width: null, labelOverride: null })
  }
  return view
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  ne: 'is not',
  in: 'is one of',
  not_in: 'is not one of',
  gte: 'is on or after',
  lte: 'is on or before',
  between: 'is between',
  contains: 'contains',
  is_set: 'is set',
  is_not_set: 'is not set',
}

export interface ListViewDesignerProps {
  recordType: string
  meta: RecordTypeMeta
  view?: ListViewDefinition
  fields?: CustomFieldDefinition[]
  adapter: Pick<CustomizationDesignerAdapter, 'saveListView' | 'deleteListView'>
  canManageOrganization?: boolean
  resolveLabel?: CustomizationLabelResolver
  onChange?: (config: ListViewConfig) => void
  onSaved?: (definition: ListViewDefinition) => void
  onDeleted?: (id: string) => void
  className?: string
}

export function ListViewDesigner({
  recordType,
  meta,
  view: definition,
  fields = [],
  adapter,
  canManageOrganization = true,
  resolveLabel = (_messageKey, fallback) => fallback,
  onChange,
  onSaved,
  onDeleted,
  className,
}: ListViewDesignerProps) {
  if (meta.key !== recordType) throw new Error('ListViewDesigner record type does not match metadata')

  const initial = useMemo(
    () => ensureColumns(structuredClone(definition?.config ?? defaultListView(meta)), meta, fields),
    [definition, fields, meta],
  )
  const [name, setName] = useState(definition?.name ?? `${humanize(recordType)} list`)
  const [scope, setScope] = useState<'organization' | 'user'>(definition?.scope ?? 'organization')
  const [isDefault, setIsDefault] = useState(definition?.isDefault ?? true)
  const [isActive, setIsActive] = useState(definition?.isActive ?? true)
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => onChange?.(view), [onChange, view])

  const customByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields])
  const columnLabel = (key: string): string => {
    if (isCustomFieldKey(key)) return customByKey.get(customFieldDefKey(key))?.label ?? humanize(key)
    const column = meta.listColumns.find((candidate) => candidate.key === key)
    return column ? resolveLabel(column.labelKey, humanize(key)) : humanize(key)
  }
  const filterLabel = (key: string): string => {
    const filter = meta.listFilters.find((candidate) => candidate.key === key)
    return filter ? resolveLabel(filter.labelKey, humanize(key)) : humanize(key)
  }
  const sortableColumns = meta.listColumns.filter((column) => column.sortable)

  const updateColumn = (index: number, patch: Partial<ListColumnPlacement>) =>
    setView((current) => {
      const next = structuredClone(current)
      next.columns[index] = { ...next.columns[index]!, ...patch }
      return next
    })
  const updateFilter = (index: number, patch: Partial<FilterClause>) =>
    setView((current) => {
      const next = structuredClone(current)
      next.filters[index] = { ...next.filters[index]!, ...patch }
      return next
    })

  async function save() {
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await adapter.saveListView({
        id: definition?.id,
        recordType,
        name: name.trim(),
        scope,
        isDefault,
        isActive,
        config: view,
      })
      setFeedback('Saved')
      onSaved?.(saved)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save the view')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!definition?.id || !adapter.deleteListView) return
    setBusy(true)
    setFeedback(null)
    try {
      await adapter.deleteListView(definition.id)
      onDeleted?.(definition.id)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not delete the view')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-bg', className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg-muted">{resolveLabel(meta.labelKey, humanize(recordType))}</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="List view name"
            className="mt-1 h-8 max-w-md font-semibold"
          />
        </div>
        {feedback ? <span className="text-xs text-fg-muted" role="status">{feedback}</span> : null}
        {definition?.id && adapter.deleteListView ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        ) : null}
        <Button size="sm" disabled={busy || !name.trim()} onClick={save}>
          <Save className="size-4" />
          {busy ? 'Saving…' : 'Save view'}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto max-w-5xl space-y-7 pb-8">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Columns</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <div className="grid min-w-[680px] grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_96px_104px] gap-2 border-b border-border bg-bg-subtle px-3 py-2 text-xs font-semibold text-fg-muted">
                <span>Column</span>
                <span>Label</span>
                <span>Width</span>
                <span className="text-right">Controls</span>
              </div>
              <div className="divide-y divide-border">
                {view.columns.map((column, index) => {
                  const locked = Boolean(meta.listColumns.find((candidate) => candidate.key === column.key)?.locked)
                  return (
                    <div
                      key={column.key}
                      className={cn(
                        'grid min-w-[680px] grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_96px_104px] items-center gap-2 px-3 py-2',
                        !column.visible && 'opacity-60',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <GripVertical className="size-4 shrink-0 text-fg-subtle" />
                        <span className="truncate text-sm font-medium text-fg">{columnLabel(column.key)}</span>
                        {locked ? <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">Locked</span> : null}
                      </div>
                      <Input
                        value={column.labelOverride ?? ''}
                        disabled={locked}
                        onChange={(event) => updateColumn(index, { labelOverride: event.target.value || null })}
                        placeholder={columnLabel(column.key)}
                        aria-label={`Rename ${columnLabel(column.key)}`}
                        className="h-8"
                      />
                      <Input
                        type="number"
                        min={40}
                        max={800}
                        value={column.width ?? ''}
                        onChange={(event) => updateColumn(index, { width: event.target.value ? Number(event.target.value) : null })}
                        aria-label={`${columnLabel(column.key)} width`}
                        className="h-8"
                      />
                      <div className="flex justify-end">
                        <RowButton label="Move column up" onClick={() => setView((current) => ({ ...current, columns: reorder(current.columns, index, index - 1) }))}><ChevronUp /></RowButton>
                        <RowButton label="Move column down" onClick={() => setView((current) => ({ ...current, columns: reorder(current.columns, index, index + 1) }))}><ChevronDown /></RowButton>
                        <RowButton label={column.visible ? 'Hide column' : 'Show column'} disabled={locked} onClick={() => updateColumn(index, { visible: !column.visible })}>
                          {column.visible ? <Eye /> : <EyeOff />}
                        </RowButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Filters</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setView((current) => {
                    const next = structuredClone(current)
                    const first = meta.listFilters[0]
                    if (first) {
                      next.filters.push({
                        key: first.key,
                        operator: first.operators[0] ?? 'eq',
                        value: '',
                        to: null,
                      })
                    }
                    return next
                  })
                }
              >
                <Plus className="size-4" />
                Add filter
              </Button>
            </div>
            {view.filters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-fg-subtle">
                No filters. This view includes every matching record.
              </div>
            ) : (
              <div className="space-y-2">
                {view.filters.map((filter, index) => {
                  const filterMeta = meta.listFilters.find((candidate) => candidate.key === filter.key)
                  const operators = filterMeta?.operators ?? OPERATORS_BY_KIND.text
                  const value = Array.isArray(filter.value) ? filter.value.join(', ') : filter.value ?? ''
                  return (
                    <div key={index} className="grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-[minmax(150px,1fr)_minmax(130px,0.8fr)_minmax(150px,1fr)_minmax(120px,0.8fr)_32px]">
                      <Select
                        value={filter.key}
                        onChange={(event) => {
                          const nextMeta = meta.listFilters.find((candidate) => candidate.key === event.target.value)
                          updateFilter(index, {
                            key: event.target.value,
                            operator: nextMeta?.operators[0] ?? 'eq',
                            value: '',
                            to: null,
                          })
                        }}
                        aria-label="Filter field"
                      >
                        {meta.listFilters.map((candidate) => (
                          <option key={candidate.key} value={candidate.key}>{filterLabel(candidate.key)}</option>
                        ))}
                      </Select>
                      <Select
                        value={filter.operator}
                        onChange={(event) => updateFilter(index, { operator: event.target.value as FilterOperator })}
                        aria-label="Filter operator"
                      >
                        {operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}
                      </Select>
                      {filter.operator === 'is_set' || filter.operator === 'is_not_set' ? <span /> : filterMeta?.kind === 'boolean' ? (
                        <Select value={String(value)} onChange={(event) => updateFilter(index, { value: event.target.value })} aria-label="Filter value">
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </Select>
                      ) : filterMeta?.kind === 'select' && filterMeta.options ? (
                        <Select value={String(value)} onChange={(event) => updateFilter(index, { value: event.target.value })} aria-label="Filter value">
                          <option value="">Choose…</option>
                          {filterMeta.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.labelKey ? resolveLabel(option.labelKey, humanize(option.value)) : humanize(option.value)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          value={String(value)}
                          onChange={(event) =>
                            updateFilter(index, {
                              value: filter.operator === 'in' || filter.operator === 'not_in'
                                ? event.target.value.split(',').map((part) => part.trim()).filter(Boolean)
                                : event.target.value,
                            })
                          }
                          placeholder={filterMeta?.kind === 'entity_ref' ? 'Record ID' : 'Value'}
                          aria-label="Filter value"
                        />
                      )}
                      {filter.operator === 'between' ? (
                        <Input value={filter.to ?? ''} onChange={(event) => updateFilter(index, { to: event.target.value })} placeholder="To" aria-label="Filter upper bound" />
                      ) : <span />}
                      <RowButton
                        label="Remove filter"
                        onClick={() =>
                          setView((current) => {
                            const next = structuredClone(current)
                            next.filters.splice(index, 1)
                            return next
                          })
                        }
                      >
                        <Trash2 />
                      </RowButton>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Sort by</Label>
              <Select
                value={view.sort?.column ?? ''}
                onChange={(event) =>
                  setView((current) => ({
                    ...current,
                    sort: event.target.value
                      ? { column: event.target.value, dir: current.sort?.dir ?? 'desc' }
                      : null,
                  }))
                }
              >
                <option value="">No sort</option>
                {sortableColumns.map((column) => <option key={column.key} value={column.key}>{columnLabel(column.key)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={view.sort?.dir ?? 'desc'}
                disabled={!view.sort}
                onChange={(event) =>
                  setView((current) => ({
                    ...current,
                    sort: current.sort ? { ...current.sort, dir: event.target.value as 'asc' | 'desc' } : null,
                  }))
                }
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rows per page</Label>
              <Input
                type="number"
                min={5}
                max={100}
                value={view.perPage ?? 25}
                onChange={(event) => setView((current) => ({ ...current, perPage: Number(event.target.value) || 25 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={scope}
                disabled={!canManageOrganization}
                onChange={(event) => setScope(event.target.value as 'organization' | 'user')}
              >
                <option value="user">Only me</option>
                <option value="organization">Organization</option>
              </Select>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
              Default view
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}

function RowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactElement
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-sm p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      <span className="[&>svg]:size-4">{children}</span>
    </button>
  )
}
