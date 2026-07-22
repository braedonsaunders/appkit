'use client'

import * as React from 'react'
import { Download, Eye, FileJson, LayoutGrid, RotateCcw, Save, Upload } from 'lucide-react'
import {
  ProductionFormDesigner,
  ProductionFormRenderer,
  formFlowProfile,
  type FormDataSource,
  type ProductionFormDesignerAdapter,
  type ProductionFormRuntimeAdapter,
  type RecordActionFlow,
  type RecordActionFlowAdapter,
  type RecordConfig,
} from '@appkit/forms'
import { parseFormSchema, type FormSchemaV1 } from '@appkit/forms-core'
import type { AutomationGraph } from '@appkit/forms-core/safety-automation'
import { Badge, Button, TabContent, Textarea, toast } from '@appkit/ui'
import { FlowsCanvas, type WorkflowStudioAdapter } from '@appkit/workflows/react'
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
  const [designerRevision, setDesignerRevision] = React.useState(0)
  const [version, setVersion] = React.useState(1)
  const [recordConfig, setRecordConfig] = React.useState<RecordConfig>({ editingMode: 'both', locking: { enabled: true, trigger: 'on_finalize', lockRoles: ['manager'], unlockRoles: ['admin'] }, tabs: { review: true, comments: true, audit: true } })
  const [flows, setFlows] = React.useState<RecordActionFlow[]>([])
  const [allowedRoles, setAllowedRoles] = React.useState<string[]>([])
  const [pinned, setPinned] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const flowAdapter = React.useMemo<RecordActionFlowAdapter>(() => ({
    async create(name, graph) { const flow = { id: crypto.randomUUID(), name, enabled: true, graph }; setFlows((current) => [...current, flow]); return flow },
    async update(id, graph) { setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, graph } : flow)) },
    async setEnabled(id, enabled) { setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, enabled } : flow)) },
    async remove(id) { setFlows((current) => current.filter((flow) => flow.id !== id)) },
  }), [])
  const workflowAdapter = React.useMemo<WorkflowStudioAdapter>(() => ({
    async create(_subject, name) {
      const id = crypto.randomUUID()
      setFlows((current) => [...current, { id, name, enabled: false, graph: { schemaVersion: 1, nodes: [], edges: [] } }])
      return { ok: true, id }
    },
    async remove(id) {
      setFlows((current) => current.filter((flow) => flow.id !== id))
      return { ok: true }
    },
    async rename(id, name) {
      setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, name } : flow))
      return { ok: true }
    },
    async save(id, graph: AutomationGraph) {
      setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, graph } : flow))
      return { ok: true }
    },
    async setEnabled(id, enabled) {
      setFlows((current) => current.map((flow) => flow.id === id ? { ...flow, enabled } : flow))
      return { ok: true }
    },
  }), [])
  const designerAdapter = React.useMemo<ProductionFormDesignerAdapter>(() => ({
    async publish(input) {
      const nextVersion = version + 1
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(input.schema))
      window.localStorage.setItem(`${STORAGE_KEY}.publish`, JSON.stringify({ version: nextVersion, changelog: input.changelog }))
      setVersion(nextVersion)
      return { ok: true, version: nextVersion }
    },
    async saveOverview(input) {
      window.localStorage.setItem(`${STORAGE_KEY}.overview`, JSON.stringify(input))
      return { ok: true }
    },
    async saveRecordConfig(input) {
      setRecordConfig(input.recordConfig)
      window.localStorage.setItem(`${STORAGE_KEY}.records`, JSON.stringify(input.recordConfig))
      return { ok: true }
    },
    async saveListConfig(input) {
      setRecordConfig((current) => ({ ...current, list: input.listConfig }))
      window.localStorage.setItem(`${STORAGE_KEY}.list`, JSON.stringify(input.listConfig))
      return { ok: true }
    },
    async savePermissions(input) {
      setAllowedRoles(input.allowedRoles)
      window.localStorage.setItem(`${STORAGE_KEY}.roles`, JSON.stringify(input.allowedRoles))
      return { ok: true }
    },
    async setPinned(input) {
      setPinned(input.pinned)
      window.localStorage.setItem(`${STORAGE_KEY}.pinned`, String(input.pinned))
      return { ok: true }
    },
  }), [version])
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
          setDesignerRevision((current) => current + 1)
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  function updateSchema(next: FormSchemaV1, remountDesigner = false) {
    setSchema(next)
    setJson(JSON.stringify(next, null, 2))
    if (remountDesigner) setDesignerRevision((current) => current + 1)
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
      updateSchema(result.schema, true)
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
      updateSchema(result.schema, true)
      toast.success('Form schema imported.')
    } catch {
      toast.error('The selected file is not a valid form schema.')
    }
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY)
    updateSchema(STARTER_SCHEMA, true)
    toast.success('Starter schema restored.')
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        <ModeButton active={mode === 'design'} onClick={() => setMode('design')} icon={<LayoutGrid size={14} />}>Build</ModeButton>
        <ModeButton active={mode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={14} />}>Fill preview</ModeButton>
        <ModeButton active={mode === 'schema'} onClick={() => setMode('schema')} icon={<FileJson size={14} />}>Schema</ModeButton>
        <div className="ml-auto flex items-center gap-1">
          <Badge variant="secondary" className="hidden text-[10px] uppercase sm:inline-flex">database-free</Badge>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={14} />Import</Button>
          <Button size="sm" variant="ghost" onClick={download}><Download size={14} />Export</Button>
          <Button size="sm" variant="ghost" onClick={save}><Save size={14} />Save draft</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={14} />Restore starter</Button>
        </div>
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

      <TabContent tabKey={mode} duration={0.12} className="min-h-0 flex-1 overflow-hidden">
        {mode === 'design' ? (
          <ProductionFormDesigner
            key={designerRevision}
            adapter={designerAdapter}
            templateId="demo-form"
            templateName={titleText(schema.title)}
            initialSchema={schema}
            currentVersion={version}
            overview={{ description: 'Qualify suppliers before they are approved for purchasing.', category: 'Operations', iconKey: null, emailOnSubmit: false, surfaceAsTool: true }}
            recordConfig={recordConfig}
            allowedRoles={allowedRoles}
            roles={[{ key: 'manager', name: 'Manager' }, { key: 'admin', name: 'Administrator' }, { key: 'reviewer', name: 'Reviewer' }]}
            flows={flows}
            recordActionAdapter={flowAdapter}
            dataSources={DEMO_DATA_SOURCES}
            renderFlows={({ templateId, name, schema: activeSchema, flows: activeFlows }) => (
              <FlowsCanvas
                profile={formFlowProfile(templateId, name, activeSchema)}
                emailTemplates={[]}
                flows={activeFlows}
                canEdit
                adapter={workflowAdapter}
                embedded
              />
            )}
            backHref="/forms"
            recordsHref="/forms"
            assignmentCreateHref="/forms"
            assignmentsHref="/forms"
            dataSourcesHref="/forms"
            canPin
            pinned={pinned}
            onSchemaChange={updateSchema}
            locale="en"
            defaultLocale="en"
            enabledLocales={['en', 'fr']}
            localeLabels={{ en: 'English', fr: 'Français' }}
            className="h-full"
          />
        ) : null}
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
