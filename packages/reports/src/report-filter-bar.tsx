'use client'

import * as React from 'react'
import { ChevronsDown, ChevronsUp, SlidersHorizontal } from 'lucide-react'
import { Popover, Select, cn } from '@appkit/ui'
import { PERIOD_PRESETS, PERIOD_PRESET_GROUP_LABELS, type PeriodPresetGroup } from './period-presets'

export type ReportFilterValue = Record<string, string | boolean | null | undefined>
export type ReportFilterSelect = {
  key: string
  label?: string
  value: string
  options: { value: string; label: string }[]
  ariaLabel?: string
}
export type ReportDimensionOption = { id: string; name: string }
export type ReportSegmentOption = {
  key: string
  name: string
  pluralName: string
  showInReports: boolean
  values: ReportDimensionOption[]
}
export type ReportBuiltinSegmentOption = Omit<ReportSegmentOption, 'values'>
export type ReportSubsidiaryOption = { id: string; label: string }
export type ReportControls = {
  search?: boolean
  period?: boolean
  dateRange?: boolean
  asOf?: boolean
  breakout?: boolean
  breakoutOptions?: ('department' | 'project' | 'location' | 'class' | 'month' | 'quarter')[]
  compare?: boolean
  basis?: boolean
  dimensions?: boolean
  customer?: boolean
  subsidiary?: boolean
  showZero?: boolean
  scale?: boolean
  sections?: boolean
}
export type ReportFilterLabels = Partial<Record<
  | 'period' | 'asOf' | 'from' | 'to' | 'options' | 'showZeros' | 'expandAll' | 'collapseAll'
  | 'breakout' | 'breakoutNone' | 'compare' | 'compareNone' | 'comparePriorPeriod' | 'comparePriorYear'
  | 'subsidiary' | 'customer' | 'allCustomers' | 'department' | 'project' | 'location' | 'class'
  | 'basis' | 'basisAccrual' | 'basisCash' | 'scale' | 'scaleActual' | 'scaleThousands' | 'scaleMillions',
  string
>> & {
  breakoutOption?: (key: string) => string
  allSegment?: (pluralName: string) => string
}

const GROUP_ORDER: PeriodPresetGroup[] = ['fiscal_year', 'fiscal_quarter', 'fiscal_half', 'period', 'calendar', 'rolling', 'days', 'custom']
const DEFAULT_BREAKOUTS = ['department', 'project', 'location', 'class', 'month', 'quarter'] as const
const SELECT = 'h-8 w-auto min-w-0 shrink-0 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none hover:bg-surface-hover'
const DATE = 'h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-sm text-fg'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex shrink-0 items-center gap-1.5"><span className="text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">{label}</span>{children}</label>
}

function stringValue(value: ReportFilterValue, key: string, fallback = ''): string {
  const current = value[key]
  return typeof current === 'string' ? current : fallback
}

/**
 * Complete production report toolbar with an application-owned state boundary.
 * It preserves the single-row, low-chrome source UI and all source controls,
 * while leaving URL routing, localization, and domain option loading to the
 * consuming application through `value`, `onChange`, and typed inputs.
 */
export function ReportFilterBar({
  value,
  onChange,
  controls,
  period = true,
  asOf = false,
  dateRange = false,
  defaultPeriod = 'this_fiscal_year',
  search,
  searchPlaceholder,
  selects = [],
  primaryFilter,
  dimensions,
  customers,
  subsidiaries,
  resolvedDateRange,
  options,
  actions,
  leading,
  labels = {},
}: {
  value: ReportFilterValue
  onChange: (next: ReportFilterValue) => void
  /** Source-shaped capability switches. When omitted, the smaller controlled
   * API (`period`, `asOf`, `dateRange`, `selects`) remains valid. */
  controls?: ReportControls
  period?: boolean
  asOf?: boolean
  dateRange?: boolean
  defaultPeriod?: string
  search?: { value: string; placeholder?: string }
  searchPlaceholder?: string
  selects?: ReportFilterSelect[]
  primaryFilter?: ReportFilterSelect
  dimensions?: {
    departments: ReportDimensionOption[]
    projects: ReportDimensionOption[]
    locations: ReportDimensionOption[]
    classes: ReportDimensionOption[]
    segments?: ReportSegmentOption[]
    builtinSegments?: ReportBuiltinSegmentOption[]
  }
  customers?: ReportDimensionOption[]
  /** First item represents the root/consolidated context. */
  subsidiaries?: ReportSubsidiaryOption[]
  resolvedDateRange?: { from: string; to: string }
  options?: { showZero?: boolean; sections?: boolean; basis?: boolean; scale?: boolean; onExpandAll?: () => void; onCollapseAll?: () => void }
  actions?: React.ReactNode
  leading?: React.ReactNode
  labels?: ReportFilterLabels
}) {
  const [optionsOpen, setOptionsOpen] = React.useState(false)
  const patch = React.useCallback((updates: ReportFilterValue) => onChange({ ...value, ...updates }), [onChange, value])
  const selectedPeriod = stringValue(value, 'period', defaultPeriod)
  const custom = selectedPeriod === 'custom'
  const effective = controls ?? {
    search: Boolean(search),
    period,
    asOf,
    dateRange,
    showZero: options?.showZero,
    sections: options?.sections,
    basis: options?.basis,
    scale: options?.scale,
  }
  const builtinByKey = new Map((dimensions?.builtinSegments ?? []).map((segment) => [segment.key, segment]))
  const showBuiltin = (key: string) => builtinByKey.get(key)?.showInReports !== false
  const allLabel = (fallback: string, key: string) => labels.allSegment?.(builtinByKey.get(key)?.pluralName ?? fallback) ?? `All ${builtinByKey.get(key)?.pluralName ?? fallback}`
  const dimensionSelect = (key: string, label: string, choices: ReportDimensionOption[] | undefined, fallbackPlural: string) => choices?.length ? <Select
    key={key}
    value={stringValue(value, key)}
    onChange={(event) => patch({ [key]: event.target.value || null })}
    className={SELECT}
    aria-label={label}
  ><option value="">{allLabel(fallbackPlural, key === 'dept' ? 'department' : key)}</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</Select> : null

  const showOptions = effective.basis || effective.scale || effective.showZero || effective.sections
  const searchValue = search?.value ?? stringValue(value, 'search')
  const breakout = stringValue(value, 'breakout', 'none')
  const compare = stringValue(value, 'compare', 'none')
  const basis = stringValue(value, 'basis', 'accrual')
  const scale = stringValue(value, 'scale', 'actual')
  const showZero = value.zero === true || value.zero === '1'

  return <div className="app-scroll flex flex-nowrap items-center gap-x-1 overflow-x-auto rounded-xl border border-border bg-bg-subtle px-2 py-1.5">
    {leading ? <div className="flex shrink-0 items-center gap-2">{leading}</div> : null}
    {effective.search ? <input type="search" value={searchValue} onChange={(event) => patch({ search: event.target.value })} placeholder={search?.placeholder ?? searchPlaceholder} className="h-8 w-40 shrink-0 rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none focus:border-primary sm:w-44" /> : null}
    {primaryFilter ? <Field label={primaryFilter.label ?? primaryFilter.ariaLabel ?? ''}><Select value={primaryFilter.value} onChange={(event) => patch({ [primaryFilter.key]: event.target.value })} className={cn(SELECT, 'font-semibold')} aria-label={primaryFilter.ariaLabel ?? primaryFilter.label}>{primaryFilter.options.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select></Field> : null}
    {effective.period !== false && !effective.dateRange ? <Field label={effective.asOf ? labels.asOf ?? 'As of' : labels.period ?? 'Period'}><Select value={selectedPeriod} onChange={(event) => patch({ period: event.target.value, ...(event.target.value === 'custom' ? {} : { from: null, to: null }) })} className={cn(SELECT, 'font-semibold')} aria-label={labels.period ?? 'Period'}>
      {GROUP_ORDER.map((group) => <optgroup key={group} label={PERIOD_PRESET_GROUP_LABELS[group]}>{PERIOD_PRESETS.filter((preset) => preset.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}
    </Select></Field> : null}
    {custom && effective.asOf ? <input type="date" value={stringValue(value, 'to')} onChange={(event) => patch({ from: event.target.value, to: event.target.value })} className={DATE} aria-label={labels.asOf ?? 'As of'} /> : null}
    {custom && !effective.asOf && !effective.dateRange ? <><input type="date" value={stringValue(value, 'from')} onChange={(event) => patch({ from: event.target.value })} className={DATE} aria-label={labels.from ?? 'From'} /><span className="text-fg-subtle">–</span><input type="date" value={stringValue(value, 'to')} onChange={(event) => patch({ to: event.target.value })} className={DATE} aria-label={labels.to ?? 'To'} /></> : null}
    {effective.dateRange ? <><Field label={labels.from ?? 'From'}><input type="date" value={stringValue(value, 'from', resolvedDateRange?.from)} onChange={(event) => patch({ period: 'custom', from: event.target.value, to: stringValue(value, 'to', resolvedDateRange?.to) || null })} className={DATE} aria-label={labels.from ?? 'From'} /></Field><span className="text-fg-subtle">–</span><Field label={labels.to ?? 'To'}><input type="date" value={stringValue(value, 'to', resolvedDateRange?.to)} onChange={(event) => patch({ period: 'custom', from: stringValue(value, 'from', resolvedDateRange?.from) || null, to: event.target.value })} className={DATE} aria-label={labels.to ?? 'To'} /></Field></> : null}
    {effective.breakout ? <Field label={labels.breakout ?? 'Breakout'}><Select value={breakout} onChange={(event) => patch({ breakout: event.target.value })} className={SELECT} aria-label={labels.breakout ?? 'Breakout'}><option value="none">{labels.breakoutNone ?? 'None'}</option>{(effective.breakoutOptions ?? DEFAULT_BREAKOUTS).filter((key) => key === 'month' || key === 'quarter' || showBuiltin(key)).map((key) => <option key={key} value={key}>{labels.breakoutOption?.(key) ?? builtinByKey.get(key)?.name ?? key[0]?.toUpperCase() + key.slice(1)}</option>)}{(dimensions?.segments ?? []).filter((segment) => segment.showInReports).map((segment) => <option key={segment.key} value={`segment:${segment.key}`}>{segment.name}</option>)}</Select></Field> : null}
    {effective.compare ? <Field label={labels.compare ?? 'Compare'}><Select value={compare} onChange={(event) => patch({ compare: event.target.value })} className={SELECT} aria-label={labels.compare ?? 'Compare'}><option value="none">{labels.compareNone ?? 'None'}</option><option value="prior_period">{labels.comparePriorPeriod ?? 'Prior period'}</option><option value="prior_year">{labels.comparePriorYear ?? 'Prior year'}</option></Select></Field> : null}
    {effective.subsidiary && subsidiaries && subsidiaries.length > 1 ? <Field label={labels.subsidiary ?? 'Subsidiary'}><Select value={stringValue(value, 'sub')} onChange={(event) => patch({ sub: event.target.value || null })} className={SELECT} aria-label={labels.subsidiary ?? 'Subsidiary'}>{subsidiaries.map((subsidiary, index) => <option key={subsidiary.id} value={index === 0 ? '' : subsidiary.id}>{subsidiary.label}</option>)}</Select></Field> : null}
    {effective.customer && customers?.length ? <Select value={stringValue(value, 'customer')} onChange={(event) => patch({ customer: event.target.value || null })} className={SELECT} aria-label={labels.customer ?? 'Customer'}><option value="">{labels.allCustomers ?? 'All customers'}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select> : null}
    {effective.dimensions && dimensions ? <>{showBuiltin('department') ? dimensionSelect('dept', builtinByKey.get('department')?.name ?? labels.department ?? 'Department', dimensions.departments, 'departments') : null}{showBuiltin('project') ? dimensionSelect('project', builtinByKey.get('project')?.name ?? labels.project ?? 'Project', dimensions.projects, 'projects') : null}{showBuiltin('location') ? dimensionSelect('location', builtinByKey.get('location')?.name ?? labels.location ?? 'Location', dimensions.locations, 'locations') : null}{showBuiltin('class') ? dimensionSelect('class', builtinByKey.get('class')?.name ?? labels.class ?? 'Class', dimensions.classes, 'classes') : null}{(dimensions.segments ?? []).filter((segment) => segment.showInReports).map((segment) => dimensionSelect(`seg_${segment.key}`, segment.name, segment.values, segment.pluralName))}</> : null}
    {selects.map((select) => select.label ? <Field key={select.key} label={select.label}><Select value={select.value} onChange={(event) => patch({ [select.key]: event.target.value })} className={SELECT} aria-label={select.ariaLabel ?? select.label}>{select.options.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select></Field> : <Select key={select.key} value={select.value} onChange={(event) => patch({ [select.key]: event.target.value })} className={SELECT} aria-label={select.ariaLabel}>{select.options.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</Select>)}
    {showOptions ? <Popover open={optionsOpen} onOpenChange={setOptionsOpen} align="start" trigger={<button type="button" onClick={() => setOptionsOpen((current) => !current)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-surface-hover"><SlidersHorizontal size={14} />{labels.options ?? 'Options'}</button>}>
      <div className="w-56 space-y-3 p-3">
        {effective.sections ? <div className="space-y-1"><button type="button" onClick={() => { options?.onExpandAll?.(); setOptionsOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-surface-hover"><ChevronsDown size={15} />{labels.expandAll ?? 'Expand all'}</button><button type="button" onClick={() => { options?.onCollapseAll?.(); setOptionsOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-surface-hover"><ChevronsUp size={15} />{labels.collapseAll ?? 'Collapse all'}</button></div> : null}
        {effective.basis ? <label className="flex items-center justify-between gap-2 text-sm"><span className="text-fg-muted">{labels.basis ?? 'Basis'}</span><Select value={basis} onChange={(event) => patch({ basis: event.target.value })} className="h-8 w-32" aria-label={labels.basis ?? 'Basis'}><option value="accrual">{labels.basisAccrual ?? 'Accrual'}</option><option value="cash">{labels.basisCash ?? 'Cash'}</option></Select></label> : null}
        {effective.scale ? <label className="flex items-center justify-between gap-2 text-sm"><span className="text-fg-muted">{labels.scale ?? 'Scale'}</span><Select value={scale} onChange={(event) => patch({ scale: event.target.value })} className="h-8 w-32" aria-label={labels.scale ?? 'Scale'}><option value="actual">{labels.scaleActual ?? 'Actual'}</option><option value="thousands">{labels.scaleThousands ?? 'Thousands'}</option><option value="millions">{labels.scaleMillions ?? 'Millions'}</option></Select></label> : null}
        {effective.showZero ? <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-fg"><span>{labels.showZeros ?? 'Show zeros'}</span><input type="checkbox" checked={showZero} onChange={() => patch({ zero: showZero ? null : '1' })} className="size-4 accent-primary" /></label> : null}
      </div>
    </Popover> : null}
    {actions ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div> : null}
  </div>
}
