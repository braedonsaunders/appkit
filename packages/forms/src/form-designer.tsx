'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, GitBranch, GripVertical, List, MousePointerClick, Plus, Search, Settings2, Trash2, Wrench } from 'lucide-react'
import {
  CHOICE_FIELD_TYPES,
  FIELD_TYPES,
  type FieldType,
  type FormField,
  type FormSchemaV1,
} from '@appkit/forms-core'
import { DEFAULT_LOCALE, type AppLocale } from '@appkit/i18n'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Drawer,
  Input,
  cn,
} from '@appkit/ui'
import { readText, writeText } from './text'
import { CanvasEditor, defaultBox } from './canvas-editor'
import { RecordBehaviorPanel } from './record-behavior-panel'
import { RecordListPanel } from './record-list-panel'
import { RecordActionsPanel } from './record-actions-panel'
import type { RecordActionFlow, RecordActionFlowAdapter, RecordConfig } from './record-config'
import { FieldProperties, SectionProperties, type FormDataSource } from './properties'
import { FormTabsEditor, FormWorkflowEditor } from './workflow-properties'

export type FormDesignerProps = {
  value: FormSchemaV1
  onChange: (schema: FormSchemaV1) => void
  locale?: AppLocale
  availableFieldTypes?: readonly FieldType[]
  className?: string
  readOnly?: boolean
  recordConfig?: RecordConfig
  onRecordConfigChange?: (config: RecordConfig) => void
  onRecordConfigSave?: (config: RecordConfig) => void | Promise<void>
  roles?: { key: string; name: string }[]
  recordActionFlows?: RecordActionFlow[]
  recordActionAdapter?: RecordActionFlowAdapter
  onRecordActionsChanged?: () => void | Promise<void>
  dataSources?: readonly FormDataSource[]
  dataSourcesLoading?: boolean
  onRefreshDataSources?: () => void | Promise<void>
}

const CATEGORY_ORDER = ['standard', 'choice', 'scoring', 'picker', 'media', 'identity', 'computed', 'data', 'display'] as const

function newId(prefix: string, existing: ReadonlySet<string>): string {
  let index = 1
  let candidate = prefix
  while (existing.has(candidate)) candidate = `${prefix}_${++index}`
  return candidate
}

export function createFormField(type: FieldType, existing: ReadonlySet<string> = new Set()): FormField {
  const meta = FIELD_TYPES[type]
  const field: FormField = {
    id: newId(type, existing),
    type,
    label: meta.label,
  }
  if (CHOICE_FIELD_TYPES.has(type)) {
    field.validation = {
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    }
  }
  if (type === 'rating') field.config = { max: 5 }
  if (type === 'slider') field.config = { min: 0, max: 10, step: 1 }
  if (type === 'table') {
    field.config = {
      columns: [{ key: 'column_1', label: 'Column 1', type: 'text' }],
      rowMode: 'addable',
    }
  }
  if (type === 'matrix') {
    field.config = {
      rows: [{ key: 'row_1', label: 'Row 1' }],
      scale: [
        { value: '1', label: 'Low' },
        { value: '2', label: 'High' },
      ],
    }
  }
  if (type === 'formula') field.formula = { kind: 'literal', value: 0 }
  if (type === 'lookup') field.binding = { sourceKey: 'source' }
  if (type === 'data_table') field.binding = { sourceKey: 'source', selectable: 'multi' }
  if (type === 'metric') {
    field.binding = { sourceKey: 'source', aggregate: { fn: 'count' }, display: 'number' }
  }
  return field
}

export function FormDesigner({
  value,
  onChange,
  locale = DEFAULT_LOCALE,
  availableFieldTypes,
  className,
  readOnly = false,
  recordConfig,
  onRecordConfigChange,
  onRecordConfigSave,
  roles,
  recordActionFlows,
  recordActionAdapter,
  onRecordActionsChanged,
  dataSources,
  dataSourcesLoading,
  onRefreshDataSources,
}: FormDesignerProps) {
  const [query, setQuery] = React.useState('')
  const [rail, setRail] = React.useState<'fields' | 'workflow' | 'record' | 'list' | 'actions'>('fields')
  const [selected, setSelected] = React.useState<{ sectionId: string; fieldId?: string }>(() => ({
    sectionId: value.sections[0]?.id ?? '',
  }))
  const [propertiesOpen, setPropertiesOpen] = React.useState(false)
  const dragTypeRef = React.useRef<FieldType | null>(null)
  const types = availableFieldTypes ?? (Object.keys(FIELD_TYPES) as FieldType[])
  const normalizedQuery = query.trim().toLowerCase()
  const palette = types.filter((type) => {
    const meta = FIELD_TYPES[type]
    return !normalizedQuery || `${meta.label} ${meta.description} ${meta.category}`.toLowerCase().includes(normalizedQuery)
  })
  const sectionIndex = value.sections.findIndex((section) => section.id === selected.sectionId)
  const section = value.sections[sectionIndex]
  const fieldIndex = section?.fields.findIndex((field) => field.id === selected.fieldId) ?? -1
  const field = section?.fields[fieldIndex]
  const recordFields = React.useMemo(() => value.sections.flatMap((itemSection) => itemSection.fields.map((itemField) => ({ id: itemField.id, label: readText(itemField.label, locale, itemField.id) }))), [locale, value.sections])
  const railItems = React.useMemo(() => [
    { id: 'fields' as const, label: 'Fields', icon: Wrench, available: true },
    { id: 'workflow' as const, label: 'Pages', icon: GitBranch, available: true },
    { id: 'record' as const, label: 'Record', icon: Settings2, available: Boolean(onRecordConfigChange) },
    { id: 'list' as const, label: 'List', icon: List, available: Boolean(onRecordConfigChange) },
    { id: 'actions' as const, label: 'Actions', icon: MousePointerClick, available: Boolean(recordActionAdapter) },
  ].filter((item) => item.available), [onRecordConfigChange, recordActionAdapter])

  const commit = React.useCallback(
    (mutate: (draft: FormSchemaV1) => void) => {
      const draft = structuredClone(value)
      mutate(draft)
      onChange(draft)
    },
    [onChange, value],
  )

  function addField(type: FieldType) {
    const targetIndex = sectionIndex >= 0 ? sectionIndex : 0
    const existing = new Set(value.sections.flatMap((item) => item.fields.map((itemField) => itemField.id)))
    const next = createFormField(type, existing)
    commit((draft) => {
      const target = draft.sections[targetIndex]!
      target.fields.push(next)
      if (target.canvas) {
        const box = defaultBox(type)
        const bottom = target.canvas.items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
        target.canvas.items.push({ i: next.id, x: 0, y: bottom, ...box })
      }
    })
    setSelected({ sectionId: value.sections[targetIndex]!.id, fieldId: next.id })
    setPropertiesOpen(true)
  }

  function addSection() {
    const existing = new Set(value.sections.map((item) => item.id))
    const id = newId('section', existing)
    commit((draft) => draft.sections.push({ id, title: 'New section', fields: [] }))
    setSelected({ sectionId: id })
    setPropertiesOpen(true)
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-bg', className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Fixed, independently scrolling builder rail. */}
        <aside className="flex h-64 w-full shrink-0 flex-col border-b border-border bg-surface lg:h-auto lg:w-80 lg:border-r lg:border-b-0">
          {railItems.length > 1 ? (
            <div className="flex shrink-0 border-b border-border p-1">
              {railItems.map((item) => {
                const Icon = item.icon
                return <button key={item.id} type="button" aria-pressed={rail === item.id} onClick={() => setRail(item.id)} className={cn('flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded px-1 py-1.5 text-[10px] font-medium transition-colors', rail === item.id ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg')}><Icon size={14} /><span className="truncate">{item.label}</span></button>
              })}
            </div>
          ) : null}
          {rail === 'fields' ? <>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-fg">Field library</h2>
            <p className="text-xs text-fg-muted">Choose a field to add it.</p>
          </div>
          <Badge variant="secondary">{types.length}</Badge>
        </div>
          <div className="shrink-0 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-fg-subtle" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a field…" className="pl-9" />
            </div>
          </div>
          <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {CATEGORY_ORDER.map((category) => {
              const items = palette.filter((type) => FIELD_TYPES[type].category === category)
              if (items.length === 0) return null
              return (
                <section key={category} className="mb-3">
                  <h3 className="px-1 pb-1 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">{category}</h3>
                  <div className="grid grid-cols-1 gap-1">
                    {items.map((type) => (
                      <button
                        key={type}
                        type="button"
                        disabled={readOnly}
                        draggable={!readOnly}
                        onDragStart={(event) => {
                          dragTypeRef.current = type
                          event.dataTransfer.effectAllowed = 'copy'
                          event.dataTransfer.setData('application/x-appkit-form-field', type)
                        }}
                        onDragEnd={() => { dragTypeRef.current = null }}
                        onClick={() => addField(type)}
                        className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-left text-xs text-fg hover:border-primary hover:bg-primary-subtle disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Add ${FIELD_TYPES[type].label}`}
                      >
                        <Plus className="size-3 shrink-0" />
                        <span className="truncate">{FIELD_TYPES[type].label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
          </> : null}
          {rail === 'workflow' ? <div className="app-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3"><FormTabsEditor schema={value} locale={locale} readOnly={readOnly} onChange={(tabs, sectionTabs) => commit((draft) => { draft.tabs = tabs; for (const itemSection of draft.sections) itemSection.tabId = sectionTabs[itemSection.id] })} /><FormWorkflowEditor schema={value} locale={locale} readOnly={readOnly} onChange={(steps) => commit((draft) => { draft.workflow = { ...(draft.workflow ?? {}), steps } })} /></div> : null}
          {rail === 'record' && onRecordConfigChange ? <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3"><RecordBehaviorPanel value={recordConfig} roles={roles} onChange={onRecordConfigChange} onSave={onRecordConfigSave} readOnly={readOnly} /></div> : null}
          {rail === 'list' && onRecordConfigChange ? <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3"><RecordListPanel value={recordConfig?.list} fields={recordFields} onChange={(list) => onRecordConfigChange({ ...recordConfig, list })} onSave={onRecordConfigSave ? async (list) => onRecordConfigSave({ ...recordConfig, list }) : undefined} readOnly={readOnly} /></div> : null}
          {rail === 'actions' && recordActionAdapter ? <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3"><RecordActionsPanel flows={recordActionFlows ?? []} adapter={recordActionAdapter} onChanged={onRecordActionsChanged} readOnly={readOnly} /></div> : null}
        </aside>

        {/* The build surface owns the remaining space. */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg-subtle">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2">
            <span className="text-xs font-semibold text-fg">Build</span>
            <span className="text-xs text-fg-muted">{value.sections.length} section{value.sections.length === 1 ? '' : 's'}</span>
            <div className="ml-auto w-full max-w-sm">
              <Input
                id="form-title"
                aria-label="Form title"
                className="h-8 text-sm font-semibold"
                value={readText(value.title, locale)}
                disabled={readOnly}
                onChange={(event) => commit((draft) => { draft.title = writeText(draft.title, event.target.value, locale) })}
              />
            </div>
          </div>
          <main className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="w-full space-y-3">
              {value.sections.map((itemSection, itemSectionIndex) => {
                const sectionActive = selected.sectionId === itemSection.id && !selected.fieldId
                return (
                  <Card
                    key={itemSection.id}
                    className={cn(
                      'border transition-colors',
                      sectionActive ? 'border-primary ring-1 ring-ring' : 'border-border',
                    )}
                  >
                    <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected({ sectionId: itemSection.id })
                          setPropertiesOpen(true)
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <CardTitle className="truncate text-base">{readText(itemSection.title, locale, 'Untitled section')}</CardTitle>
                        <span className="text-xs text-fg-muted">{itemSection.fields.length} field{itemSection.fields.length === 1 ? '' : 's'}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <IconButton label="Move section up" disabled={readOnly || itemSectionIndex === 0} onClick={() => commit((draft) => { const [moved] = draft.sections.splice(itemSectionIndex, 1); draft.sections.splice(itemSectionIndex - 1, 0, moved!) })}><ArrowUp size={14} /></IconButton>
                        <IconButton label="Move section down" disabled={readOnly || itemSectionIndex === value.sections.length - 1} onClick={() => commit((draft) => { const [moved] = draft.sections.splice(itemSectionIndex, 1); draft.sections.splice(itemSectionIndex + 1, 0, moved!) })}><ArrowDown size={14} /></IconButton>
                        <IconButton label="Delete section" disabled={readOnly || value.sections.length === 1} onClick={() => {
                          const nextSection = value.sections[itemSectionIndex === 0 ? 1 : itemSectionIndex - 1]
                          commit((draft) => draft.sections.splice(itemSectionIndex, 1))
                          if (nextSection) setSelected({ sectionId: nextSection.id })
                        }}><Trash2 size={14} className="text-danger" /></IconButton>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {itemSection.canvas ? (
                        <CanvasEditor
                          section={itemSection}
                          locale={locale}
                          defaultLocale={locale}
                          selectedFieldId={selected.sectionId === itemSection.id ? selected.fieldId ?? null : null}
                          dragTypeRef={dragTypeRef}
                          onLayout={(items) => {
                            if (readOnly) return
                            commit((draft) => { draft.sections[itemSectionIndex]!.canvas = { ...draft.sections[itemSectionIndex]!.canvas!, items } })
                          }}
                          onAddWidget={(type, box) => {
                            if (readOnly) return
                            const existing = new Set(value.sections.flatMap((candidate) => candidate.fields.map((candidateField) => candidateField.id)))
                            const next = createFormField(type, existing)
                            commit((draft) => {
                              const target = draft.sections[itemSectionIndex]!
                              target.fields.push(next)
                              target.canvas!.items.push({ i: next.id, ...box })
                            })
                            setSelected({ sectionId: itemSection.id, fieldId: next.id })
                            setPropertiesOpen(true)
                          }}
                          onSelect={(fieldId) => {
                            setSelected({ sectionId: itemSection.id, fieldId })
                            setPropertiesOpen(true)
                          }}
                          onDelete={(fieldId) => {
                            if (readOnly) return
                            commit((draft) => {
                              const target = draft.sections[itemSectionIndex]!
                              target.fields = target.fields.filter((candidate) => candidate.id !== fieldId)
                              target.canvas!.items = target.canvas!.items.filter((item) => item.i !== fieldId)
                            })
                            setSelected({ sectionId: itemSection.id })
                          }}
                        />
                      ) : itemSection.fields.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelected({ sectionId: itemSection.id })
                            setPropertiesOpen(true)
                          }}
                          className="w-full rounded-md border border-dashed border-border-strong p-4 text-center text-xs text-fg-subtle"
                        >
                          Select this section, then add a field from the library.
                        </button>
                      ) : (
                        <ul className="divide-y divide-border-subtle">
                          {itemSection.fields.map((itemField, itemFieldIndex) => (
                            <li key={itemField.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected({ sectionId: itemSection.id, fieldId: itemField.id })
                                  setPropertiesOpen(true)
                                }}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-surface-hover',
                                  selected.fieldId === itemField.id && 'bg-primary-subtle text-primary',
                                )}
                              >
                                <GripVertical className="size-4 shrink-0 text-fg-subtle" />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{readText(itemField.label, locale, FIELD_TYPES[itemField.type].label)}</span>
                                <Badge variant="secondary" className="text-[10px]">{FIELD_TYPES[itemField.type].label}</Badge>
                                {itemField.required || itemField.validation?.required ? <Badge variant="warning" className="text-[10px]">Required</Badge> : null}
                                <span className="w-5 text-right text-xs tabular-nums text-fg-subtle">{itemFieldIndex + 1}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
              <Button type="button" variant="outline" onClick={addSection} disabled={readOnly} className="w-full"><Plus size={14} />Add section</Button>
            </div>
          </main>
        </div>
      </div>

      {/* Properties use a flyout rather than a permanent third column. */}
      <Drawer
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        title={field ? 'Field properties' : 'Section properties'}
        size="sm"
      >
        {field && section ? (
          <FieldInspector
            field={field}
            sections={value.sections}
            availableFields={value.sections.flatMap((itemSection) =>
              itemSection.fields
                .filter((itemField) => itemField.id !== field.id)
                .map((itemField) => ({
                  id: itemField.id,
                  label: readText(itemField.label, locale, itemField.id),
                })),
            )}
            locale={locale}
            schema={value}
            sectionId={section.id}
            dataSources={dataSources}
            dataSourcesLoading={dataSourcesLoading}
            onRefreshDataSources={onRefreshDataSources}
            readOnly={readOnly}
            onPatch={(patch) => {
              commit((draft) => Object.assign(draft.sections[sectionIndex]!.fields[fieldIndex]!, patch))
              if (patch.id && patch.id !== field.id) {
                setSelected({ sectionId: section.id, fieldId: patch.id })
              }
            }}
            onMove={(offset) => commit((draft) => {
              const fields = draft.sections[sectionIndex]!.fields
              const target = fieldIndex + offset
              if (target < 0 || target >= fields.length) return
              const [moved] = fields.splice(fieldIndex, 1)
              fields.splice(target, 0, moved!)
            })}
            onDelete={() => {
              commit((draft) => draft.sections[sectionIndex]!.fields.splice(fieldIndex, 1))
              setSelected({ sectionId: section.id })
            }}
            canMoveUp={fieldIndex > 0}
            canMoveDown={fieldIndex < section.fields.length - 1}
          />
        ) : section ? (
          <SectionInspector
            section={section}
            schema={value}
            locale={locale}
            readOnly={readOnly}
            onChange={(patch) => commit((draft) => Object.assign(draft.sections[sectionIndex]!, patch))}
            onDelete={value.sections.length > 1 ? () => {
              commit((draft) => draft.sections.splice(sectionIndex, 1))
              setSelected({ sectionId: value.sections[sectionIndex === 0 ? 1 : sectionIndex - 1]!.id })
            } : undefined}
          />
        ) : <p className="text-sm text-fg-muted">Select a section or field to edit it.</p>}
      </Drawer>
    </div>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40">{children}</button>
}

function SectionInspector({ section, schema, locale, readOnly, onChange, onDelete }: { section: FormSchemaV1['sections'][number]; schema: FormSchemaV1; locale: AppLocale; readOnly: boolean; onChange: (patch: Partial<FormSchemaV1['sections'][number]>) => void; onDelete?: () => void }) {
  return <div className="space-y-4"><SectionProperties section={section} schema={schema} locale={locale} readOnly={readOnly} onChange={onChange} />{onDelete ? <Button variant="destructive" size="sm" onClick={onDelete} disabled={readOnly}><Trash2 size={15} />Delete section</Button> : null}</div>
}

function FieldInspector({ field, schema, sectionId, locale, readOnly, dataSources, dataSourcesLoading, onRefreshDataSources, onPatch, onMove, onDelete, canMoveUp, canMoveDown }: { field: FormField; schema: FormSchemaV1; sectionId: string; sections: FormSchemaV1['sections']; availableFields: { id: string; label: string }[]; locale: AppLocale; readOnly: boolean; dataSources?: readonly FormDataSource[]; dataSourcesLoading?: boolean; onRefreshDataSources?: () => void | Promise<void>; onPatch: (patch: Partial<FormField>) => void; onMove: (offset: number) => void; onDelete: () => void; canMoveUp: boolean; canMoveDown: boolean }) {
  return (
    <div className="space-y-4">
      <FieldProperties sectionId={sectionId} field={field} schema={schema} locale={locale} dataSources={dataSources} dataSourcesLoading={dataSourcesLoading} onRefreshDataSources={onRefreshDataSources} readOnly={readOnly} onChange={onPatch} />
      <div className="flex flex-wrap gap-1"><Button type="button" size="icon" variant="outline" aria-label="Move field up" disabled={readOnly || !canMoveUp} onClick={() => onMove(-1)}><ArrowUp size={15} /></Button><Button type="button" size="icon" variant="outline" aria-label="Move field down" disabled={readOnly || !canMoveDown} onClick={() => onMove(1)}><ArrowDown size={15} /></Button><Button type="button" size="sm" variant="destructive" disabled={readOnly} onClick={onDelete}><Trash2 size={15} />Delete</Button></div>
    </div>
  )
}
