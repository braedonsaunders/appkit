'use client'

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button, Input, SearchSelect, type SelectOption } from '@braedonsaunders/appkit-ui'
import { operatorsForKind, type ReportFilterOperator, type ReportRule, type ReportRuleGroup } from './filters'
import { PERIOD_PRESETS, PERIOD_PRESET_GROUP_LABELS, type PeriodPresetGroup } from './period-presets'
import { reportColumnOptions, visibleReportColumns, type ReportEntity } from './entities'

type Node = ReportRule | ReportRuleGroup
function isGroup(node: Node): node is ReportRuleGroup { return 'rules' in node }

export function defaultOperatorForColumn(
  column: ReportEntity['columns'][number],
): ReportFilterOperator {
  if (reportColumnOptions(column).length) return 'in'
  return operatorsForKind(column.kind)[0]?.key ?? 'eq'
}

/** Recursive nested and/or filter editor matching the tree consumed by the SQL compiler. */
export function ReportFilterTree({ entity, group, onChange, depth = 0 }: { entity: ReportEntity; group: ReportRuleGroup; onChange: (group: ReportRuleGroup) => void; depth?: number }) {
  const columns = visibleReportColumns(entity)
  const setRule = (index: number, rule: Node) => { const rules = [...group.rules]; rules[index] = rule; onChange({ ...group, rules }) }
  const remove = (index: number) => onChange({ ...group, rules: group.rules.filter((_, current) => current !== index) })
  const addRule = () => {
    const column = columns[0]
    if (column) {
      const op = defaultOperatorForColumn(column)
      onChange({ ...group, rules: [...group.rules, { field: column.key, op, value: op === 'in' ? [] : '' }] })
    }
  }
  return <div className={depth === 0 ? 'space-y-2 rounded-lg border border-border p-3' : 'space-y-2 rounded-lg border border-border bg-bg-subtle p-3'}>
    <div className="flex items-center gap-2"><span className="text-xs text-fg-muted">Match</span><SearchSelect className="w-48" triggerClassName="h-8" value={group.combinator} onChange={(combinator) => onChange({ ...group, combinator: combinator as 'and' | 'or' })} options={[{ value: 'and', label: 'all conditions' }, { value: 'or', label: 'any condition' }]} ariaLabel="Match" /></div>
    <div className="space-y-2">{group.rules.map((rule, index) => isGroup(rule) ? <ReportFilterTree key={index} entity={entity} group={rule} depth={depth + 1} onChange={(next) => setRule(index, next)} /> : <RuleRow key={index} entity={entity} rule={rule} onChange={(next) => setRule(index, next)} onRemove={() => remove(index)} />)}{group.rules.length === 0 ? <p className="text-xs text-fg-subtle">No conditions.</p> : null}</div>
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={addRule}><Plus size={14} />Add condition</Button>{depth < 3 ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...group, rules: [...group.rules, { combinator: 'and', rules: [] }] })}><Plus size={14} />Add group</Button> : null}</div>
  </div>
}

function RuleRow({ entity, rule, onChange, onRemove }: { entity: ReportEntity; rule: ReportRule; onChange: (rule: ReportRule) => void; onRemove: () => void }) {
  const columns = visibleReportColumns(entity)
  const column = columns.find((item) => item.key === rule.field) ?? columns[0]
  const operators = column ? operatorsForKind(column.kind) : []
  const operator = operators.find((item) => item.key === rule.op) ?? operators[0]
  const options = column ? reportColumnOptions(column) : []
  const changeField = (field: string) => {
    const nextColumn = columns.find((item) => item.key === field)
    if (!nextColumn) return
    const nextOperator = defaultOperatorForColumn(nextColumn)
    onChange({ field, op: nextOperator, value: nextOperator === 'in' ? [] : '' })
  }
  return <div className="flex flex-wrap items-center gap-2">
    <SearchSelect className="min-w-40 flex-1" triggerClassName="h-8" value={rule.field} onChange={changeField} options={columns.map((item) => ({ value: item.key, label: item.label }))} ariaLabel="Filter field" />
    <SearchSelect className="w-44" triggerClassName="h-8" value={rule.op} onChange={(next) => {
      const op = next as ReportFilterOperator
      const needsList = operators.find((item) => item.key === op)?.needsValue === 'list'
      onChange({ ...rule, op, value: needsList ? (Array.isArray(rule.value) ? rule.value : []) : (Array.isArray(rule.value) ? '' : rule.value) })
    }} options={operators.map((item) => ({ value: item.key, label: item.label }))} ariaLabel="Filter operator" />
    {rule.op === 'period_preset' ? <SearchSelect className="w-56" triggerClassName="h-8" value={typeof rule.value === 'string' ? rule.value : 'this_fiscal_year'} onChange={(value) => onChange({ ...rule, value })} options={PERIOD_PRESETS.map((preset) => ({ value: preset.id, label: preset.label, group: PERIOD_PRESET_GROUP_LABELS[preset.group as PeriodPresetGroup] }))} ariaLabel="Period" />
      : operator?.needsValue === 'one' && options.length ? <SearchSelect className="w-52" triggerClassName="h-8" value={typeof rule.value === 'string' ? rule.value : ''} onChange={(value) => onChange({ ...rule, value })} options={options} clearable placeholder="Choose a value" ariaLabel="Filter value" />
      : operator?.needsValue === 'one' ? <Input className="h-8 w-40" type={column?.kind === 'date' ? 'date' : column?.kind === 'number' || column?.kind === 'money' ? 'number' : 'text'} value={typeof rule.value === 'string' || typeof rule.value === 'number' ? String(rule.value) : ''} placeholder="Value" onChange={(event) => onChange({ ...rule, value: event.target.value })} />
      : operator?.needsValue === 'list' && options.length ? <MultiSelect value={Array.isArray(rule.value) ? rule.value.map(String) : []} options={options} onChange={(next) => onChange({ ...rule, value: next })} />
      : operator?.needsValue === 'list' ? <TokenInput value={Array.isArray(rule.value) ? rule.value.map(String) : []} onChange={(next) => onChange({ ...rule, value: next })} />
      : <span className="text-xs text-fg-subtle">No value</span>}
    <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove condition"><Trash2 size={14} /></Button>
  </div>
}

function Chip({ label, onRemove, tone = 'primary' }: { label: string; onRemove: () => void; tone?: 'primary' | 'neutral' }) {
  return <button type="button" onClick={onRemove} className={tone === 'primary'
    ? 'inline-flex items-center gap-1 rounded-full border border-primary bg-primary-subtle px-2 py-0.5 text-xs text-primary'
    : 'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted hover:border-border-strong'}>
    <span className="max-w-52 truncate">{label}</span><X size={12} className="shrink-0" />
  </button>
}

/** Searchable add-a-value control plus removable chips for the selected set. */
function MultiSelect({ value, options, onChange }: { value: string[]; options: { value: string; label: string }[]; onChange: (value: string[]) => void }) {
  const selected = new Set(value)
  const remaining: SelectOption[] = options.filter((option) => !selected.has(option.value))
  const labelOf = (candidate: string) => options.find((option) => option.value === candidate)?.label ?? candidate
  return <div className="flex max-w-md flex-col gap-1.5">
    <SearchSelect className="w-52" triggerClassName="h-8" value="" onChange={(next) => { if (next) onChange([...value, next]) }} options={remaining} placeholder="Add value…" ariaLabel="Add filter value" />
    {value.length ? <div className="flex flex-wrap gap-1">{value.map((item) => <Chip key={item} label={labelOf(item)} onRemove={() => onChange(value.filter((current) => current !== item))} />)}</div> : null}
  </div>
}

/** Free-text multi-value entry: type a value, press Enter to add it as a chip. */
function TokenInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const commit = () => { const trimmed = draft.trim(); if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]); setDraft('') }
  return <div className="flex max-w-md flex-col gap-1.5">
    <Input
      className="h-8 w-52"
      value={draft}
      placeholder="Type a value, press Enter"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
      }}
    />
    {value.length ? <div className="flex flex-wrap gap-1">{value.map((item) => <Chip key={item} label={item} tone="neutral" onRemove={() => onChange(value.filter((current) => current !== item))} />)}</div> : null}
  </div>
}
