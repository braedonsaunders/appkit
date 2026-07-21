'use client'

import { useState, type ReactNode } from 'react'
import { GripVertical, Plus, Save, Trash2, X } from 'lucide-react'
import { Badge, Button, Checkbox, Input, Label, Select, cn } from '@appkit/ui'
import type { FieldKind } from './types'
import type {
  CustomFieldDefinition,
  CustomizationDesignerAdapter,
} from './designer-types'

const FIELD_TYPES: { value: FieldKind; label: string; help: string }[] = [
  { value: 'text', label: 'Text', help: 'A single line of text.' },
  { value: 'long_text', label: 'Text area', help: 'Long-form notes or descriptions.' },
  { value: 'number', label: 'Number', help: 'A decimal number with optional bounds.' },
  { value: 'currency', label: 'Currency', help: 'A monetary value with optional bounds.' },
  { value: 'date', label: 'Date', help: 'A calendar date.' },
  { value: 'boolean', label: 'Checkbox', help: 'A yes or no value.' },
  { value: 'select', label: 'Dropdown', help: 'One value from an authored option set.' },
  { value: 'multi_select', label: 'Multi-select', help: 'Several values from an authored option set.' },
]

function slugify(value: string): string {
  let key = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  if (!key) key = 'field'
  if (!/^[a-z]/.test(key)) key = `f_${key}`
  return key
}

export interface CustomFieldDesignerProps {
  recordType: string
  level: 'header' | 'line'
  targets?: {
    recordType: string
    label: string
    supportsLines: boolean
  }[]
  field?: CustomFieldDefinition
  adapter: Pick<CustomizationDesignerAdapter, 'saveField' | 'deleteField'>
  roleOptions?: { value: string; label: string }[]
  onSaved?: (definition: CustomFieldDefinition) => void
  onDeleted?: (id: string) => void
  className?: string
}

export function CustomFieldDesigner({
  recordType,
  level,
  targets = [],
  field,
  adapter,
  roleOptions = [],
  onSaved,
  onDeleted,
  className,
}: CustomFieldDesignerProps) {
  const creating = !field
  const [targetRecordType, setTargetRecordType] = useState(field?.recordType ?? recordType)
  const [targetLevel, setTargetLevel] = useState<'header' | 'line'>(field?.level ?? level)
  const [key, setKey] = useState(field?.key ?? '')
  const [label, setLabel] = useState(field?.label ?? '')
  const [fieldType, setFieldType] = useState<FieldKind>(field?.fieldType ?? 'text')
  const [options, setOptions] = useState<string[]>(field?.config.options ?? [])
  const [optionDraft, setOptionDraft] = useState('')
  const [helpText, setHelpText] = useState(field?.config.helpText ?? '')
  const [placeholder, setPlaceholder] = useState(field?.config.placeholder ?? '')
  const [defaultValue, setDefaultValue] = useState(field?.config.defaultValue ?? '')
  const [minValue, setMinValue] = useState(field?.config.min == null ? '' : String(field.config.min))
  const [maxValue, setMaxValue] = useState(field?.config.max == null ? '' : String(field.config.max))
  const [isRequired, setIsRequired] = useState(field?.isRequired ?? false)
  const [showInList, setShowInList] = useState(field?.config.showInList ?? false)
  const [displayMode, setDisplayMode] = useState<'always' | 'create_only' | 'edit_only'>(
    field?.config.displayMode ?? 'always',
  )
  const [allowedRoles, setAllowedRoles] = useState<string[]>(field?.config.allowedRoles ?? [])
  const [isActive, setIsActive] = useState(field?.isActive ?? true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const needsOptions = fieldType === 'select' || fieldType === 'multi_select'
  const numeric = fieldType === 'number' || fieldType === 'currency'

  function addOption() {
    const option = optionDraft.trim()
    if (option && !options.includes(option)) setOptions((current) => [...current, option])
    setOptionDraft('')
  }

  async function save() {
    if (!label.trim()) return
    if (needsOptions && options.length === 0) {
      setFeedback('Add at least one option.')
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await adapter.saveField({
        id: field?.id,
        recordType: targetRecordType,
        level: targetLevel,
        key: field?.key ?? (key || slugify(label)),
        label: label.trim(),
        fieldType,
        config: {
          ...(needsOptions ? { options } : {}),
          ...(helpText ? { helpText } : {}),
          ...(placeholder && !needsOptions && fieldType !== 'boolean' ? { placeholder } : {}),
          ...(defaultValue ? { defaultValue } : {}),
          ...(numeric && minValue !== '' ? { min: Number(minValue) } : {}),
          ...(numeric && maxValue !== '' ? { max: Number(maxValue) } : {}),
          ...(showInList ? { showInList: true } : {}),
          ...(displayMode !== 'always' ? { displayMode } : {}),
          ...(allowedRoles.length > 0 ? { allowedRoles } : {}),
        },
        isRequired,
        isActive,
        sortOrder: field?.sortOrder ?? 0,
      })
      setFeedback('Saved')
      onSaved?.(saved)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save the field')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!field || !adapter.deleteField) return
    setBusy(true)
    setFeedback(null)
    try {
      await adapter.deleteField(field.id)
      onDeleted?.(field.id)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not delete the field')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-bg', className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-fg">{creating ? 'New custom field' : `Edit ${field.label}`}</h2>
          <p className="text-xs text-fg-muted">{targetRecordType.replace(/_/g, ' ')} · {targetLevel}</p>
        </div>
        {feedback ? <span className="text-xs text-fg-muted" role="status">{feedback}</span> : null}
        {field && adapter.deleteField ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        ) : null}
        <Button size="sm" disabled={busy || !label.trim() || (needsOptions && options.length === 0)} onClick={save}>
          <Save className="size-4" />
          {busy ? 'Saving…' : creating ? 'Create field' : 'Save field'}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto max-w-3xl space-y-6 pb-8">
          <div className="rounded-lg border border-border bg-bg-subtle p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Applies to</p>
            {creating && targets.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Record type</Label>
                  <Select
                    value={targetRecordType}
                    aria-label="Record type"
                    onChange={(event) => {
                      const nextRecordType = event.target.value
                      setTargetRecordType(nextRecordType)
                      if (!targets.find((target) => target.recordType === nextRecordType)?.supportsLines) {
                        setTargetLevel('header')
                      }
                    }}
                  >
                    {targets.map((target) => (
                      <option key={target.recordType} value={target.recordType}>{target.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Placement</Label>
                  <Select
                    value={targetLevel}
                    aria-label="Placement"
                    onChange={(event) => setTargetLevel(event.target.value as 'header' | 'line')}
                  >
                    <option value="header">Header field</option>
                    {targets.find((target) => target.recordType === targetRecordType)?.supportsLines ? (
                      <option value="line">Line-item field</option>
                    ) : null}
                  </Select>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary">{targetRecordType.replace(/_/g, ' ')}</Badge>
                <Badge variant="outline">{targetLevel === 'header' ? 'Header field' : 'Line-item field'}</Badge>
                {!creating ? <span className="font-mono text-xs text-fg-subtle">{field.key}</span> : null}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Field label" />
            </div>
            {creating ? (
              <div className="space-y-1.5">
                <Label>Field key <span className="font-normal text-fg-subtle">permanent</span></Label>
                <Input
                  value={key}
                  onChange={(event) => setKey(slugify(event.target.value))}
                  placeholder={label ? slugify(label) : 'field_key'}
                  className="font-mono"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select aria-label="Field type" value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldKind)}>
              {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </Select>
            <p className="text-xs text-fg-subtle">{FIELD_TYPES.find((type) => type.value === fieldType)?.help}</p>
          </div>

          {needsOptions ? (
            <div className="space-y-2">
              <Label>Options</Label>
              {options.length > 0 ? (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                  {options.map((option, index) => (
                    <li key={`${option}-${index}`} className="flex items-center gap-2 px-2.5 py-2 text-sm">
                      <GripVertical className="size-4 text-fg-subtle" />
                      <Input
                        value={option}
                        onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                        aria-label={`Option ${index + 1}`}
                        className="h-8 flex-1"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${option}`}
                        onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="rounded-sm p-1 text-fg-subtle hover:bg-danger-subtle hover:text-danger"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-fg-subtle">No options yet.</p>}
              <div className="flex gap-2">
                <Input
                  value={optionDraft}
                  onChange={(event) => setOptionDraft(event.target.value)}
                  placeholder="Add an option"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addOption()
                    }
                  }}
                />
                <Button variant="outline" onClick={addOption}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Help text</Label>
              <Input value={helpText} onChange={(event) => setHelpText(event.target.value)} />
            </div>
            {!needsOptions && fieldType !== 'boolean' ? (
              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input value={placeholder} onChange={(event) => setPlaceholder(event.target.value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Default value</Label>
              {needsOptions ? (
                <Select aria-label="Default value" value={defaultValue} onChange={(event) => setDefaultValue(event.target.value)}>
                  <option value="">None</option>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              ) : (
                <Input
                  type={fieldType === 'date' ? 'date' : 'text'}
                  inputMode={numeric ? 'decimal' : undefined}
                  value={defaultValue}
                  onChange={(event) => setDefaultValue(event.target.value)}
                />
              )}
            </div>
            {numeric ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Minimum</Label>
                  <Input inputMode="decimal" value={minValue} onChange={(event) => setMinValue(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Maximum</Label>
                  <Input inputMode="decimal" value={maxValue} onChange={(event) => setMaxValue(event.target.value)} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-5 border-t border-border pt-4">
            <Toggle checked={isRequired} onChange={setIsRequired}>Required</Toggle>
            <Toggle checked={showInList} onChange={setShowInList}>Available in list views</Toggle>
            <Toggle checked={isActive} onChange={setIsActive}>Active</Toggle>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Display mode</Label>
              <Select aria-label="Display mode" value={displayMode} onChange={(event) => setDisplayMode(event.target.value as typeof displayMode)}>
                <option value="always">Always</option>
                <option value="create_only">Create only</option>
                <option value="edit_only">Edit only</option>
              </Select>
            </div>
            {roleOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Allowed roles <span className="font-normal text-fg-subtle">optional</span></Label>
                <div className="flex flex-wrap gap-2">
                  {roleOptions.map((role) => (
                    <Toggle
                      key={role.value}
                      checked={allowedRoles.includes(role.value)}
                      onChange={(checked) =>
                        setAllowedRoles((current) =>
                          checked ? [...current, role.value] : current.filter((value) => value !== role.value),
                        )
                      }
                      compact
                    >
                      {role.label}
                    </Toggle>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  compact,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  compact?: boolean
  children: ReactNode
}) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-fg', compact && 'rounded-md border border-border px-2 py-1 text-xs')}>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  )
}
