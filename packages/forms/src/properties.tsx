'use client'

import * as React from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  CHOICE_FIELD_TYPES,
  FIELD_TYPES,
  entityKindForPicker,
  storesResponseValue,
  type DataBinding,
  type DefaultValueExpression,
  type FormField,
  type FormSchemaV1,
  type FormSection,
  type TableColumn,
  type TableConfig,
} from '@appkit/forms-core'
import { type AppLocale } from '@appkit/i18n'
import { Button, Checkbox, Input, Label, Select, Textarea, cn } from '@appkit/ui'
import { defaultBox } from './canvas-editor'
import { FormulaBuilder } from './formula-builder'
import { LogicBuilder } from './logic-builder'
import { readText, writeText } from './text'

export type FormDataSourceColumn = { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' }
export type FormDataSource = { id: string; key: string; name: string; kind?: string; columns: FormDataSourceColumn[] }

export type FieldPropertiesProps = {
  sectionId: string
  field: FormField
  schema: FormSchemaV1
  locale: AppLocale
  defaultLocale?: AppLocale
  dataSources?: readonly FormDataSource[]
  dataSourcesLoading?: boolean
  onRefreshDataSources?: () => void | Promise<void>
  readOnly?: boolean
  onChange: (patch: Partial<FormField>) => void
}

type FieldTab = 'basic' | 'validation' | 'logic' | 'default' | 'formula'

export function FieldProperties({ sectionId, field, schema, locale, defaultLocale = locale, dataSources = [], dataSourcesLoading = false, onRefreshDataSources, readOnly = false, onChange }: FieldPropertiesProps) {
  const [tab, setTab] = React.useState<FieldTab>('basic')
  const ownerSection = schema.sections.find((section) => section.id === sectionId)
  const otherFields = schema.sections.flatMap((section) => {
    if (section.repeating && section.id !== sectionId) return []
    if (!ownerSection?.repeating && section.repeating) return []
    return section.fields
  }).filter((candidate) => candidate.id !== field.id && storesResponseValue(candidate)).map((candidate) => ({ id: candidate.id, label: readText(candidate.label, locale, candidate.id) }))
  const repeatingSections = schema.sections.filter((section) => section.repeating).map((section) => ({ id: section.id, label: readText(section.title, locale, section.id), fields: section.fields.filter((candidate) => storesResponseValue(candidate) || (!ownerSection?.repeating && candidate.type === 'formula' && candidate.formula !== undefined)).map((candidate) => ({ id: candidate.id, label: readText(candidate.label, locale, candidate.id) })) }))
  const pickerFields = schema.sections.filter((section) => !section.repeating).flatMap((section) => section.fields).map((candidate) => ({ candidate, kind: entityKindForPicker(candidate.type) })).filter((entry): entry is { candidate: FormField; kind: NonNullable<ReturnType<typeof entityKindForPicker>> } => entry.kind !== null).map(({ candidate, kind }) => ({ id: candidate.id, label: readText(candidate.label, locale, candidate.id), kind }))
  const storesValue = storesResponseValue(field)
  const tabs = ([
    ['basic', 'Basic', true],
    ['validation', 'Validation', storesValue],
    ['logic', 'Logic', true],
    ['default', 'Default', storesValue],
    ['formula', 'Formula', field.type === 'formula'],
  ] as const).filter((entry) => entry[2])

  return <div className="space-y-3 text-sm">
    <h3 className="text-sm font-semibold text-fg">{FIELD_TYPES[field.type]?.label ?? field.type}</h3>
    <div className="app-scroll flex overflow-x-auto border-b border-border">
      {tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={cn('-mb-px shrink-0 border-b-2 px-2 py-1 text-xs', tab === value ? 'border-primary font-semibold text-primary' : 'border-transparent text-fg-muted hover:text-fg')}>{label}</button>)}
    </div>
    {tab === 'basic' ? <FieldBasic field={field} schema={schema} sectionId={sectionId} locale={locale} defaultLocale={defaultLocale} dataSources={dataSources} dataSourcesLoading={dataSourcesLoading} onRefreshDataSources={onRefreshDataSources} readOnly={readOnly} onChange={onChange} /> : null}
    {tab === 'validation' && storesValue ? <FieldValidation field={field} readOnly={readOnly} onChange={onChange} /> : null}
    {tab === 'logic' ? <div className="space-y-1"><Label className="text-xs">Show this field when</Label><p className="text-[10px] text-fg-subtle">Leave empty to always show the field.</p><LogicBuilder rule={field.showIf} availableFields={otherFields} onChange={(showIf) => onChange({ showIf })} disabled={readOnly} /></div> : null}
    {tab === 'default' && storesValue ? <FieldDefault field={field} readOnly={readOnly} onChange={onChange} /> : null}
    {tab === 'formula' && field.type === 'formula' ? <div className="space-y-1"><Label className="text-xs">Formula</Label><p className="text-[10px] text-fg-subtle">Build a typed expression from fields, repeating sections, and selected entity attributes.</p><FormulaBuilder value={field.formula} allFields={otherFields} repeatingSections={repeatingSections} pickerFields={pickerFields} onChange={(formula) => onChange({ formula })} /></div> : null}
  </div>
}

function FieldBasic({ field, schema, sectionId, locale, dataSources, dataSourcesLoading, onRefreshDataSources, readOnly = false, onChange }: FieldPropertiesProps & { dataSources: readonly FormDataSource[] }) {
  const ownerSection = schema.sections.find((section) => section.id === sectionId)
  const otherFields = schema.sections.flatMap((section) => ownerSection?.repeating ? section.id === sectionId ? section.fields : [] : section.repeating ? [] : section.fields).filter((candidate) => candidate.id !== field.id && storesResponseValue(candidate)).map((candidate) => ({ id: candidate.id, label: readText(candidate.label, locale, candidate.id) }))
  return <div className="space-y-3">
    <Labeled label="Field key"><Input value={field.id} disabled className="font-mono text-xs" /></Labeled>
    <Labeled label={`Label · ${locale.toUpperCase()}`}><Input value={readText(field.label, locale)} disabled={readOnly} onChange={(event) => onChange({ label: writeText(field.label, event.target.value, locale) })} /></Labeled>
    <Labeled label="Help text"><Textarea rows={2} value={readText(field.helpText, locale)} disabled={readOnly} onChange={(event) => onChange({ helpText: writeText(field.helpText, event.target.value, locale) })} /></Labeled>
    {storesResponseValue(field) ? <label className="flex items-center gap-2"><Checkbox checked={field.required ?? false} disabled={readOnly} onChange={(event) => onChange({ required: event.currentTarget.checked })} />Required</label> : null}
    <Labeled label="Width"><Select value={String(field.colSpan ?? '')} disabled={readOnly} onChange={(event) => onChange({ colSpan: event.target.value ? Number(event.target.value) : undefined })}><option value="">Full width</option>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} column{value === 1 ? '' : 's'}</option>)}</Select><p className="text-[10px] text-fg-subtle">Width is clamped to the section column count.</p></Labeled>
    {CHOICE_FIELD_TYPES.has(field.type) ? <ChoiceOptions field={field} locale={locale} readOnly={readOnly} onChange={onChange} /> : null}
    {field.type === 'table' ? <TableEditor field={field} readOnly={readOnly} onChange={onChange} /> : null}
    {field.type === 'slider' ? <SliderEditor field={field} readOnly={readOnly} onChange={onChange} /> : null}
    {field.type === 'matrix' ? <MatrixEditor field={field} readOnly={readOnly} onChange={onChange} /> : null}
    {field.type === 'lookup' || field.type === 'data_table' || field.type === 'metric' ? <DataBindingEditor field={field} sources={dataSources} loading={Boolean(dataSourcesLoading)} otherFields={otherFields} autofillFields={otherFields} onRefresh={onRefreshDataSources} readOnly={readOnly} onChange={onChange} /> : null}
  </div>
}

function FieldValidation({ field, readOnly, onChange }: { field: FormField; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const value = field.validation ?? {}
  const set = (patch: Partial<typeof value>) => {
    const next = { ...value, ...patch }
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined || next[key] === '') delete (next as Record<string, unknown>)[key]
    onChange({ validation: Object.keys(next).length ? next : undefined })
  }
  const numeric = ['number', 'currency', 'percentage', 'rating', 'slider'].includes(field.type)
  const text = ['text', 'long_text', 'email', 'phone', 'url'].includes(field.type)
  return <div className="space-y-3">
    <label className="flex items-center gap-2"><Checkbox checked={value.required ?? field.required ?? false} disabled={readOnly} onChange={(event) => set({ required: event.currentTarget.checked })} />Required</label>
    {numeric ? <div className="grid grid-cols-2 gap-2"><NumberSetting label="Minimum" value={value.min} disabled={readOnly} onChange={(min) => set({ min })} /><NumberSetting label="Maximum" value={value.max} disabled={readOnly} onChange={(max) => set({ max })} /></div> : null}
    {text ? <div className="grid grid-cols-2 gap-2"><NumberSetting label="Minimum length" value={value.minLength} disabled={readOnly} onChange={(minLength) => set({ minLength })} /><NumberSetting label="Maximum length" value={value.maxLength} disabled={readOnly} onChange={(maxLength) => set({ maxLength })} /></div> : null}
    {text ? <Labeled label="Pattern"><Input value={value.pattern ?? ''} disabled={readOnly} onChange={(event) => set({ pattern: event.target.value || undefined })} placeholder="Regular expression" /><p className="text-[11px] text-fg-subtle">The pattern is validated before the schema can be published.</p></Labeled> : null}
    <Labeled label="Validation message"><Input value={value.message ?? ''} disabled={readOnly} onChange={(event) => set({ message: event.target.value || undefined })} placeholder="Use the default message" /></Labeled>
  </div>
}

function FieldDefault({ field, readOnly, onChange }: { field: FormField; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const value = field.defaultValue as DefaultValueExpression | undefined
  function setKind(kind: string) {
    const next: DefaultValueExpression | undefined = kind === 'literal' ? { kind: 'literal', value: '' } : kind === 'today' ? { kind: 'today' } : kind === 'now' ? { kind: 'now' } : kind === 'current_user_person_id' ? { kind: 'current_user_person_id' } : kind === 'current_user_name' ? { kind: 'current_user_name' } : undefined
    onChange({ defaultValue: next })
  }
  return <div className="space-y-3"><p className="text-xs text-fg-muted">Defaults apply once when a new response begins.</p><Select value={value?.kind ?? ''} disabled={readOnly} onChange={(event) => setKind(event.target.value)}><option value="">No default</option><option value="literal">Literal value</option><option value="today">Today&apos;s date</option><option value="now">Right now</option><option value="current_user_person_id">Current user&apos;s person ID</option><option value="current_user_name">Current user&apos;s name</option></Select>{value?.kind === 'literal' ? <Input value={String(value.value ?? '')} disabled={readOnly} onChange={(event) => onChange({ defaultValue: { kind: 'literal', value: event.target.value } })} /> : null}</div>
}

function ChoiceOptions({ field, locale, readOnly, onChange }: { field: FormField; locale: AppLocale; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const options = field.validation?.options ?? []
  const update = (next: typeof options) => onChange({ validation: { ...field.validation, options: next } })
  return <ConfigBox title="Options"><div className="space-y-1">{options.map((option, index) => <div key={`${option.value}-${index}`} className="flex gap-1"><Input className="font-mono text-xs" value={option.value} disabled={readOnly} onChange={(event) => { const next = [...options]; next[index] = { ...option, value: event.target.value }; update(next) }} /><Input value={readText(option.label, locale)} disabled={readOnly} onChange={(event) => { const next = [...options]; next[index] = { ...option, label: writeText(option.label, event.target.value, locale) }; update(next) }} /><DeleteButton disabled={readOnly} onClick={() => update(options.filter((_, candidate) => candidate !== index))} /></div>)}</div><Button size="sm" variant="outline" disabled={readOnly} onClick={() => update([...options, { value: `opt_${options.length + 1}`, label: writeText(undefined, 'New option', locale) }])}><Plus size={12} />Add option</Button><label className="flex items-center gap-2 text-xs"><Checkbox checked={field.validation?.allowOther ?? false} disabled={readOnly} onChange={(event) => onChange({ validation: { ...field.validation, allowOther: event.currentTarget.checked } })} />Allow another value</label></ConfigBox>
}

function SliderEditor({ field, readOnly, onChange }: { field: FormField; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const config = field.config ?? {}; const set = (patch: Record<string, unknown>) => onChange({ config: { ...config, ...patch } })
  return <ConfigBox title="Slider"><div className="grid grid-cols-3 gap-2"><NumberSetting label="Minimum" value={Number(config.min ?? 0)} disabled={readOnly} onChange={(min) => set({ min })} /><NumberSetting label="Maximum" value={Number(config.max ?? 10)} disabled={readOnly} onChange={(max) => set({ max })} /><NumberSetting label="Step" value={Number(config.step ?? 1)} disabled={readOnly} onChange={(step) => set({ step })} /></div><Labeled label="Unit"><Input value={String(config.unit ?? '')} disabled={readOnly} onChange={(event) => set({ unit: event.target.value })} placeholder="hours" /></Labeled></ConfigBox>
}

function MatrixEditor({ field, readOnly, onChange }: { field: FormField; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const config = field.config ?? {}; const rows = Array.isArray(config.rows) ? config.rows as { key: string; label: string }[] : []; const scale = Array.isArray(config.scale) ? config.scale as { value: string; label: string }[] : []
  const patch = (next: Record<string, unknown>) => onChange({ config: { ...config, ...next } })
  return <ConfigBox title="Matrix"><ListEditor title="Rows" values={rows} readOnly={readOnly} keyName="key" valueName="label" onChange={(next) => patch({ rows: next })} /><ListEditor title="Scale" values={scale} readOnly={readOnly} keyName="value" valueName="label" onChange={(next) => patch({ scale: next })} /></ConfigBox>
}

function TableEditor({ field, readOnly, onChange }: { field: FormField; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const config = field.config as Partial<TableConfig> | undefined ?? {}; const columns = config.columns ?? []; const rows = config.rows ?? []; const rowMode = config.rowMode === 'fixed' ? 'fixed' : 'addable'
  const set = (patch: Partial<TableConfig>) => onChange({ config: { ...config, ...patch } })
  return <ConfigBox title="Table"><Labeled label="Rows"><Select value={rowMode} disabled={readOnly} onChange={(event) => set(event.target.value === 'fixed' ? { rowMode: 'fixed', minRows: undefined, maxRows: undefined } : { rowMode: 'addable', rows: undefined })}><option value="addable">User adds and removes rows</option><option value="fixed">Predefined rows</option></Select></Labeled>{rowMode === 'addable' ? <div className="grid grid-cols-2 gap-2"><NumberSetting label="Minimum rows" value={config.minRows} disabled={readOnly} onChange={(minRows) => set({ minRows })} /><NumberSetting label="Maximum rows" value={config.maxRows} disabled={readOnly} onChange={(maxRows) => set({ maxRows })} /></div> : null}<div className="space-y-2"><Label className="text-xs">Columns</Label>{columns.map((column, index) => <div key={`${column.key}-${index}`} className="space-y-1 rounded border border-border bg-surface p-2"><div className="flex gap-1"><Input value={column.label} disabled={readOnly} onChange={(event) => set({ columns: replace(columns, index, { ...column, label: event.target.value }) })} /><Select value={column.type} disabled={readOnly} onChange={(event) => { const type = event.target.value as TableColumn['type']; set({ columns: replace(columns, index, { ...column, type, options: type === 'select' ? column.options ?? [] : undefined }) }) }}><option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option><option value="date">Date</option></Select><DeleteButton disabled={readOnly} onClick={() => set({ columns: columns.filter((_, candidate) => candidate !== index) })} /></div><Input className="font-mono text-xs" value={column.key} disabled={readOnly} onChange={(event) => set({ columns: replace(columns, index, { ...column, key: event.target.value.replace(/\s+/g, '_') }) })} />{column.type === 'select' ? <TableOptions options={column.options ?? []} readOnly={readOnly} onChange={(options) => set({ columns: replace(columns, index, { ...column, options }) })} /> : null}</div>)}<Button size="sm" variant="outline" disabled={readOnly} onClick={() => set({ columns: [...columns, { key: `col_${columns.length + 1}`, label: `Column ${columns.length + 1}`, type: 'text' }] })}><Plus size={12} />Add column</Button></div>{rowMode === 'fixed' ? <div className="space-y-2"><Label className="text-xs">Predefined rows</Label>{rows.map((row, index) => <div key={index} className="flex gap-1"><Input value={row.label} disabled={readOnly} onChange={(event) => set({ rows: replace(rows, index, { label: event.target.value }) })} /><DeleteButton disabled={readOnly} onClick={() => set({ rows: rows.filter((_, candidate) => candidate !== index) })} /></div>)}<Button size="sm" variant="outline" disabled={readOnly} onClick={() => set({ rows: [...rows, { label: `Row ${rows.length + 1}` }] })}><Plus size={12} />Add row</Button></div> : null}</ConfigBox>
}

function TableOptions({ options, readOnly, onChange }: { options: { value: string; label: string }[]; readOnly: boolean; onChange: (options: { value: string; label: string }[]) => void }) {
  return <div className="space-y-1 rounded border border-border-subtle bg-bg-subtle p-1.5"><Label className="text-[10px]">Dropdown options</Label>{options.map((option, index) => <div key={index} className="flex gap-1"><Input className="h-7 text-xs" value={option.label} disabled={readOnly} onChange={(event) => onChange(replace(options, index, { value: option.value || slug(event.target.value), label: event.target.value }))} /><DeleteButton disabled={readOnly} onClick={() => onChange(options.filter((_, candidate) => candidate !== index))} /></div>)}<Button size="sm" variant="outline" disabled={readOnly} onClick={() => onChange([...options, { value: `opt_${options.length + 1}`, label: `Option ${options.length + 1}` }])}><Plus size={11} />Add</Button></div>
}

function DataBindingEditor({ field, sources, loading, otherFields, autofillFields, onRefresh, readOnly, onChange }: { field: FormField; sources: readonly FormDataSource[]; loading: boolean; otherFields: { id: string; label: string }[]; autofillFields: { id: string; label: string }[]; onRefresh?: () => void | Promise<void>; readOnly: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const binding = field.binding; const source = sources.find((candidate) => candidate.key === binding?.sourceKey); const columns = source?.columns ?? []
  const patch = (next: Partial<DataBinding>) => { const merged = { ...binding, ...next } as DataBinding; if (!merged.sourceKey) onChange({ binding: undefined }); else onChange({ binding: merged, ...(field.type === 'data_table' && next.selectable === 'none' ? { required: undefined, validation: undefined, defaultValue: undefined } : {}) }) }
  return <ConfigBox title="Data source" action={onRefresh ? <button type="button" disabled={readOnly} onClick={() => void onRefresh()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"><RefreshCw size={11} />Refresh</button> : null}><Labeled label="Source"><Select value={binding?.sourceKey ?? ''} disabled={readOnly} onChange={(event) => onChange({ binding: event.target.value ? { sourceKey: event.target.value } : undefined })}><option value="">{loading ? 'Loading…' : 'Choose a data source'}</option>{sources.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}</Select></Labeled>{source ? <>{field.type === 'lookup' ? <LookupBinding binding={binding} columns={columns} otherFields={otherFields} autofillFields={autofillFields} readOnly={readOnly} patch={patch} /> : null}{field.type === 'data_table' ? <DataTableBinding binding={binding} columns={columns} readOnly={readOnly} patch={patch} /> : null}{field.type === 'metric' ? <MetricBinding binding={binding} columns={columns} readOnly={readOnly} patch={patch} /> : null}</> : null}</ConfigBox>
}

function LookupBinding({ binding, columns, otherFields, autofillFields, readOnly, patch }: { binding?: DataBinding; columns: readonly FormDataSourceColumn[]; otherFields: { id: string; label: string }[]; autofillFields: { id: string; label: string }[]; readOnly: boolean; patch: (next: Partial<DataBinding>) => void }) {
  const autofill = binding?.autofill ?? []
  return <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><ColumnSelect label="Label column" value={binding?.labelColumn} columns={columns} readOnly={readOnly} onChange={(labelColumn) => patch({ labelColumn })} /><ColumnSelect label="Value column" value={binding?.valueColumn} columns={columns} readOnly={readOnly} onChange={(valueColumn) => patch({ valueColumn })} /></div><div className="grid grid-cols-2 gap-2"><Labeled label="Parent field"><Select value={binding?.filterByField ?? ''} disabled={readOnly} onChange={(event) => patch({ filterByField: event.target.value || undefined })}><option value="">No cascade</option>{otherFields.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Labeled><ColumnSelect label="Match column" value={binding?.filterColumn} columns={columns} readOnly={readOnly} onChange={(filterColumn) => patch({ filterColumn })} /></div><Labeled label="Results per search"><Input type="number" min={1} max={1000} value={binding?.limit ?? ''} disabled={readOnly} onChange={(event) => patch({ limit: event.target.value ? Number(event.target.value) : undefined })} /></Labeled><div className="space-y-1"><div className="flex items-center justify-between"><Label className="text-xs">Auto-fill</Label><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => patch({ autofill: [...autofill, { column: columns[0]?.key ?? '', targetFieldId: autofillFields[0]?.id ?? '' }] })}><Plus size={11} />Add</Button></div>{autofill.map((entry, index) => <div key={index} className="flex gap-1"><Select value={entry.column} disabled={readOnly} onChange={(event) => patch({ autofill: replace(autofill, index, { ...entry, column: event.target.value }) })}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</Select><Select value={entry.targetFieldId} disabled={readOnly} onChange={(event) => patch({ autofill: replace(autofill, index, { ...entry, targetFieldId: event.target.value }) })}>{autofillFields.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select><DeleteButton disabled={readOnly} onClick={() => patch({ autofill: autofill.filter((_, candidate) => candidate !== index) })} /></div>)}</div></div>
}

function DataTableBinding({ binding, columns, readOnly, patch }: { binding?: DataBinding; columns: readonly FormDataSourceColumn[]; readOnly: boolean; patch: (next: Partial<DataBinding>) => void }) {
  const selected = new Set(binding?.columns ?? columns.map((column) => column.key))
  return <div className="space-y-2"><Labeled label="Selection"><Select value={binding?.selectable ?? 'none'} disabled={readOnly} onChange={(event) => patch({ selectable: event.target.value as DataBinding['selectable'] })}><option value="none">Display only</option><option value="single">Select one row</option><option value="multi">Select multiple rows</option></Select></Labeled><Labeled label="Visible columns"><div className="space-y-1">{columns.map((column) => <label key={column.key} className="flex items-center gap-2 text-xs"><Checkbox checked={selected.has(column.key)} disabled={readOnly} onChange={() => { const next = new Set(selected); if (next.has(column.key)) next.delete(column.key); else next.add(column.key); patch({ columns: [...next] }) }} />{column.label}</label>)}</div></Labeled><Labeled label="Rows per page"><Input type="number" min={1} max={1000} value={binding?.limit ?? ''} disabled={readOnly} onChange={(event) => patch({ limit: event.target.value ? Number(event.target.value) : undefined })} /></Labeled></div>
}

function MetricBinding({ binding, columns, readOnly, patch }: { binding?: DataBinding; columns: readonly FormDataSourceColumn[]; readOnly: boolean; patch: (next: Partial<DataBinding>) => void }) {
  const aggregate = binding?.aggregate ?? { fn: 'count' as const }; const needsColumn = aggregate.fn !== 'count'
  const set = (next: Partial<NonNullable<DataBinding['aggregate']>>) => patch({ aggregate: { ...aggregate, ...next } })
  return <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><Labeled label="Aggregate"><Select value={aggregate.fn} disabled={readOnly} onChange={(event) => { const fn = event.target.value as typeof aggregate.fn; patch({ aggregate: fn === 'count' ? { fn } : { fn, column: columns.find((column) => column.type === 'number')?.key } }) }}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></Select></Labeled><ColumnSelect label="Value column" value={aggregate.column} columns={columns} readOnly={readOnly || !needsColumn} onChange={(column) => set({ column })} /></div><div className="grid grid-cols-2 gap-2"><ColumnSelect label="Group by" value={aggregate.groupBy} columns={columns} readOnly={readOnly} onChange={(groupBy) => patch({ aggregate: { ...aggregate, groupBy }, display: groupBy ? binding?.display === 'pie' ? 'pie' : 'bar' : 'number' })} /><Labeled label="Display"><Select value={binding?.display ?? (aggregate.groupBy ? 'bar' : 'number')} disabled={readOnly} onChange={(event) => patch({ display: event.target.value as DataBinding['display'] })}>{aggregate.groupBy ? <><option value="bar">Bar chart</option><option value="pie">Pie chart</option></> : <option value="number">Number</option>}</Select></Labeled></div><Labeled label="Group limit"><Input type="number" min={1} max={1000} value={binding?.limit ?? ''} disabled={readOnly} onChange={(event) => patch({ limit: event.target.value ? Number(event.target.value) : undefined })} /></Labeled></div>
}

function ColumnSelect({ label, value, columns, readOnly, onChange }: { label: string; value?: string; columns: readonly FormDataSourceColumn[]; readOnly: boolean; onChange: (value?: string) => void }) { return <Labeled label={label}><Select value={value ?? ''} disabled={readOnly} onChange={(event) => onChange(event.target.value || undefined)}><option value="">Automatic</option>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</Select></Labeled> }

function ListEditor<T extends Record<string, string>>({ title, values, keyName, valueName, readOnly, onChange }: { title: string; values: T[]; keyName: keyof T; valueName: keyof T; readOnly: boolean; onChange: (values: T[]) => void }) {
  return <div className="space-y-1"><div className="flex items-center justify-between"><Label className="text-xs">{title}</Label><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => onChange([...values, { [keyName]: `${String(keyName)}_${values.length + 1}`, [valueName]: `${title.slice(0, -1)} ${values.length + 1}` } as T])}><Plus size={11} />Add</Button></div>{values.map((value, index) => <div key={index} className="flex gap-1"><Input className="w-20 font-mono text-xs" value={value[keyName]} disabled={readOnly} onChange={(event) => onChange(replace(values, index, { ...value, [keyName]: event.target.value }))} /><Input value={value[valueName]} disabled={readOnly} onChange={(event) => onChange(replace(values, index, { ...value, [valueName]: event.target.value }))} /><DeleteButton disabled={readOnly} onClick={() => onChange(values.filter((_, candidate) => candidate !== index))} /></div>)}</div>
}

export function SectionProperties({ section, schema, locale, readOnly = false, onChange }: { section: FormSection; schema: FormSchemaV1; locale: AppLocale; readOnly?: boolean; onChange: (patch: Partial<FormSection>) => void }) {
  const fields = schema.sections.filter((candidate) => !candidate.repeating).flatMap((candidate) => candidate.fields).filter(storesResponseValue).map((field) => ({ id: field.id, label: readText(field.label, locale, field.id) }))
  return <div className="space-y-3 text-sm"><h3 className="text-sm font-semibold text-fg">Section settings</h3><Labeled label="Section key"><Input value={section.id} disabled className="font-mono text-xs" /></Labeled><Labeled label={`Title · ${locale.toUpperCase()}`}><Input value={readText(section.title, locale)} disabled={readOnly} onChange={(event) => onChange({ title: writeText(section.title, event.target.value, locale) })} /></Labeled>{schema.tabs?.length ? <Labeled label="Tab"><Select value={section.tabId ?? schema.tabs[0]?.id} disabled={readOnly} onChange={(event) => onChange({ tabId: event.target.value })}>{schema.tabs.map((tab) => <option key={tab.id} value={tab.id}>{readText(tab.title, locale, tab.id)}</option>)}</Select></Labeled> : null}<Labeled label="Description"><Textarea rows={2} value={readText(section.description, locale)} disabled={readOnly} onChange={(event) => onChange({ description: writeText(section.description, event.target.value, locale) })} /></Labeled><Labeled label="Workflow step"><Select value={section.step ?? ''} disabled={readOnly} onChange={(event) => onChange({ step: event.target.value || undefined })}><option value="">First step</option>{(schema.workflow?.steps ?? []).map((step) => <option key={step.key} value={step.key}>{readText(step.title, locale, step.key)}</option>)}</Select></Labeled><Labeled label="Columns"><Select value={String(section.layout?.columns ?? 1)} disabled={readOnly} onChange={(event) => { const columns = Number(event.target.value); onChange({ layout: columns > 1 ? { columns, gap: section.layout?.gap } : undefined }) }}>{[1, 2, 3, 4].map((columns) => <option key={columns} value={columns}>{columns} column{columns === 1 ? '' : 's'}</option>)}</Select></Labeled><label className="flex items-center gap-2"><Checkbox checked={section.repeating ?? false} disabled={readOnly} onChange={(event) => onChange({ repeating: event.currentTarget.checked })} />Repeating section</label>{section.repeating ? <ConfigBox title="Repeating rows"><div className="grid grid-cols-2 gap-2"><NumberSetting label="Minimum rows" value={section.minRows} disabled={readOnly} onChange={(minRows) => onChange({ minRows })} /><NumberSetting label="Maximum rows" value={section.maxRows} disabled={readOnly} onChange={(maxRows) => onChange({ maxRows })} /></div><Labeled label="Row label"><Input value={section.rowLabelTemplate ?? ''} disabled={readOnly} onChange={(event) => onChange({ rowLabelTemplate: event.target.value || undefined })} placeholder="Item {{index}}" /></Labeled></ConfigBox> : null}<Labeled label="Show this section when"><LogicBuilder rule={section.showIf} availableFields={fields} onChange={(showIf) => onChange({ showIf })} disabled={readOnly} /></Labeled><label className="flex items-center gap-2"><Checkbox checked={Boolean(section.canvas)} disabled={readOnly} onChange={(event) => onChange({ canvas: event.currentTarget.checked ? createSectionCanvas(section) : undefined })} />Free-form canvas layout</label></div>
}

function ConfigBox({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-2"><div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"><span>{title}</span>{action}</div>{children}</div> }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div> }
function NumberSetting({ label, value, disabled, onChange }: { label: string; value?: number; disabled: boolean; onChange: (value?: number) => void }) { return <Labeled label={label}><Input type="number" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} /></Labeled> }
function DeleteButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) { return <button type="button" aria-label="Delete" disabled={disabled} onClick={onClick} className="grid size-9 shrink-0 place-items-center rounded text-fg-subtle hover:bg-danger-subtle hover:text-danger disabled:opacity-40"><Trash2 size={13} /></button> }
function replace<T>(values: readonly T[], index: number, value: T): T[] { return values.map((candidate, candidateIndex) => candidateIndex === index ? value : candidate) }
function slug(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
function createSectionCanvas(section: FormSection): NonNullable<FormSection['canvas']> {
  let y = 0
  return { cols: 12, rowHeight: 40, items: section.fields.map((field) => { const box = defaultBox(field.type); const item = { i: field.id, x: 0, y, ...box }; y += box.h; return item }) }
}
