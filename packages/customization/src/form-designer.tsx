'use client'

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, Checkbox, Input, Label, Select, cn } from '@appkit/ui'
import {
  customFieldDefKey,
  fieldMetaFor,
  getRecordType,
  isCustomFieldKey,
} from './registry'
import { defaultFormLayout, mergeRegisteredFieldsIntoLayout } from './schema'
import type {
  FieldKind,
  FormActionPlacement,
  FormLayoutConfig,
  HeaderFieldPlacement,
  HeaderGroup,
  LineColumnPlacement,
} from './types'
import type {
  CustomFieldDefinition,
  CustomizationDesignerAdapter,
  CustomizationLabelResolver,
  FormDefinition,
} from './designer-types'

function nextId(prefix: string, used: Set<string>): string {
  let index = 0
  let id = `${prefix}${index}`
  while (used.has(id)) {
    index += 1
    id = `${prefix}${index}`
  }
  return id
}

function slugifyKey(label: string, used: Set<string>): string {
  let base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  if (!base) base = 'field'
  if (!/^[a-z]/.test(base)) base = `f_${base}`
  if (base.length < 2) base = `${base}_x`
  let key = base
  let index = 1
  while (used.has(key)) {
    key = `${base}_${index}`
    index += 1
  }
  return key
}

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

function ensureFieldsPlaced(
  layout: FormLayoutConfig,
  headerFields: CustomFieldDefinition[],
  lineFields: CustomFieldDefinition[],
): FormLayoutConfig {
  mergeRegisteredFieldsIntoLayout(layout)
  const placedHeader = new Set(layout.header.groups.flatMap((group) => group.fields.map((field) => field.key)))
  const firstGroup = layout.header.groups[0]
  if (firstGroup) {
    for (const definition of headerFields) {
      const key = `cf_${definition.key}`
      if (!placedHeader.has(key)) {
        firstGroup.fields.push({
          key,
          visible: true,
          required: definition.isRequired ? true : null,
          labelOverride: null,
          colSpan: null,
        })
      }
    }
  }
  const placedLines = new Set(layout.lines.columns.map((column) => column.key))
  for (const definition of lineFields) {
    const key = `cf_${definition.key}`
    if (!placedLines.has(key)) {
      layout.lines.columns.push({ key, visible: true, width: null, labelOverride: null })
    }
  }
  return layout
}

const KIND_LABELS: Record<string, string> = {
  entity_ref: 'Lookup',
  reference: 'Lookup',
  dimension: 'Lookup',
  select: 'Dropdown',
  multi_select: 'Multi-select',
  date: 'Date',
  boolean: 'Checkbox',
  amount: 'Number',
  currency: 'Number',
  number: 'Number',
  tax: 'Tax',
  status: 'Status',
  long_text: 'Text area',
  text: 'Text',
}

const ACTION_LABELS: Record<string, string> = {
  customize: 'Customize',
  pdf: 'PDF',
  workflow: 'Workflow actions',
  approval: 'Approval actions',
  edit: 'Edit',
  submit: 'Submit for approval',
  post: 'Post',
  gl_impact: 'Ledger impact',
  delete: 'Delete',
}

export interface FormDesignerProps {
  recordType: string
  form?: FormDefinition
  fields?: CustomFieldDefinition[]
  adapter: Pick<CustomizationDesignerAdapter, 'saveForm' | 'deleteForm' | 'saveField'>
  resolveLabel?: CustomizationLabelResolver
  onChange?: (layout: FormLayoutConfig) => void
  onSaved?: (definition: FormDefinition) => void
  onDeleted?: (id: string) => void
  className?: string
}

export function FormDesigner({
  recordType,
  form,
  fields = [],
  adapter,
  resolveLabel = (_messageKey, fallback) => fallback,
  onChange,
  onSaved,
  onDeleted,
  className,
}: FormDesignerProps) {
  const meta = getRecordType(recordType)
  if (!meta) throw new Error(`Unknown record type: ${recordType}`)

  const headerDefinitions = fields.filter((field) => field.level === 'header' && field.isActive)
  const lineDefinitions = fields.filter((field) => field.level === 'line' && field.isActive)
  const initial = useMemo(
    () =>
      ensureFieldsPlaced(
        structuredClone(form?.layout ?? defaultFormLayout(recordType)),
        headerDefinitions,
        lineDefinitions,
      ),
    [form, recordType],
  )
  const [name, setName] = useState(form?.name ?? `${humanize(recordType)} form`)
  const [isDefault, setIsDefault] = useState(form?.isDefault ?? true)
  const [isActive, setIsActive] = useState(form?.isActive ?? true)
  const [layout, setLayout] = useState(initial)
  const [customFields, setCustomFields] = useState(fields)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => onChange?.(layout), [layout, onChange])

  const customByKey = useMemo(
    () => new Map(customFields.map((definition) => [definition.key, definition])),
    [customFields],
  )
  const usedKeys = useMemo(
    () =>
      new Set([
        ...layout.header.groups.flatMap((group) => group.fields.map((field) => field.key)),
        ...layout.lines.columns.map((column) => column.key),
      ]),
    [layout],
  )

  const fieldLabel = (key: string): string => {
    if (isCustomFieldKey(key)) return customByKey.get(customFieldDefKey(key))?.label ?? humanize(key)
    const field = fieldMetaFor(recordType, key)
    return field ? resolveLabel(field.labelKey, humanize(key)) : humanize(key)
  }
  const fieldKind = (key: string): FieldKind | string | undefined =>
    isCustomFieldKey(key)
      ? customByKey.get(customFieldDefKey(key))?.fieldType
      : fieldMetaFor(recordType, key)?.kind

  const updateField = (groupIndex: number, fieldIndex: number, patch: Partial<HeaderFieldPlacement>) =>
    setLayout((current) => {
      const next = structuredClone(current)
      next.header.groups[groupIndex]!.fields[fieldIndex] = {
        ...next.header.groups[groupIndex]!.fields[fieldIndex]!,
        ...patch,
      }
      return next
    })
  const updateColumn = (columnIndex: number, patch: Partial<LineColumnPlacement>) =>
    setLayout((current) => {
      const next = structuredClone(current)
      next.lines.columns[columnIndex] = { ...next.lines.columns[columnIndex]!, ...patch }
      return next
    })
  const updateAction = (actionIndex: number, patch: Partial<FormActionPlacement>) =>
    setLayout((current) => {
      const next = structuredClone(current)
      next.actions[actionIndex] = { ...next.actions[actionIndex]!, ...patch }
      return next
    })

  async function save() {
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await adapter.saveForm({
        id: form?.id,
        recordType,
        name: name.trim(),
        isDefault,
        isActive,
        layout,
      })
      setFeedback('Saved')
      onSaved?.(saved)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save the form')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!form?.id || !adapter.deleteForm) return
    setBusy(true)
    setFeedback(null)
    try {
      await adapter.deleteForm(form.id)
      onDeleted?.(form.id)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not delete the form')
    } finally {
      setBusy(false)
    }
  }

  async function addCustomField(
    draft: Omit<CustomFieldDefinition, 'id' | 'recordType' | 'level' | 'isActive' | 'sortOrder'>,
    level: 'header' | 'line',
  ) {
    const definition = await adapter.saveField({
      ...draft,
      recordType,
      level,
      isActive: true,
      sortOrder: customFields.length,
    })
    setCustomFields((current) => [...current, definition])
    setLayout((current) => {
      const next = structuredClone(current)
      if (level === 'header') {
        next.header.groups.at(-1)?.fields.push({
          key: `cf_${definition.key}`,
          visible: true,
          required: definition.isRequired ? true : null,
          labelOverride: null,
          colSpan: null,
        })
      } else {
        next.lines.columns.push({
          key: `cf_${definition.key}`,
          visible: true,
          width: null,
          labelOverride: null,
        })
      }
      return next
    })
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-bg', className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg-muted">{resolveLabel(meta.labelKey, humanize(recordType))}</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Form name"
            className="mt-1 h-8 max-w-md font-semibold"
          />
        </div>
        {feedback ? <span className="text-xs text-fg-muted" role="status">{feedback}</span> : null}
        {form?.id && adapter.deleteForm ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        ) : null}
        <Button size="sm" disabled={busy || !name.trim()} onClick={save}>
          <Save className="size-4" />
          {busy ? 'Saving…' : 'Save form'}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto max-w-5xl space-y-7 pb-8">
          <EditorSection
            title="Header fields"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLayout((current) => {
                    const next = structuredClone(current)
                    next.header.groups.push({
                      id: nextId('group', new Set(next.header.groups.map((group) => group.id))),
                      label: '',
                      fields: [],
                    })
                    return next
                  })
                }
              >
                <Plus className="size-4" />
                Add group
              </Button>
            }
          >
            {layout.header.groups.map((group, groupIndex) => (
              <div key={group.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={group.label ?? ''}
                    onChange={(event) =>
                      setLayout((current) => {
                        const next = structuredClone(current)
                        next.header.groups[groupIndex]!.label = event.target.value
                        return next
                      })
                    }
                    placeholder="Group label"
                    aria-label={`Group ${groupIndex + 1} label`}
                    className="h-8 flex-1"
                  />
                  {layout.header.groups.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove group"
                      onClick={() =>
                        setLayout((current) => {
                          const next = structuredClone(current)
                          const [removed] = next.header.groups.splice(groupIndex, 1)
                          if (removed) next.header.groups[0]!.fields.push(...removed.fields)
                          return next
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {group.fields.map((field, fieldIndex) => {
                    const metaField = meta.headerFields.find((candidate) => candidate.key === field.key)
                    return (
                      <HeaderFieldRow
                        key={field.key}
                        field={field}
                        label={fieldLabel(field.key)}
                        kindLabel={KIND_LABELS[fieldKind(field.key) ?? ''] ?? 'Text'}
                        locked={Boolean(metaField?.locked)}
                        requiredOverridable={Boolean(metaField?.requiredOverridable)}
                        groups={layout.header.groups}
                        groupIndex={groupIndex}
                        onChange={(patch) => updateField(groupIndex, fieldIndex, patch)}
                        onMove={(offset) =>
                          setLayout((current) => {
                            const next = structuredClone(current)
                            next.header.groups[groupIndex]!.fields = reorder(
                              next.header.groups[groupIndex]!.fields,
                              fieldIndex,
                              fieldIndex + offset,
                            )
                            return next
                          })
                        }
                        onMoveGroup={(targetIndex) =>
                          setLayout((current) => {
                            const next = structuredClone(current)
                            const [moved] = next.header.groups[groupIndex]!.fields.splice(fieldIndex, 1)
                            if (moved) next.header.groups[targetIndex]!.fields.push(moved)
                            return next
                          })
                        }
                      />
                    )
                  })}
                  {group.fields.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-fg-subtle">Move fields here or add a custom field.</p>
                  ) : null}
                </div>
              </div>
            ))}
            <InlineFieldCreator
              level="header"
              usedKeys={usedKeys}
              onCreate={(draft) => addCustomField(draft, 'header')}
            />
          </EditorSection>

          {meta.lineFields.length > 0 || lineDefinitions.length > 0 ? (
            <EditorSection
              title="Line-item columns"
              description="This is the editable line table used by the record form. Change order, visibility, labels, and grid widths."
            >
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <div className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(140px,0.6fr)_104px] gap-2 border-b border-border bg-bg-subtle px-3 py-2 text-xs font-semibold text-fg-muted">
                  <span>Column</span>
                  <span>Label</span>
                  <span>Grid width</span>
                  <span className="text-right">Controls</span>
                </div>
                <div className="divide-y divide-border">
                  {layout.lines.columns.map((column, columnIndex) => (
                    <LineColumnRow
                      key={column.key}
                      column={column}
                      label={fieldLabel(column.key)}
                      kindLabel={KIND_LABELS[fieldKind(column.key) ?? ''] ?? 'Text'}
                      locked={Boolean(meta.lineFields.find((field) => field.key === column.key)?.locked)}
                      onChange={(patch) => updateColumn(columnIndex, patch)}
                      onMove={(offset) =>
                        setLayout((current) => {
                          const next = structuredClone(current)
                          next.lines.columns = reorder(next.lines.columns, columnIndex, columnIndex + offset)
                          return next
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <InlineFieldCreator
                level="line"
                usedKeys={usedKeys}
                onCreate={(draft) => addCustomField(draft, 'line')}
              />
            </EditorSection>
          ) : null}

          <EditorSection title="Record actions" description="Order and show the actions available on this record form.">
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {layout.actions.map((action, actionIndex) => (
                <div key={action.key} className={cn('flex items-center gap-2 px-3 py-2', !action.visible && 'opacity-60')}>
                  <GripVertical className="size-4 text-fg-subtle" />
                  <span className="flex-1 text-sm font-medium text-fg">{ACTION_LABELS[action.key] ?? humanize(action.key)}</span>
                  <IconControl label="Move action up" onClick={() =>
                    setLayout((current) => ({ ...current, actions: reorder(current.actions, actionIndex, actionIndex - 1) }))
                  }>
                    <ChevronUp />
                  </IconControl>
                  <IconControl label="Move action down" onClick={() =>
                    setLayout((current) => ({ ...current, actions: reorder(current.actions, actionIndex, actionIndex + 1) }))
                  }>
                    <ChevronDown />
                  </IconControl>
                  <IconControl label={action.visible ? 'Hide action' : 'Show action'} onClick={() => updateAction(actionIndex, { visible: !action.visible })}>
                    {action.visible ? <Eye /> : <EyeOff />}
                  </IconControl>
                </div>
              ))}
            </div>
          </EditorSection>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
              Default form
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}

function EditorSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
          {description ? <p className="mt-1 text-sm text-fg-subtle">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function KindChip({ children }: { children: string }) {
  return <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{children}</Badge>
}

function IconControl({
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

function HeaderFieldRow({
  field,
  label,
  kindLabel,
  locked,
  requiredOverridable,
  groups,
  groupIndex,
  onChange,
  onMove,
  onMoveGroup,
}: {
  field: HeaderFieldPlacement
  label: string
  kindLabel: string
  locked: boolean
  requiredOverridable: boolean
  groups: HeaderGroup[]
  groupIndex: number
  onChange: (patch: Partial<HeaderFieldPlacement>) => void
  onMove: (offset: number) => void
  onMoveGroup: (index: number) => void
}) {
  return (
    <div className={cn('space-y-2 rounded-md border border-border-subtle bg-bg px-3 py-2', !field.visible && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 shrink-0 text-fg-subtle" />
        <span className="min-w-0 truncate text-sm font-medium text-fg">{label}</span>
        <KindChip>{kindLabel}</KindChip>
        {locked ? <Badge variant="outline">Locked</Badge> : null}
        <div className="ml-auto flex items-center gap-0.5">
          <IconControl label="Move field up" onClick={() => onMove(-1)}><ChevronUp /></IconControl>
          <IconControl label="Move field down" onClick={() => onMove(1)}><ChevronDown /></IconControl>
          <IconControl
            label={field.visible ? 'Hide field' : 'Show field'}
            disabled={locked}
            onClick={() => onChange({ visible: !field.visible })}
          >
            {field.visible ? <Eye /> : <EyeOff />}
          </IconControl>
        </div>
      </div>
      <div className="grid gap-2 pl-6 sm:grid-cols-[minmax(160px,1fr)_96px_minmax(150px,0.7fr)_auto]">
        <Input
          value={field.labelOverride ?? ''}
          disabled={locked}
          onChange={(event) => onChange({ labelOverride: event.target.value || null })}
          placeholder={label}
          aria-label={`Rename ${label}`}
          className="h-8"
        />
        <Select
          value={String(field.colSpan ?? 1)}
          onChange={(event) => onChange({ colSpan: Number(event.target.value) })}
          aria-label={`${label} width`}
          className="h-8"
        >
          <option value="1">1 col</option>
          <option value="2">2 cols</option>
          <option value="3">3 cols</option>
          <option value="4">4 cols</option>
        </Select>
        {groups.length > 1 ? (
          <Select
            value={String(groupIndex)}
            onChange={(event) => {
              const target = Number(event.target.value)
              if (target !== groupIndex) onMoveGroup(target)
            }}
            aria-label={`Move ${label} to group`}
            className="h-8"
          >
            {groups.map((group, index) => (
              <option key={group.id} value={index}>{group.label || `Group ${index + 1}`}</option>
            ))}
          </Select>
        ) : <span />}
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
          <Checkbox
            checked={Boolean(field.required)}
            disabled={!requiredOverridable}
            onChange={() => onChange({ required: field.required ? null : true })}
          />
          Required
        </label>
      </div>
    </div>
  )
}

function LineColumnRow({
  column,
  label,
  kindLabel,
  locked,
  onChange,
  onMove,
}: {
  column: LineColumnPlacement
  label: string
  kindLabel: string
  locked: boolean
  onChange: (patch: Partial<LineColumnPlacement>) => void
  onMove: (offset: number) => void
}) {
  return (
    <div className={cn('grid min-w-[720px] grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(140px,0.6fr)_104px] items-center gap-2 px-3 py-2', !column.visible && 'opacity-60')}>
      <div className="flex min-w-0 items-center gap-2">
        <GripVertical className="size-4 shrink-0 text-fg-subtle" />
        <span className="truncate text-sm font-medium text-fg">{label}</span>
        <KindChip>{kindLabel}</KindChip>
        {locked ? <Badge variant="outline">Locked</Badge> : null}
      </div>
      <Input
        value={column.labelOverride ?? ''}
        disabled={locked}
        onChange={(event) => onChange({ labelOverride: event.target.value || null })}
        placeholder={label}
        aria-label={`Rename ${label}`}
        className="h-8"
      />
      <Input
        value={column.width ?? ''}
        onChange={(event) => onChange({ width: event.target.value || null })}
        placeholder="minmax(120px, 1fr)"
        aria-label={`${label} grid width`}
        className="h-8 font-mono text-xs"
      />
      <div className="flex justify-end">
        <IconControl label="Move column up" onClick={() => onMove(-1)}><ChevronUp /></IconControl>
        <IconControl label="Move column down" onClick={() => onMove(1)}><ChevronDown /></IconControl>
        <IconControl
          label={column.visible ? 'Hide column' : 'Show column'}
          disabled={locked}
          onClick={() => onChange({ visible: !column.visible })}
        >
          {column.visible ? <Eye /> : <EyeOff />}
        </IconControl>
      </div>
    </div>
  )
}

const INLINE_FIELD_TYPES: FieldKind[] = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'boolean',
  'select',
  'multi_select',
]

function InlineFieldCreator({
  level,
  usedKeys,
  onCreate,
}: {
  level: 'header' | 'line'
  usedKeys: Set<string>
  onCreate: (
    draft: Omit<CustomFieldDefinition, 'id' | 'recordType' | 'level' | 'isActive' | 'sortOrder'>,
  ) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldKind>('text')
  const [options, setOptions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsOptions = fieldType === 'select' || fieldType === 'multi_select'

  function reset() {
    setOpen(false)
    setLabel('')
    setFieldType('text')
    setOptions('')
    setError(null)
  }

  async function create() {
    const trimmed = label.trim()
    const parsedOptions = options.split(/[\n,]/).map((option) => option.trim()).filter(Boolean)
    if (!trimmed) return
    if (needsOptions && parsedOptions.length === 0) {
      setError('Add at least one option.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const usedDefinitions = new Set(
        [...usedKeys].filter((key) => key.startsWith('cf_')).map((key) => key.slice(3)),
      )
      await onCreate({
        key: slugifyKey(trimmed, usedDefinitions),
        label: trimmed,
        fieldType,
        config: needsOptions ? { options: parsedOptions } : {},
        isRequired: false,
      })
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the field')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add {level} field
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary-subtle p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg">New {level} field</span>
        <IconControl label="Cancel field creation" onClick={reset}><X /></IconControl>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Label</Label>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldKind)}>
            {INLINE_FIELD_TYPES.map((type) => <option key={type} value={type}>{KIND_LABELS[type]}</option>)}
          </Select>
        </div>
      </div>
      {needsOptions ? (
        <div className="space-y-1">
          <Label>Options</Label>
          <Input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Draft, Ready, Approved" />
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
        <Button size="sm" disabled={busy || !label.trim()} onClick={create}>
          {busy ? 'Adding…' : 'Add field'}
        </Button>
      </div>
    </div>
  )
}
