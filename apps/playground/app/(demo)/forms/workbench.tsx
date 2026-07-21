'use client'

import * as React from 'react'
import { Download, Eye, FileJson, LayoutGrid, RotateCcw, Save, Upload } from 'lucide-react'
import { FormDesigner, FormRenderer, type FormDataSource, type FormFieldAdapter, type FormValues, type RecordActionFlow, type RecordActionFlowAdapter, type RecordConfig } from '@appkit/forms'
import { parseFormSchema, type FieldType, type FormSchemaV1 } from '@appkit/forms-core'
import { Badge, Button, Checkbox, Input, Select, TabContent, Textarea, toast } from '@appkit/ui'
import { SUPPLIER_QUALIFICATION_SCHEMA } from '../../../lib/forms/example-schema'

const STORAGE_KEY = 'appkit.forms.workbench.schema.v1'

const STARTER_SCHEMA = SUPPLIER_QUALIFICATION_SCHEMA
const DEMO_DATA_SOURCES: FormDataSource[] = [
  { id: 'source-suppliers', key: 'suppliers', name: 'Approved suppliers', kind: 'reference', columns: [{ key: 'name', label: 'Supplier', type: 'text' }, { key: 'category', label: 'Category', type: 'text' }, { key: 'rating', label: 'Rating', type: 'number' }] },
  { id: 'source-projects', key: 'projects', name: 'Active projects', kind: 'reference', columns: [{ key: 'name', label: 'Project', type: 'text' }, { key: 'region', label: 'Region', type: 'text' }, { key: 'budget', label: 'Budget', type: 'number' }] },
]
const DEMO_ROWS: Record<string, { id: string; [key: string]: string | number }[]> = {
  suppliers: [{ id: 'supplier-1', name: 'Northwind Materials', category: 'Materials', rating: 92 }, { id: 'supplier-2', name: 'Atlas Services', category: 'Services', rating: 87 }],
  projects: [{ id: 'project-1', name: 'Harbour renewal', region: 'East', budget: 850000 }, { id: 'project-2', name: 'Transit expansion', region: 'Central', budget: 1250000 }],
}

type Mode = 'design' | 'preview' | 'schema'

export function FormWorkbench() {
  const [schema, setSchema] = React.useState<FormSchemaV1>(STARTER_SCHEMA)
  const [mode, setMode] = React.useState<Mode>('design')
  const [json, setJson] = React.useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))
  const [values, setValues] = React.useState<FormValues>({})
  const [recordConfig, setRecordConfig] = React.useState<RecordConfig>({ editingMode: 'both', locking: { enabled: true, trigger: 'on_finalize', lockRoles: ['manager'], unlockRoles: ['admin'] }, tabs: { review: true, comments: true, audit: true } })
  const [flows, setFlows] = React.useState<RecordActionFlow[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)
  const flowAdapter = React.useMemo<RecordActionFlowAdapter>(() => ({
    async create(name, graph) { const flow = { id: crypto.randomUUID(), name, enabled: true, graph }; setFlows((current) => [...current, flow]); return flow },
    async update(id, graph) { setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, graph } : flow)) },
    async setEnabled(id, enabled) { setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, enabled } : flow)) },
    async remove(id) { setFlows((current) => current.filter((flow) => flow.id !== id)) },
    open() { toast.info('Open the Workflow page to expand this button into a multi-step graph.') },
  }), [])
  const fieldAdapters = React.useMemo<Partial<Record<FieldType, FormFieldAdapter>>>(() => ({
    photo: AttachmentField,
    photo_upload: AttachmentField,
    photo_ai: CompoundPhotoField,
    photo_annotated: CompoundPhotoField,
    file: AttachmentField,
    video: AttachmentField,
    audio: AttachmentField,
    lookup: DataLookupField,
    data_table: DataTableField,
    metric: DataMetricField,
  }), [])

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const result = parseFormSchema(JSON.parse(stored))
        if (result.ok) {
          setSchema(result.schema)
          setJson(JSON.stringify(result.schema, null, 2))
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  function updateSchema(next: FormSchemaV1) {
    setSchema(next)
    setJson(JSON.stringify(next, null, 2))
  }

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schema))
    toast.success('Form saved.')
  }

  function applyJson() {
    try {
      const result = parseFormSchema(JSON.parse(json))
      if (!result.ok) {
        toast.error(result.issues[0]?.message ?? 'Schema is invalid.')
        return
      }
      updateSchema(result.schema)
      toast.success('Validated schema applied.')
    } catch {
      toast.error('Schema must be valid JSON.')
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug(schema.title)}.appkit-form.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      const result = parseFormSchema(JSON.parse(await file.text()))
      if (!result.ok) {
        toast.error(result.issues[0]?.message ?? 'Imported schema is invalid.')
        return
      }
      updateSchema(result.schema)
      toast.success('Form schema imported.')
    } catch {
      toast.error('The selected file is not a valid form schema.')
    }
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY)
    updateSchema(STARTER_SCHEMA)
    setValues({})
    toast.success('Starter schema restored.')
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-fg">{titleText(schema.title)}</h1>
            <Badge variant="secondary" className="text-[10px] uppercase">form</Badge>
          </div>
          <p className="text-xs text-fg-muted">Draft · {schema.sections.length} sections</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload size={14} />Import</Button>
          <Button size="sm" variant="outline" onClick={download}><Download size={14} />Export</Button>
          <Button size="sm" onClick={save}><Save size={14} />Save</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void importFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        <ModeButton active={mode === 'design'} onClick={() => setMode('design')} icon={<LayoutGrid size={14} />}>Build</ModeButton>
        <ModeButton active={mode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={14} />}>Fill preview</ModeButton>
        <ModeButton active={mode === 'schema'} onClick={() => setMode('schema')} icon={<FileJson size={14} />}>Schema</ModeButton>
        <Button className="ml-auto" size="sm" variant="ghost" onClick={reset}><RotateCcw size={14} />Restore starter</Button>
      </div>

      <TabContent tabKey={mode} duration={0.12} className="min-h-0 flex-1 overflow-hidden">
        {mode === 'design' ? <FormDesigner value={schema} onChange={updateSchema} recordConfig={recordConfig} onRecordConfigChange={setRecordConfig} roles={[{ key: 'manager', name: 'Manager' }, { key: 'admin', name: 'Administrator' }, { key: 'reviewer', name: 'Reviewer' }]} recordActionFlows={flows} recordActionAdapter={flowAdapter} dataSources={DEMO_DATA_SOURCES} className="h-full" /> : null}
        {mode === 'preview' ? (
          <div className="app-scroll h-full overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-4xl rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-8">
              <FormRenderer
                schema={schema}
                values={values}
                onChange={setValues}
                fieldAdapters={fieldAdapters}
                onSubmit={async () => {
                  toast.success('Response validated.')
                }}
                submitLabel="Validate response"
              />
            </div>
          </div>
        ) : null}
        {mode === 'schema' ? (
          <div className="app-scroll h-full overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-5xl space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div>
                <h2 className="font-semibold text-fg">Form schema</h2>
                <p className="text-sm text-fg-muted">Review or edit the JSON schema. Changes are validated before they are applied.</p>
              </div>
              <Textarea value={json} onChange={(event) => setJson(event.target.value)} className="min-h-[34rem] font-mono text-xs leading-5" spellCheck={false} />
              <div className="flex justify-end"><Button onClick={applyJson}>Validate and apply</Button></div>
            </div>
          </div>
        ) : null}
      </TabContent>
    </div>
  )
}

function attachmentValue(file: File) {
  const attachmentId = crypto.randomUUID()
  return { attachmentId, filename: file.name, contentType: file.type || 'application/octet-stream', url: `/api/attachments/${attachmentId}?cap=${'A'.repeat(43)}` }
}

const AttachmentField: FormFieldAdapter = ({ field, value, onChange, disabled }) => {
  const attachments = Array.isArray(value) ? value as ReturnType<typeof attachmentValue>[] : []
  const accept = field.type === 'photo' || field.type === 'photo_upload' ? 'image/*' : field.type === 'video' ? 'video/*' : field.type === 'audio' ? 'audio/*' : undefined
  return <div className="space-y-2"><Input type="file" accept={accept} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onChange([...attachments, attachmentValue(file)]) }} />{attachments.map((attachment) => <div key={attachment.attachmentId} className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs"><span className="truncate text-fg">{attachment.filename}</span><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(attachments.filter((candidate) => candidate.attachmentId !== attachment.attachmentId))}>Remove</Button></div>)}</div>
}

const CompoundPhotoField: FormFieldAdapter = (props) => {
  const current = typeof props.value === 'object' && props.value !== null ? props.value as { attachments?: ReturnType<typeof attachmentValue>[] } : {}
  return <AttachmentField {...props} value={current.attachments ?? []} onChange={(attachments) => props.onChange({ ...current, attachments })} />
}

const DataLookupField: FormFieldAdapter = ({ field, value, onChange, disabled }) => {
  const rows = DEMO_ROWS[field.binding?.sourceKey ?? ''] ?? []
  const labelKey = field.binding?.labelColumn ?? 'name'
  const valueKey = field.binding?.valueColumn ?? 'id'
  return <Select value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)}><option value="">Select…</option>{rows.map((row) => <option key={row.id} value={String(row[valueKey] ?? row.id)}>{String(row[labelKey] ?? row.id)}</option>)}</Select>
}

const DataTableField: FormFieldAdapter = ({ field, value, onChange, disabled }) => {
  const rows = DEMO_ROWS[field.binding?.sourceKey ?? ''] ?? []
  const selected = Array.isArray(value) ? value as string[] : []
  const columns = field.binding?.columns?.length ? field.binding.columns : Object.keys(rows[0] ?? {}).filter((key) => key !== 'id')
  return <div className="app-scroll overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="bg-bg-subtle"><tr>{field.binding?.selectable !== 'none' ? <th className="w-10 px-3 py-2" /> : null}{columns.map((column) => <th key={column} className="px-3 py-2 text-left text-xs font-semibold text-fg-muted">{column}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id}>{field.binding?.selectable !== 'none' ? <td className="px-3 py-2"><Checkbox checked={selected.includes(row.id)} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked ? field.binding?.selectable === 'single' ? [row.id] : [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td> : null}{columns.map((column) => <td key={column} className="px-3 py-2 text-fg">{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>
}

const DataMetricField: FormFieldAdapter = ({ field }) => {
  const rows = DEMO_ROWS[field.binding?.sourceKey ?? ''] ?? []
  const aggregate = field.binding?.aggregate
  const column = aggregate?.column
  const values = column ? rows.map((row) => Number(row[column]) || 0) : []
  const metric = aggregate?.fn === 'sum' ? values.reduce((sum, value) => sum + value, 0) : aggregate?.fn === 'avg' ? values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1) : aggregate?.fn === 'min' ? Math.min(...values) : aggregate?.fn === 'max' ? Math.max(...values) : rows.length
  return <output className="block rounded-lg border border-border bg-bg-subtle p-4 text-3xl font-semibold tabular-nums text-fg">{new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(metric)}</output>
}

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <Button size="sm" variant={active ? 'default' : 'ghost'} onClick={onClick}>{icon}{children}</Button>
}

function slug(value: FormSchemaV1['title']): string {
  const text = titleText(value)
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form'
}

function titleText(value: FormSchemaV1['title']): string {
  return typeof value === 'string' ? value : value.en ?? 'Untitled form'
}
