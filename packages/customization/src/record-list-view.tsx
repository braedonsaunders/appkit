'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react'
import {
  Badge,
  type BadgeProps,
  Button,
  EmptyState,
  Input,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@appkit/ui'
import type { ListColumnKind, ListViewConfig, RecordTypeMeta } from './types'
import {
  resolveListColumns,
  type DynamicListColumn,
  type ResolvedListColumn,
  type SavedListView,
} from './list-runtime'
import type { CustomizationLabelResolver } from './designer-types'

export interface RecordListFilterOption {
  value: string
  label: string
  count?: number
}

export interface RecordListQuickFilter {
  key: string
  label: string
  value?: string
  options: RecordListFilterOption[]
  allLabel?: string
  onChange: (value: string | undefined) => void
}

export interface RecordListSubtab {
  key: string
  label: string
  count?: number
}

export interface RecordListViewProps<R extends Record<string, unknown>> {
  meta: RecordTypeMeta
  view: ListViewConfig
  rows: R[]
  total: number
  page: number
  perPage: number
  views?: SavedListView[]
  currentViewId?: string | null
  currentViewName?: string
  dynamicColumns?: DynamicListColumn[]
  quickFilters?: RecordListQuickFilter[]
  subtabs?: RecordListSubtab[]
  activeSubtab?: string
  search?: string
  searchPlaceholder?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  currency?: string
  canManageViews?: boolean
  resolveLabel?: CustomizationLabelResolver
  rowKey: (row: R) => React.Key
  onSearchChange?: (value: string) => void
  onPageChange?: (page: number) => void
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void
  onViewChange?: (viewId: string) => void
  onSetDefaultView?: (viewId: string | null) => Promise<void> | void
  onCreateView?: () => void
  onManageViews?: () => void
  onSubtabChange?: (key: string) => void
  onOpenRow?: (row: R) => void
  statusVariant?: (value: string, row: R) => NonNullable<BadgeProps['variant']>
  renderCell?: (context: { row: R; column: ResolvedListColumn; value: unknown }) => React.ReactNode
  renderRowActions?: (row: R) => React.ReactNode
  className?: string
}

/**
 * Source record-list composition with every product concern injected: saved
 * views, search, compact filters, typed/sortable columns, drill-through,
 * actions, pagination, and optional page subtabs.
 */
export function RecordListView<R extends Record<string, unknown>>({
  meta,
  view,
  rows,
  total,
  page,
  perPage,
  views = [],
  currentViewId,
  currentViewName = 'Default view',
  dynamicColumns = [],
  quickFilters = [],
  subtabs = [],
  activeSubtab,
  search = '',
  searchPlaceholder = 'Search',
  emptyTitle = 'No records',
  emptyDescription = 'There are no records in this view.',
  emptyAction,
  currency,
  canManageViews = false,
  resolveLabel = (_key, fallback) => fallback,
  rowKey,
  onSearchChange,
  onPageChange,
  onSortChange,
  onViewChange,
  onSetDefaultView,
  onCreateView,
  onManageViews,
  onSubtabChange,
  onOpenRow,
  statusVariant,
  renderCell,
  renderRowActions,
  className,
}: RecordListViewProps<R>) {
  const columns = React.useMemo(
    () => resolveListColumns(view, meta, resolveLabel, dynamicColumns),
    [dynamicColumns, meta, resolveLabel, view],
  )
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  return <div className={cn('space-y-3', className)}>
    {subtabs.length ? <RecordSubtabs tabs={subtabs} active={activeSubtab ?? subtabs[0]?.key ?? ''} onChange={onSubtabChange} /> : null}
    <div className="flex flex-wrap items-center gap-2">
      <ControlledSearch value={search} placeholder={searchPlaceholder} onChange={onSearchChange} />
      {quickFilters.map((filter) => <QuickFilterMenu key={filter.key} filter={filter} />)}
      {views.length || canManageViews ? <SavedViewsMenu
        views={views}
        currentId={currentViewId ?? null}
        currentName={currentViewName}
        canManage={canManageViews}
        onChange={onViewChange}
        onSetDefault={onSetDefaultView}
        onCreate={onCreateView}
        onManage={onManageViews}
      /> : null}
    </div>
    {total === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /> : <>
      <Table>
        <TableHeader><TableRow noAnimate>{columns.map((column) => <RecordTableHead
          key={column.key}
          column={column}
          sort={view.sort}
          onSort={onSortChange}
        />)}</TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={rowKey(row)}>{columns.map((column) => <RecordCell
          key={column.key}
          row={row}
          column={column}
          onOpen={onOpenRow}
          render={renderCell}
          actions={renderRowActions}
          currency={currency}
          statusVariant={statusVariant}
        />)}</TableRow>)}</TableBody>
      </Table>
      <RecordPagination total={total} page={page} perPage={perPage} pageCount={pageCount} onChange={onPageChange} />
    </>}
  </div>
}

function RecordSubtabs({ tabs, active, onChange }: { tabs: RecordListSubtab[]; active: string; onChange?: (key: string) => void }) {
  return <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">{tabs.map((tab) => <button
    key={tab.key}
    type="button"
    role="tab"
    aria-selected={active === tab.key}
    onClick={() => onChange?.(tab.key)}
    className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors', active === tab.key ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg')}
  >{tab.label}{typeof tab.count === 'number' ? <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] text-fg-muted">{tab.count}</span> : null}</button>)}</div>
}

function ControlledSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange?: (value: string) => void }) {
  const [edit, setEdit] = React.useState(value)
  React.useEffect(() => setEdit(value), [value])
  React.useEffect(() => {
    if (edit === value || !onChange) return
    const handle = window.setTimeout(() => onChange(edit), 250)
    return () => window.clearTimeout(handle)
  }, [edit, onChange, value])
  return <div className="relative w-full sm:w-72">
    <Search className="pointer-events-none absolute left-2.5 top-2 text-fg-subtle" size={16} />
    <Input type="search" aria-label="Search" placeholder={placeholder} value={edit} onChange={(event) => setEdit(event.target.value)} className="h-8 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden" />
    {edit ? <button type="button" aria-label="Clear search" onClick={() => setEdit('')} className="absolute right-2.5 top-2 text-fg-subtle hover:text-fg"><X size={16} /></button> : null}
  </div>
}

function QuickFilterMenu({ filter }: { filter: RecordListQuickFilter }) {
  const [open, setOpen] = React.useState(false)
  const active = filter.options.find((option) => option.value === filter.value)
  return <Popover open={open} onOpenChange={setOpen} align="start" className="min-w-52 p-1" trigger={<button
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    onClick={() => setOpen((value) => !value)}
    className={cn('inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors', active ? 'border-primary/40 bg-primary-subtle text-primary' : 'border-border bg-surface text-fg hover:bg-surface-hover')}
  ><span className={active ? 'text-primary/80' : 'text-fg-muted'}>{active ? `${filter.label}:` : filter.label}</span>{active ? <span className="truncate font-semibold">{active.label}</span> : null}<ChevronDown className={cn('ml-auto size-3.5 text-fg-subtle transition-transform', open && 'rotate-180')} /></button>}>
    <div className="max-h-72 overflow-auto" role="listbox">
      <MenuChoice label={filter.allLabel ?? 'All'} selected={!filter.value} onClick={() => { filter.onChange(undefined); setOpen(false) }} />
      {filter.options.map((option) => <MenuChoice key={option.value} label={option.label} count={option.count} selected={filter.value === option.value} onClick={() => { filter.onChange(option.value); setOpen(false) }} />)}
    </div>
  </Popover>
}

function SavedViewsMenu({ views, currentId, currentName, canManage, onChange, onSetDefault, onCreate, onManage }: {
  views: SavedListView[]
  currentId: string | null
  currentName: string
  canManage: boolean
  onChange?: (id: string) => void
  onSetDefault?: (id: string | null) => Promise<void> | void
  onCreate?: () => void
  onManage?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const setDefault = async (id: string | null) => {
    setBusy(true)
    try { await onSetDefault?.(id); setOpen(false) } finally { setBusy(false) }
  }
  return <Popover open={open} onOpenChange={setOpen} align="start" className="w-64 p-0" trigger={<Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu"><span className="text-xs text-fg-muted">View</span><span className="max-w-48 truncate font-medium">{currentName}</span><ChevronDown className="size-3.5 text-fg-subtle" /></Button>}>
    <div className="py-1 text-sm" role="menu">
      {views.length ? views.map((view) => <button key={view.id} type="button" role="menuitem" onClick={() => { onChange?.(view.id); setOpen(false) }} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-hover', view.id === currentId && 'text-primary')}><span className="flex-1 truncate">{view.name}</span>{view.scope === 'organization' ? <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Shared</span> : null}{view.isDefault ? <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Default</span> : null}{view.id === currentId ? <Check className="size-3.5" /> : null}</button>) : <div className="px-3 py-2 text-fg-muted">No saved views</div>}
      <div className="mt-1 border-t border-border pt-1">
        <MenuAction disabled={busy || !currentId || !onSetDefault} onClick={() => void setDefault(currentId)}>Set as my default</MenuAction>
        <MenuAction disabled={busy || !onSetDefault} onClick={() => void setDefault(null)}>Use organization default</MenuAction>
        {canManage && onCreate ? <MenuAction emphasis onClick={() => { onCreate(); setOpen(false) }}>New view</MenuAction> : null}
        {canManage && onManage ? <MenuAction emphasis onClick={() => { onManage(); setOpen(false) }}>Manage views</MenuAction> : null}
      </div>
    </div>
  </Popover>
}

function RecordTableHead({ column, sort, onSort }: { column: ResolvedListColumn; sort?: ListViewConfig['sort']; onSort?: (column: string, direction: 'asc' | 'desc') => void }) {
  const sortable = Boolean(column.sortable && onSort)
  const active = sort?.column === column.key
  const direction = active ? sort?.dir ?? 'desc' : 'desc'
  return <TableHead className={cn(column.kind === 'amount' && 'text-right', column.kind === 'actions' && 'w-px px-2 text-center')} style={column.width ? { width: column.width } : undefined}>
    {sortable ? <button type="button" onClick={() => onSort?.(column.key, active && direction === 'desc' ? 'asc' : 'desc')} className={cn('inline-flex items-center gap-1 hover:text-fg', column.kind === 'amount' && 'w-full justify-end')} aria-label={`Sort by ${column.label}`}>{column.label}{active ? direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button> : column.label}
  </TableHead>
}

function RecordCell<R extends Record<string, unknown>>({ row, column, onOpen, render, actions, currency, statusVariant }: {
  row: R
  column: ResolvedListColumn
  onOpen?: (row: R) => void
  render?: RecordListViewProps<R>['renderCell']
  actions?: RecordListViewProps<R>['renderRowActions']
  currency?: string
  statusVariant?: RecordListViewProps<R>['statusVariant']
}) {
  const value = row[column.key]
  const custom = render?.({ row, column, value })
  const content = custom !== undefined ? custom : defaultCell(value, column.kind, row, onOpen, actions, currency, statusVariant)
  return <TableCell className={cn(column.kind === 'amount' && 'text-right tabular-nums', column.kind === 'reference' && 'font-mono text-[13px] font-semibold', column.kind === 'actions' && 'w-px whitespace-nowrap px-2 text-center')}>{content}</TableCell>
}

function defaultCell<R extends Record<string, unknown>>(
  value: unknown,
  kind: ListColumnKind,
  row: R,
  onOpen?: (row: R) => void,
  actions?: (row: R) => React.ReactNode,
  currency?: string,
  statusVariant?: RecordListViewProps<R>['statusVariant'],
): React.ReactNode {
  if (kind === 'actions') return actions?.(row) ?? (onOpen ? <Button size="icon" variant="ghost" onClick={() => onOpen(row)} aria-label="Open record"><Eye className="size-4" /></Button> : null)
  if (value === null || value === undefined || value === '') return <span className="text-fg-subtle">—</span>
  if (kind === 'reference' && onOpen) return <button type="button" onClick={() => onOpen(row)} className="text-primary hover:underline">{display(value)}</button>
  if (kind === 'amount') return typeof value === 'number'
    ? new Intl.NumberFormat(undefined, currency ? { style: 'currency', currency } : { maximumFractionDigits: 2 }).format(value)
    : display(value)
  if (kind === 'status') return <Badge variant={statusVariant?.(String(value), row) ?? 'secondary'}>{humanize(String(value))}</Badge>
  if (kind === 'date') { const text = String(value); const date = value instanceof Date ? value : new Date(text); return Number.isNaN(date.getTime()) ? display(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) ? { timeZone: 'UTC' } : {}) }).format(date) }
  return display(value)
}

function RecordPagination({ total, page, perPage, pageCount, onChange }: { total: number; page: number; perPage: number; pageCount: number; onChange?: (page: number) => void }) {
  const from = total ? (page - 1) * perPage + 1 : 0
  const to = Math.min(total, page * perPage)
  return <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-fg-muted"><span>{total ? <>Showing <strong className="font-medium text-fg">{from.toLocaleString()}</strong>–<strong className="font-medium text-fg">{to.toLocaleString()}</strong> of <strong className="font-medium text-fg">{total.toLocaleString()}</strong></> : 'No results'}</span>{pageCount > 1 ? <div className="flex items-center gap-1"><PageButton disabled={page <= 1} onClick={() => onChange?.(page - 1)}><ChevronLeft className="size-3.5" />Prev</PageButton><span className="px-2 text-fg-subtle">Page {page} of {pageCount}</span><PageButton disabled={page >= pageCount} onClick={() => onChange?.(page + 1)}>Next<ChevronRight className="size-3.5" /></PageButton></div> : null}</div>
}

function MenuChoice({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) { return <button type="button" role="option" aria-selected={selected} onClick={onClick} className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors', selected ? 'bg-primary-subtle font-medium text-primary' : 'text-fg hover:bg-surface-hover')}><Check className={cn('size-3.5 shrink-0', !selected && 'text-transparent')} /><span className="flex-1 truncate">{label}</span>{typeof count === 'number' ? <span className="text-xs tabular-nums text-fg-subtle">{count}</span> : null}</button> }
function MenuAction({ children, disabled, emphasis, onClick }: { children: React.ReactNode; disabled?: boolean; emphasis?: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className={cn('w-full px-3 py-1.5 text-left hover:bg-surface-hover disabled:opacity-40', emphasis ? 'text-primary' : 'text-fg-muted')}>{children}</button> }
function PageButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-fg-subtle">{children}</button> }
function display(value: unknown): string { return Array.isArray(value) ? value.join(', ') : value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value) }
function humanize(value: string): string { return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase()) }
