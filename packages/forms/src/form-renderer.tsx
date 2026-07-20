'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  evaluateLogicRule,
  validateResponse,
  type FieldType,
  type FormField,
  type FormSchemaV1,
  type ValidationError,
} from '@appkit/forms-core'
import { DEFAULT_LOCALE, type AppLocale } from '@appkit/i18n'
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Input,
  Label,
  RichTextEditor,
  Textarea,
  cn,
} from '@appkit/ui'
import { readText } from './text'

export type FormValues = Record<string, unknown>
export type FormOption = { value: string; label: string; hint?: string }

export type FormFieldAdapterProps = {
  field: FormField
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  disabled: boolean
  locale: AppLocale
}

export type FormFieldAdapter = (props: FormFieldAdapterProps) => React.ReactNode

export type FormRendererProps = {
  schema: FormSchemaV1
  values?: FormValues
  defaultValues?: FormValues
  onChange?: (values: FormValues) => void
  onSubmit?: (values: FormValues) => void | Promise<void>
  locale?: AppLocale
  disabled?: boolean
  submitLabel?: string
  optionsByField?: Readonly<Record<string, readonly FormOption[]>>
  fieldAdapters?: Partial<Record<FieldType, FormFieldAdapter>>
  className?: string
}

const ADAPTER_FIELD_TYPES = new Set<FieldType>([
  'photo',
  'photo_upload',
  'photo_ai',
  'photo_annotated',
  'file',
  'video',
  'audio',
  'sketch',
  'signature',
  'gps',
  'address',
  'table',
  'matrix',
  'risk_matrix',
  'lookup',
  'data_table',
  'metric',
])

export function FormRenderer({
  schema,
  values: controlledValues,
  defaultValues = {},
  onChange,
  onSubmit,
  locale = DEFAULT_LOCALE,
  disabled = false,
  submitLabel = 'Submit',
  optionsByField = {},
  fieldAdapters = {},
  className,
}: FormRendererProps) {
  const [internalValues, setInternalValues] = React.useState<FormValues>(defaultValues)
  const [errors, setErrors] = React.useState<ValidationError[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const values = controlledValues ?? internalValues
  const errorMap = new Map(errors.map((error) => [error.fieldId, error.message]))

  function update(fieldId: string, next: unknown) {
    const updated = { ...values, [fieldId]: next }
    if (controlledValues === undefined) setInternalValues(updated)
    onChange?.(updated)
    if (errorMap.has(fieldId)) setErrors((current) => current.filter((error) => error.fieldId !== fieldId))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors = validateResponse(schema, values, 'submit')
    setErrors(nextErrors)
    if (nextErrors.length > 0 || !onSubmit) return
    setSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className={cn('space-y-6', className)} noValidate>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{readText(schema.title, locale, 'Untitled form')}</h1>
        {schema.description ? <p className="text-sm text-fg-muted">{readText(schema.description, locale)}</p> : null}
      </header>
      {errors.length > 0 ? (
        <Alert variant="destructive" role="alert"><AlertDescription>Review {errors.length} field{errors.length === 1 ? '' : 's'} before submitting.</AlertDescription></Alert>
      ) : null}
      {schema.sections.map((section) => {
        const visible = !section.showIf || evaluateLogicRule(section.showIf, { values, rows: {} })
        if (!visible) return null
        if (section.repeating) {
          const rows = Array.isArray(values[section.id])
            ? (values[section.id] as FormValues[])
            : []
          return (
            <RepeatingSection
              key={section.id}
              section={section}
              rows={rows}
              onChange={(next) => update(section.id, next)}
              errorMap={errorMap}
              disabled={disabled || submitting}
              locale={locale}
              optionsByField={optionsByField}
              fieldAdapters={fieldAdapters}
            />
          )
        }
        return (
          <section key={section.id} className="rounded-xl border border-border bg-surface shadow-sm">
            {(section.title || section.description) ? (
              <div className="border-b border-border bg-bg-subtle px-5 py-4">
                {section.title ? <h2 className="font-semibold text-fg">{readText(section.title, locale)}</h2> : null}
                {section.description ? <p className="mt-1 text-sm text-fg-muted">{readText(section.description, locale)}</p> : null}
              </div>
            ) : null}
            <div className={cn('grid gap-5 p-5', section.layout?.columns === 2 && 'sm:grid-cols-2', section.layout?.columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3', section.layout?.columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4')}>
              {section.fields.map((field) => {
                const fieldVisible = !field.showIf || evaluateLogicRule(field.showIf, { values, rows: {} })
                if (!fieldVisible) return null
                return (
                  <FieldControl
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    onChange={(next) => update(field.id, next)}
                    error={errorMap.get(field.id)}
                    disabled={disabled || submitting}
                    locale={locale}
                    options={optionsByField[field.id] ?? []}
                    adapter={fieldAdapters[field.type]}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
      {onSubmit ? <div className="flex justify-end"><Button type="submit" disabled={disabled || submitting}>{submitting ? 'Submitting…' : submitLabel}</Button></div> : null}
    </form>
  )
}

function RepeatingSection({ section, rows, onChange, errorMap, disabled, locale, optionsByField, fieldAdapters }: {
  section: FormSchemaV1['sections'][number]
  rows: FormValues[]
  onChange: (rows: FormValues[]) => void
  errorMap: Map<string, string>
  disabled: boolean
  locale: AppLocale
  optionsByField: Readonly<Record<string, readonly FormOption[]>>
  fieldAdapters: Partial<Record<FieldType, FormFieldAdapter>>
}) {
  const canAdd = section.maxRows === undefined || rows.length < section.maxRows
  const canRemove = rows.length > (section.minRows ?? 0)
  function patchRow(rowIndex: number, fieldId: string, value: unknown) {
    const next = rows.map((row, index) => index === rowIndex ? { ...row, [fieldId]: value } : row)
    onChange(next)
  }
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border bg-bg-subtle px-5 py-4">
        <div>
          {section.title ? <h2 className="font-semibold text-fg">{readText(section.title, locale)}</h2> : null}
          {section.description ? <p className="mt-1 text-sm text-fg-muted">{readText(section.description, locale)}</p> : null}
        </div>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !canAdd} onClick={() => onChange([...rows, {}])}><Plus size={15} />Add row</Button>
      </div>
      <div className="space-y-4 p-5">
        {errorMap.get(`__section_${section.id}`) ? <p className="text-sm text-danger">{errorMap.get(`__section_${section.id}`)}</p> : null}
        {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-fg-muted">No rows yet.</p> : null}
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="rounded-lg border border-border bg-bg p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-fg">{rowLabel(section.rowLabelTemplate, rowIndex, row)}</h3>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove row ${rowIndex + 1}`} disabled={disabled || !canRemove} onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}><Trash2 size={15} /></Button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {section.fields.map((field) => {
                const visible = !field.showIf || evaluateLogicRule(field.showIf, { values: { ...row }, rows: {} })
                if (!visible) return null
                return <FieldControl key={field.id} field={field} value={row[field.id]} onChange={(next) => patchRow(rowIndex, field.id, next)} error={errorMap.get(`${section.id}.${rowIndex}.${field.id}`)} disabled={disabled} locale={locale} options={optionsByField[field.id] ?? []} adapter={fieldAdapters[field.type]} />
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function rowLabel(template: string | undefined, index: number, row: FormValues): string {
  if (!template) return `Row ${index + 1}`
  return template
    .replaceAll('{index+1}', String(index + 1))
    .replaceAll('{index}', String(index))
    .replace(/\{([A-Za-z0-9_-]+)\}/g, (_, key: string) => String(row[key] ?? ''))
}

function FieldControl({ field, value, onChange, error, disabled, locale, options, adapter }: FormFieldAdapterProps & { options: readonly FormOption[]; adapter?: FormFieldAdapter }) {
  if (adapter) return <div className="space-y-2">{fieldLabel(field, locale)}{adapter({ field, value, onChange, error, disabled, locale })}{fieldHelp(field, locale, error)}</div>

  if (field.type === 'heading') return <h3 className="col-span-full text-lg font-semibold text-fg">{readText(field.label, locale)}</h3>
  if (field.type === 'paragraph') return <p className="col-span-full text-sm text-fg-muted">{readText(field.helpText ?? field.label, locale)}</p>
  if (field.type === 'divider') return <hr className="col-span-full border-border" />
  if (field.type === 'formula') return <OutputField field={field} value={value} locale={locale} />
  if (ADAPTER_FIELD_TYPES.has(field.type)) return <AdapterRequired field={field} locale={locale} />

  const common = { id: field.id, disabled, 'aria-invalid': Boolean(error), 'aria-describedby': `${field.id}-help` } as const
  const choiceOptions = field.validation?.options?.map((option) => ({ value: option.value, label: readText(option.label, locale) })) ?? options

  let control: React.ReactNode
  switch (field.type) {
    case 'long_text':
      control = <Textarea {...common} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
      break
    case 'rich_text':
      control = <RichTextEditor value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={onChange} normalizeLink={safeLink} />
      break
    case 'number':
    case 'currency':
    case 'percentage':
      control = <Input {...common} type="number" inputMode="decimal" value={typeof value === 'number' ? value : ''} min={numberConfig(field, 'min')} max={numberConfig(field, 'max')} step={numberConfig(field, 'step') ?? (field.type === 'currency' ? 0.01 : 'any')} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
      break
    case 'slider': {
      const min = numberConfig(field, 'min') ?? 0
      const max = numberConfig(field, 'max') ?? 10
      control = <div className="flex items-center gap-3"><input {...common} className="h-2 flex-1 accent-primary" type="range" min={min} max={max} step={numberConfig(field, 'step') ?? 1} value={typeof value === 'number' ? value : min} onChange={(event) => onChange(Number(event.target.value))} /><output className="w-10 text-right text-sm tabular-nums text-fg">{typeof value === 'number' ? value : min}</output></div>
      break
    }
    case 'rating': {
      const max = numberConfig(field, 'max') ?? 5
      control = <div className="flex flex-wrap gap-2">{Array.from({ length: max }, (_, index) => index + 1).map((rating) => <Button key={rating} type="button" size="icon" variant={value === rating ? 'default' : 'outline'} disabled={disabled} onClick={() => onChange(rating)} aria-label={`Rate ${rating} of ${max}`}>{rating}</Button>)}</div>
      break
    }
    case 'radio':
    case 'pass_fail_na':
    case 'traffic_light': {
      const items = field.type === 'pass_fail_na' ? [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'n_a', label: 'N/A' }] : field.type === 'traffic_light' ? [{ value: 'green', label: 'Green' }, { value: 'yellow', label: 'Yellow' }, { value: 'red', label: 'Red' }] : choiceOptions
      control = <div className="flex flex-wrap gap-2">{items.map((option) => <Button key={option.value} type="button" size="sm" variant={value === option.value ? 'default' : 'outline'} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</Button>)}</div>
      break
    }
    case 'checkbox_group':
    case 'multi_select':
    case 'multi_person_picker': {
      const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      control = <div className="space-y-2">{choiceOptions.map((option) => <label key={option.value} className="flex items-center gap-2 text-sm text-fg"><Checkbox disabled={disabled} checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((entry) => entry !== option.value))} />{option.label}</label>)}</div>
      break
    }
    case 'ranking': {
      const ordered = Array.isArray(value) && value.length > 0
        ? value.filter((item): item is string => typeof item === 'string')
        : choiceOptions.map((option) => option.value)
      control = <div className="space-y-1">{ordered.map((entry, index) => { const option = choiceOptions.find((item) => item.value === entry); return <div key={entry} className="flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-2 py-1.5"><span className="w-5 text-center text-xs tabular-nums text-fg-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-fg">{option?.label ?? entry}</span><Button type="button" size="icon" variant="ghost" aria-label={`Move ${option?.label ?? entry} up`} disabled={disabled || index === 0} onClick={() => onChange(move(ordered, index, index - 1))}><ArrowUp size={14} /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Move ${option?.label ?? entry} down`} disabled={disabled || index === ordered.length - 1} onClick={() => onChange(move(ordered, index, index + 1))}><ArrowDown size={14} /></Button></div> })}</div>
      break
    }
    case 'select':
    case 'person_picker':
    case 'customer_picker':
    case 'project_picker':
    case 'site_picker':
    case 'area_picker':
    case 'gl_account':
    case 'party':
      control = <select {...common} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">Select…</option>{choiceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      break
    case 'yes_no_comment': {
      const current = typeof value === 'object' && value !== null ? value as { answer?: string; comment?: string } : {}
      control = <div className="space-y-3"><div className="flex gap-2">{['yes', 'no'].map((answer) => <Button key={answer} type="button" size="sm" variant={current.answer === answer ? 'default' : 'outline'} disabled={disabled} onClick={() => onChange({ ...current, answer })}>{answer === 'yes' ? 'Yes' : 'No'}</Button>)}</div>{current.answer === 'no' ? <Textarea value={current.comment ?? ''} placeholder="Add a comment…" disabled={disabled} onChange={(event) => onChange({ ...current, comment: event.target.value })} /> : null}</div>
      break
    }
    case 'typed_attestation': {
      const current = typeof value === 'object' && value !== null ? value as { name?: string; agreed?: boolean } : {}
      control = <div className="space-y-2"><Input {...common} value={current.name ?? ''} placeholder="Type your full name" onChange={(event) => onChange({ ...current, name: event.target.value })} /><label className="flex items-center gap-2 text-sm text-fg"><Checkbox disabled={disabled} checked={current.agreed ?? false} onChange={(event) => onChange({ ...current, agreed: event.target.checked })} />I confirm this attestation.</label></div>
      break
    }
    default: {
      const inputType = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'time' ? 'time' : 'text'
      control = <Input {...common} type={inputType} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
    }
  }

  return <div className={cn('space-y-2', (field.colSpan ?? 1) > 1 && 'sm:col-span-2')}>{fieldLabel(field, locale)}{control}{fieldHelp(field, locale, error)}</div>
}

function fieldLabel(field: FormField, locale: AppLocale) {
  return <Label htmlFor={field.id}>{readText(field.label, locale)}{field.required || field.validation?.required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</Label>
}

function fieldHelp(field: FormField, locale: AppLocale, error?: string) {
  return <p id={`${field.id}-help`} className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}>{error ?? readText(field.helpText, locale)}</p>
}

function OutputField({ field, value, locale }: { field: FormField; value: unknown; locale: AppLocale }) {
  return <div className="space-y-2"><Label>{readText(field.label, locale)}</Label><output className="block rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm font-medium text-fg">{value === undefined || value === null ? '—' : String(value)}</output></div>
}

function AdapterRequired({ field, locale }: { field: FormField; locale: AppLocale }) {
  return <div className="space-y-2"><Label>{readText(field.label, locale)}</Label><Alert variant="info"><AlertDescription>Connect the {field.type.replaceAll('_', ' ')} adapter supplied by your application.</AlertDescription></Alert></div>
}

function numberConfig(field: FormField, key: 'min' | 'max' | 'step'): number | undefined {
  const value = field.config?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function move(values: string[], from: number, to: number): string[] {
  if (to < 0 || to >= values.length) return values
  const next = [...values]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

function safeLink(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
