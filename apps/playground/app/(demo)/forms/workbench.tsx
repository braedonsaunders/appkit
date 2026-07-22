'use client'

import * as React from 'react'
import { Download, Eye, FileJson, LayoutGrid, RotateCcw, Save, Upload } from 'lucide-react'
import { FormDesigner, ProductionFormRenderer, type FormDataSource, type ProductionFormRuntimeAdapter, type RecordActionFlow, type RecordActionFlowAdapter, type RecordConfig } from '@appkit/forms'
import { parseFormSchema, type FormSchemaV1 } from '@appkit/forms-core'
import { Badge, Button, TabContent, Textarea, toast } from '@appkit/ui'
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
  const productionSchema = React.useMemo(() => ({
    ...schema,
    workflow: schema.workflow ?? {
      steps: [{ key: 'submit', title: 'Submit', assignee: { type: 'expression' as const, expr: '$submitter' } }],
    },
  }), [schema])
  const revision = React.useRef(0)
  const runtimeAdapter = React.useMemo<ProductionFormRuntimeAdapter>(() => ({
    async createDraft() { return { ok: true, responseId: 'demo-response' } },
    async saveDraft(input) {
      revision.current += 1
      window.localStorage.setItem('appkit.forms.workbench.response.v1', JSON.stringify({ values: input.values, rows: input.rows, stepIndex: input.stepIndex, revision: revision.current }))
      return { ok: true, savedAt: new Date().toISOString(), revision: revision.current, sequence: input.clientSequence }
    },
    async submit() {
      toast.success('Response validated.')
      return { ok: true, responseId: 'demo-response' }
    },
    async updateField(input) {
      const key = 'appkit.forms.workbench.inline-response.v1'
      const current = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      window.localStorage.setItem(key, JSON.stringify({ ...current, [input.fieldId]: input.value }))
      return { ok: true }
    },
    async fetchEntityAttributes() { return { ok: true, attrs: {} } },
    async listHierarchyOptions(level) {
      return level === 'customer'
        ? [{ id: 'customer-1', name: 'Northwind Materials', code: 'NW' }]
        : level === 'project'
          ? (DEMO_ROWS.projects ?? []).map((row) => ({ id: row.id, name: String(row.name), code: null }))
          : [{ id: `${level}-1`, name: `Primary ${level}`, code: null }]
    },
    async queryData(input) {
      const source = DEMO_ROWS[input.sourceKey] ?? []
      const search = input.search?.trim().toLocaleLowerCase() ?? ''
      const filtered = source.filter((row) => !search || Object.values(row).some((value) => String(value).toLocaleLowerCase().includes(search)))
      const page = input.page ?? 1
      const pageSize = input.pageSize ?? 25
      const rows = filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ ...row, __rowId: row.id }))
      const selectedRow = input.selectedValue == null ? null : source.find((row) => Object.values(row).some((value) => String(value) === String(input.selectedValue))) ?? null
      const definition = DEMO_DATA_SOURCES.find((candidate) => candidate.key === input.sourceKey)
      return { columns: definition?.columns ?? [], rows, total: filtered.length, page, pageSize, selectedRow }
    },
    async aggregateData(input) {
      const rows = DEMO_ROWS[input.sourceKey] ?? []
      const numbers = input.column ? rows.map((row) => Number(row[input.column!])).filter(Number.isFinite) : []
      const value = input.fn === 'count' ? rows.length
        : input.fn === 'sum' ? numbers.reduce((sum, number) => sum + number, 0)
          : input.fn === 'avg' ? numbers.reduce((sum, number) => sum + number, 0) / Math.max(1, numbers.length)
            : input.fn === 'min' ? Math.min(...numbers)
              : numbers.length ? Math.max(...numbers) : null
      return { value, total: rows.length }
    },
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
              <ProductionFormRenderer
                adapter={runtimeAdapter}
                templateId="demo-form"
                templateName={titleText(schema.title)}
                version={1}
                schema={productionSchema}
                sites={[]}
                people={[]}
                entitiesByField={{}}
                currentUser={{ personId: null, name: 'Demo user' }}
                recordsHref="/forms"
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
