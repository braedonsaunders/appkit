'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Select } from '@appkit/ui'
import { operatorsForKind, type ReportFilterOperator, type ReportRule, type ReportRuleGroup } from './filters'
import { PERIOD_PRESETS, PERIOD_PRESET_GROUP_LABELS, type PeriodPresetGroup } from './period-presets'
import type { ReportEntity } from './entities'

const GROUP_ORDER: PeriodPresetGroup[] = ['fiscal_year', 'fiscal_quarter', 'fiscal_half', 'period', 'calendar', 'rolling', 'days']
type Node = ReportRule | ReportRuleGroup
function isGroup(node: Node): node is ReportRuleGroup { return 'rules' in node }

/** Recursive nested and/or filter editor matching the tree consumed by the SQL compiler. */
export function ReportFilterTree({ entity, group, onChange, depth = 0 }: { entity: ReportEntity; group: ReportRuleGroup; onChange: (group: ReportRuleGroup) => void; depth?: number }) {
  const setRule = (index: number, rule: Node) => { const rules = [...group.rules]; rules[index] = rule; onChange({ ...group, rules }) }
  const remove = (index: number) => onChange({ ...group, rules: group.rules.filter((_, current) => current !== index) })
  const addRule = () => {
    const column = entity.columns[0]
    if (column) onChange({ ...group, rules: [...group.rules, { field: column.key, operator: operatorsForKind(column.kind)[0]?.key ?? 'eq', value: '' }] })
  }
  return <div className={depth === 0 ? 'space-y-2 rounded-lg border border-border p-3' : 'space-y-2 rounded-lg border border-border bg-bg-subtle p-3'}>
    <div className="flex items-center gap-2"><span className="text-xs text-fg-muted">Match</span><Select className="h-8 w-48" value={group.combinator} onChange={(event) => onChange({ ...group, combinator: event.target.value as 'and' | 'or' })}><option value="and">all conditions</option><option value="or">any condition</option></Select></div>
    <div className="space-y-2">{group.rules.map((rule, index) => isGroup(rule) ? <ReportFilterTree key={index} entity={entity} group={rule} depth={depth + 1} onChange={(next) => setRule(index, next)} /> : <RuleRow key={index} entity={entity} rule={rule} onChange={(next) => setRule(index, next)} onRemove={() => remove(index)} />)}{group.rules.length === 0 ? <p className="text-xs text-fg-subtle">No conditions.</p> : null}</div>
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={addRule}><Plus size={14} />Add condition</Button>{depth < 3 ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...group, rules: [...group.rules, { combinator: 'and', rules: [] }] })}><Plus size={14} />Add group</Button> : null}</div>
  </div>
}

function RuleRow({ entity, rule, onChange, onRemove }: { entity: ReportEntity; rule: ReportRule; onChange: (rule: ReportRule) => void; onRemove: () => void }) {
  const column = entity.columns.find((item) => item.key === rule.field) ?? entity.columns[0]
  const operators = column ? operatorsForKind(column.kind) : []
  const operator = operators.find((item) => item.key === rule.operator) ?? operators[0]
  const options = column?.enumOptions ?? []
  const changeField = (field: string) => {
    const nextColumn = entity.columns.find((item) => item.key === field)
    const available = nextColumn ? operatorsForKind(nextColumn.kind) : []
    const nextOperator = available.some((item) => item.key === rule.operator) ? rule.operator : available[0]?.key ?? 'eq'
    onChange({ field, operator: nextOperator, value: '' })
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Select className="h-8 min-w-40" value={rule.field} onChange={(event) => changeField(event.target.value)}>{entity.columns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select>
    <Select className="h-8 min-w-36" value={rule.operator} onChange={(event) => onChange({ ...rule, operator: event.target.value as ReportFilterOperator })}>{operators.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select>
    {rule.operator === 'period_preset' ? <Select className="h-8 w-52" value={typeof rule.value === 'string' ? rule.value : 'this_fiscal_year'} onChange={(event) => onChange({ ...rule, value: event.target.value })}>{GROUP_ORDER.map((group) => <optgroup key={group} label={PERIOD_PRESET_GROUP_LABELS[group]}>{PERIOD_PRESETS.filter((preset) => preset.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}</Select>
      : operator?.needsValue === 'one' && options.length ? <Select className="h-8 w-44" value={typeof rule.value === 'string' ? rule.value : ''} onChange={(event) => onChange({ ...rule, value: event.target.value })}><option value="">Choose a value</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
      : operator?.needsValue === 'one' ? <Input className="h-8 w-40" type={column?.kind === 'date' ? 'date' : column?.kind === 'number' ? 'number' : 'text'} value={typeof rule.value === 'string' || typeof rule.value === 'number' ? String(rule.value) : ''} placeholder="Value" onChange={(event) => onChange({ ...rule, value: event.target.value })} />
      : operator?.needsValue === 'list' && options.length ? <div className="flex max-w-md flex-wrap gap-1">{options.map((option) => { const selected = Array.isArray(rule.value) && rule.value.map(String).includes(option.value); return <button key={option.value} type="button" onClick={() => { const current = Array.isArray(rule.value) ? rule.value.map(String) : []; onChange({ ...rule, value: selected ? current.filter((value) => value !== option.value) : [...current, option.value] }) }} className={selected ? 'rounded-full border border-primary bg-primary-subtle px-2 py-0.5 text-xs text-primary' : 'rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted hover:border-border-strong'}>{option.label}</button> })}</div>
      : operator?.needsValue === 'list' ? <Input className="h-8 w-52" value={Array.isArray(rule.value) ? rule.value.join(', ') : ''} placeholder="Comma-separated values" onChange={(event) => onChange({ ...rule, value: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
      : <span className="text-xs text-fg-subtle">No value</span>}
    <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove condition"><Trash2 size={14} /></Button>
  </div>
}
