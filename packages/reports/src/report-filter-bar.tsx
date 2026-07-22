'use client'

import * as React from 'react'
import { ChevronsDown, ChevronsUp, SlidersHorizontal } from 'lucide-react'
import { Popover, Select, cn } from '@appkit/ui'
import { PERIOD_PRESETS, PERIOD_PRESET_GROUP_LABELS, type PeriodPresetGroup } from './period-presets'

export type ReportFilterValue = Record<string, string | boolean | null | undefined>
export type ReportFilterSelect = { key: string; label?: string; value: string; options: { value: string; label: string }[]; ariaLabel?: string }

const GROUP_ORDER: PeriodPresetGroup[] = ['fiscal_year', 'fiscal_quarter', 'fiscal_half', 'period', 'calendar', 'rolling', 'days', 'custom']
const SELECT = 'h-8 w-auto min-w-0 shrink-0 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none hover:bg-surface-hover'
const DATE = 'h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-sm text-fg'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex shrink-0 items-center gap-1.5"><span className="text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">{label}</span>{children}</label>
}

/** The production report toolbar: one compact non-wrapping row with actions pinned right. */
export function ReportFilterBar({
  value,
  onChange,
  period = true,
  asOf = false,
  dateRange = false,
  search,
  selects = [],
  options,
  actions,
  leading,
  labels = {},
}: {
  value: ReportFilterValue
  onChange: (next: ReportFilterValue) => void
  period?: boolean
  asOf?: boolean
  dateRange?: boolean
  search?: { value: string; placeholder?: string }
  selects?: ReportFilterSelect[]
  options?: { showZero?: boolean; sections?: boolean; onExpandAll?: () => void; onCollapseAll?: () => void }
  actions?: React.ReactNode
  leading?: React.ReactNode
  labels?: Partial<Record<'period' | 'asOf' | 'from' | 'to' | 'options' | 'showZeros' | 'expandAll' | 'collapseAll', string>>
}) {
  const [optionsOpen, setOptionsOpen] = React.useState(false)
  const patch = (updates: ReportFilterValue) => onChange({ ...value, ...updates })
  const selectedPeriod = String(value.period ?? 'this_fiscal_year')
  const custom = selectedPeriod === 'custom'
  return <div className="flex flex-nowrap items-center gap-x-1 overflow-x-auto rounded-xl border border-border bg-bg-subtle px-2 py-1.5">
    {leading ? <div className="flex shrink-0 items-center gap-2">{leading}</div> : null}
    {search ? <input type="search" value={search.value} onChange={(event) => patch({ search: event.target.value })} placeholder={search.placeholder} className="h-8 w-44 shrink-0 rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none focus:border-primary" /> : null}
    {period && !dateRange ? <Field label={asOf ? labels.asOf ?? 'As of' : labels.period ?? 'Period'}><Select value={selectedPeriod} onChange={(event) => patch({ period: event.target.value, ...(event.target.value === 'custom' ? {} : { from: null, to: null }) })} className={cn(SELECT, 'font-semibold')}>
      {GROUP_ORDER.map((group) => <optgroup key={group} label={PERIOD_PRESET_GROUP_LABELS[group]}>{PERIOD_PRESETS.filter((preset) => preset.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}
    </Select></Field> : null}
    {custom && asOf ? <input type="date" value={String(value.to ?? '')} onChange={(event) => patch({ from: event.target.value, to: event.target.value })} className={DATE} aria-label={labels.asOf ?? 'As of'} /> : null}
    {(dateRange || (custom && !asOf)) ? <><Field label={labels.from ?? 'From'}><input type="date" value={String(value.from ?? '')} onChange={(event) => patch({ period: 'custom', from: event.target.value })} className={DATE} /></Field><span className="text-fg-subtle">–</span><Field label={labels.to ?? 'To'}><input type="date" value={String(value.to ?? '')} onChange={(event) => patch({ period: 'custom', to: event.target.value })} className={DATE} /></Field></> : null}
    {selects.map((select) => select.label ? <Field key={select.key} label={select.label}><Select value={select.value} onChange={(event) => patch({ [select.key]: event.target.value })} className={SELECT} aria-label={select.ariaLabel ?? select.label}>{select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field> : <Select key={select.key} value={select.value} onChange={(event) => patch({ [select.key]: event.target.value })} className={SELECT} aria-label={select.ariaLabel}>{select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>)}
    {options && (options.showZero || options.sections) ? <Popover open={optionsOpen} onOpenChange={setOptionsOpen} align="start" trigger={<button type="button" onClick={() => setOptionsOpen((value) => !value)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-surface-hover"><SlidersHorizontal size={14} />{labels.options ?? 'Options'}</button>}>
      <div className="w-56 space-y-2 p-3">
        {options.sections ? <><button type="button" onClick={() => { options.onExpandAll?.(); setOptionsOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-surface-hover"><ChevronsDown size={15} />{labels.expandAll ?? 'Expand all'}</button><button type="button" onClick={() => { options.onCollapseAll?.(); setOptionsOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-surface-hover"><ChevronsUp size={15} />{labels.collapseAll ?? 'Collapse all'}</button></> : null}
        {options.showZero ? <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-fg"><span>{labels.showZeros ?? 'Show zeros'}</span><input type="checkbox" checked={value.zero === true} onChange={() => patch({ zero: value.zero === true ? null : true })} className="size-4 accent-primary" /></label> : null}
      </div>
    </Popover> : null}
    {actions ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div> : null}
  </div>
}
