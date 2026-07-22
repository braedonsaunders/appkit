'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { Columns3, FileInput, ListFilter, Plus } from 'lucide-react'
import { Badge, Button, Select, cn } from '@appkit/ui'
import type { RecordTypeMeta } from './types'
import type {
  CustomFieldDefinition,
  CustomizationDesignerAdapter,
  CustomizationLabelResolver,
  FormDefinition,
  ListViewDefinition,
} from './designer-types'
import { CustomFieldDesigner } from './custom-field-designer'
import { FormDesigner } from './form-designer'
import { ListViewDesigner } from './list-view-designer'

export type CustomizationStudioMode = 'forms' | 'views' | 'fields'
type Mode = CustomizationStudioMode
type Selection =
  | { mode: 'forms'; id: string | 'new' }
  | { mode: 'views'; id: string | 'new' }
  | { mode: 'fields'; id: string | 'new-header' | 'new-line' }

function humanize(value: string): string {
  return value
    .replace(/^_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())
}

export interface CustomizationStudioProps {
  adapter: CustomizationDesignerAdapter
  forms: FormDefinition[]
  views: ListViewDefinition[]
  fields: CustomFieldDefinition[]
  recordTypes: readonly RecordTypeMeta[]
  initialRecordType?: string
  initialMode?: CustomizationStudioMode
  resolveLabel?: CustomizationLabelResolver
  canManageOrganization?: boolean
  roleOptions?: { value: string; label: string }[]
  footer?: ReactNode
  className?: string
}

export function CustomizationStudio({
  adapter,
  forms,
  views,
  fields,
  recordTypes,
  initialRecordType,
  initialMode = 'forms',
  resolveLabel = (_messageKey, fallback) => fallback,
  canManageOrganization = true,
  roleOptions = [],
  footer,
  className,
}: CustomizationStudioProps) {
  const firstRecordType =
    initialRecordType ??
    recordTypes.find((record) => record.supportsForms !== false)?.key ??
    recordTypes[0]?.key
  if (!firstRecordType) throw new Error('CustomizationStudio requires at least one record type')

  const [recordType, setRecordType] = useState(firstRecordType)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [selection, setSelection] = useState<Selection>(() => ({
    mode: initialMode,
    id: initialMode === 'forms'
      ? forms.find((form) => form.recordType === firstRecordType)?.id ?? 'new'
      : initialMode === 'views'
        ? views.find((view) => view.recordType === firstRecordType)?.id ?? 'new'
        : fields.find((field) => field.recordType === firstRecordType)?.id ?? 'new-header',
  } as Selection))

  const recordMeta = recordTypes.find((record) => record.key === recordType)
  if (!recordMeta) throw new Error(`Unknown record type: ${recordType}`)
  const recordForms = forms.filter((form) => form.recordType === recordType)
  const recordViews = views.filter((view) => view.recordType === recordType)
  const recordFields = fields.filter((field) => field.recordType === recordType)
  const selectedForm =
    selection.mode === 'forms' && selection.id !== 'new'
      ? recordForms.find((form) => form.id === selection.id)
      : undefined
  const selectedView =
    selection.mode === 'views' && selection.id !== 'new'
      ? recordViews.find((view) => view.id === selection.id)
      : undefined
  const selectedField =
    selection.mode === 'fields' && selection.id !== 'new-header' && selection.id !== 'new-line'
      ? recordFields.find((field) => field.id === selection.id)
      : undefined

  function chooseMode(nextMode: Mode) {
    setMode(nextMode)
    if (nextMode === 'forms') setSelection({ mode: 'forms', id: recordForms[0]?.id ?? 'new' })
    if (nextMode === 'views') setSelection({ mode: 'views', id: recordViews[0]?.id ?? 'new' })
    if (nextMode === 'fields') setSelection({ mode: 'fields', id: recordFields[0]?.id ?? 'new-header' })
  }

  function chooseRecordType(nextRecordType: string) {
    setRecordType(nextRecordType)
    const nextForms = forms.filter((form) => form.recordType === nextRecordType)
    const nextViews = views.filter((view) => view.recordType === nextRecordType)
    const nextFields = fields.filter((field) => field.recordType === nextRecordType)
    if (mode === 'forms') setSelection({ mode: 'forms', id: nextForms[0]?.id ?? 'new' })
    if (mode === 'views') setSelection({ mode: 'views', id: nextViews[0]?.id ?? 'new' })
    if (mode === 'fields') setSelection({ mode: 'fields', id: nextFields[0]?.id ?? 'new-header' })
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(220px,38%)_minmax(0,1fr)] overflow-hidden bg-bg lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)] lg:grid-rows-1',
        className,
      )}
    >
      <aside className="flex min-h-0 flex-col border-b border-border bg-surface lg:border-r lg:border-b-0">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-semibold text-fg">Record customization</h1>
          <Select
            value={recordType}
            onChange={(event) => chooseRecordType(event.target.value)}
            aria-label="Record type"
            className="mt-3"
          >
            {recordTypes.map((record) => (
              <option key={record.key} value={record.key}>
                {resolveLabel(record.labelKey, humanize(record.key))}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-3 border-b border-border p-2">
          <ModeButton active={mode === 'forms'} onClick={() => chooseMode('forms')} icon={<Columns3 />}>Forms</ModeButton>
          <ModeButton active={mode === 'views'} onClick={() => chooseMode('views')} icon={<ListFilter />}>Views</ModeButton>
          <ModeButton active={mode === 'fields'} onClick={() => chooseMode('fields')} icon={<FileInput />}>Fields</ModeButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {mode === 'forms' ? 'Form layouts' : mode === 'views' ? 'Saved views' : 'Custom fields'}
            </p>
            {mode === 'fields' ? (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setSelection({ mode: 'fields', id: 'new-header' })}>Header</Button>
                {recordMeta.lineFields.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelection({ mode: 'fields', id: 'new-line' })}>Line</Button>
                ) : null}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelection(mode === 'forms' ? { mode: 'forms', id: 'new' } : { mode: 'views', id: 'new' })}
              >
                <Plus className="size-4" />
                New
              </Button>
            )}
          </div>

          {mode === 'forms' ? (
            <LibraryList
              items={recordForms.map((form) => ({
                id: form.id!,
                title: form.name,
                detail: form.isDefault ? 'Default form' : form.isActive ? 'Active' : 'Inactive',
              }))}
              selectedId={selection.mode === 'forms' ? selection.id : ''}
              onSelect={(id) => setSelection({ mode: 'forms', id })}
              empty="No saved form layouts."
            />
          ) : null}
          {mode === 'views' ? (
            <LibraryList
              items={recordViews.map((view) => ({
                id: view.id!,
                title: view.name,
                detail: `${view.scope === 'organization' ? 'Organization' : 'Personal'} · ${view.config.columns.filter((column) => column.visible).length} columns`,
              }))}
              selectedId={selection.mode === 'views' ? selection.id : ''}
              onSelect={(id) => setSelection({ mode: 'views', id })}
              empty="No saved list views."
            />
          ) : null}
          {mode === 'fields' ? (
            <LibraryList
              items={recordFields.map((field) => ({
                id: field.id,
                title: field.label,
                detail: `${field.level === 'header' ? 'Header' : 'Line'} · ${humanize(field.fieldType)}`,
              }))}
              selectedId={selection.mode === 'fields' ? selection.id : ''}
              onSelect={(id) => setSelection({ mode: 'fields', id })}
              empty="No custom fields."
            />
          ) : null}
        </div>
        {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden">
        {mode === 'forms' && selection.mode === 'forms' ? (
          <FormDesigner
            key={selectedForm?.id ?? `new-${recordType}`}
            recordType={recordType}
            meta={recordMeta}
            form={selectedForm}
            fields={recordFields}
            adapter={adapter}
            resolveLabel={resolveLabel}
            onSaved={(saved) => setSelection({ mode: 'forms', id: saved.id! })}
            onDeleted={() =>
              setSelection({
                mode: 'forms',
                id: recordForms.find((form) => form.id !== selectedForm?.id)?.id ?? 'new',
              })
            }
          />
        ) : null}
        {mode === 'views' && selection.mode === 'views' ? (
          <ListViewDesigner
            key={selectedView?.id ?? `new-${recordType}`}
            recordType={recordType}
            meta={recordMeta}
            view={selectedView}
            fields={recordFields}
            adapter={adapter}
            canManageOrganization={canManageOrganization}
            resolveLabel={resolveLabel}
            onSaved={(saved) => setSelection({ mode: 'views', id: saved.id! })}
            onDeleted={() =>
              setSelection({
                mode: 'views',
                id: recordViews.find((view) => view.id !== selectedView?.id)?.id ?? 'new',
              })
            }
          />
        ) : null}
        {mode === 'fields' && selection.mode === 'fields' ? (
          <CustomFieldDesigner
            key={selectedField?.id ?? selection.id}
            recordType={recordType}
            level={selectedField?.level ?? (selection.id === 'new-line' ? 'line' : 'header')}
            field={selectedField}
            adapter={adapter}
            targets={recordTypes.map((record) => ({
              recordType: record.key,
              label: resolveLabel(record.labelKey, humanize(record.key)),
              supportsLines: record.lineFields.length > 0,
            }))}
            roleOptions={roleOptions}
            onSaved={(saved) => {
              setRecordType(saved.recordType)
              setSelection({ mode: 'fields', id: saved.id })
            }}
            onDeleted={() =>
              setSelection({
                mode: 'fields',
                id: recordFields.find((field) => field.id !== selectedField?.id)?.id ?? 'new-header',
              })
            }
          />
        ) : null}
      </main>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactElement
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors [&>svg]:size-4',
        active ? 'bg-primary-subtle text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function LibraryList({
  items,
  selectedId,
  onSelect,
  empty,
}: {
  items: { id: string; title: string; detail: string }[]
  selectedId: string
  onSelect: (id: string) => void
  empty: string
}) {
  if (items.length === 0) {
    return <p className="rounded-md border border-dashed border-border p-4 text-sm text-fg-subtle">{empty}</p>
  }
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'flex w-full items-start justify-between gap-2 rounded-md px-3 py-2.5 text-left transition-colors',
            selectedId === item.id ? 'bg-primary-subtle' : 'hover:bg-surface-hover',
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
            <span className="mt-0.5 block text-xs text-fg-subtle">{item.detail}</span>
          </span>
          {selectedId === item.id ? <Badge variant="secondary">Editing</Badge> : null}
        </button>
      ))}
    </div>
  )
}
