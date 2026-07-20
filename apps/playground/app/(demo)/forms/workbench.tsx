'use client'

import * as React from 'react'
import { Download, Eye, FileJson, RotateCcw, Save, Upload } from 'lucide-react'
import { FormDesigner, FormRenderer, type FormValues } from '@appkit/forms'
import { formSchemaV1Schema, parseFormSchema, type FormSchemaV1 } from '@appkit/forms-core'
import { Badge, Button, PageHeader, TabContent, Textarea, toast } from '@appkit/ui'

const STORAGE_KEY = 'appkit.forms.workbench.schema.v1'

const STARTER_SCHEMA: FormSchemaV1 = formSchemaV1Schema.parse({
  schemaVersion: 1,
  title: 'Supplier qualification',
  description:
    'A real AppKit schema: edit it, preview it, export it, and bring it into a suite application unchanged.',
  sections: [
    {
      id: 'company',
      title: 'Company details',
      description: 'The same schema accepts OpenBooks string copy and BeaconHS localized copy.',
      layout: { columns: 2, gap: 'md' },
      fields: [
        { id: 'company_name', type: 'text', label: 'Company name', required: true },
        { id: 'contact_email', type: 'email', label: 'Contact email', required: true },
        {
          id: 'expected_spend',
          type: 'currency',
          label: 'Expected annual spend',
          config: { min: 0, step: 100 },
        },
        {
          id: 'risk_tier',
          type: 'select',
          label: 'Risk tier',
          required: true,
          validation: {
            options: [
              { value: 'low', label: 'Low risk' },
              { value: 'medium', label: 'Medium risk' },
              { value: 'high', label: 'High risk' },
            ],
          },
        },
      ],
    },
    {
      id: 'review',
      title: 'Qualification review',
      fields: [
        { id: 'result', type: 'pass_fail_na', label: 'Qualification result', required: true },
        {
          id: 'notes',
          type: 'rich_text',
          label: 'Reviewer notes',
          helpText: 'Rich text is sanitized by the forms-core boundary before output.',
        },
      ],
    },
  ],
})

type Mode = 'design' | 'preview' | 'schema'

export function FormWorkbench() {
  const [schema, setSchema] = React.useState<FormSchemaV1>(STARTER_SCHEMA)
  const [mode, setMode] = React.useState<Mode>('design')
  const [json, setJson] = React.useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))
  const [values, setValues] = React.useState<FormValues>({})
  const [hydrated, setHydrated] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

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
    setHydrated(true)
  }, [])

  function updateSchema(next: FormSchemaV1) {
    setSchema(next)
    setJson(JSON.stringify(next, null, 2))
  }

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schema))
    toast.success('Form schema saved in this browser.')
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
      toast.error('The selected file is not a valid AppKit form schema.')
    }
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY)
    updateSchema(STARTER_SCHEMA)
    setValues({})
    toast.success('Starter schema restored.')
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Form builder"
        description="The extracted OpenBooks + BeaconHS schema engine, visual designer, localized copy model, runtime validation, and app-adapter boundary in one working tool."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="success">{hydrated ? 'Local persistence ready' : 'Loading…'}</Badge>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload size={15} />Import
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              <Download size={15} />Export
            </Button>
            <Button size="sm" onClick={save}><Save size={15} />Save</Button>
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
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2 shadow-sm">
        <div className="flex gap-1">
          <ModeButton active={mode === 'design'} onClick={() => setMode('design')} icon={<FileJson size={15} />}>Design</ModeButton>
          <ModeButton active={mode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={15} />}>Fill preview</ModeButton>
          <ModeButton active={mode === 'schema'} onClick={() => setMode('schema')} icon={<FileJson size={15} />}>Schema</ModeButton>
        </div>
        <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={15} />Restore starter</Button>
      </div>

      <TabContent tabKey={mode} duration={0.12}>
        {mode === 'design' ? <FormDesigner value={schema} onChange={updateSchema} /> : null}
        {mode === 'preview' ? (
          <div className="mx-auto max-w-4xl rounded-xl border border-border bg-bg p-4 shadow-sm sm:p-8">
            <FormRenderer
              schema={schema}
              values={values}
              onChange={setValues}
              onSubmit={async () => {
                toast.success('Schema validation passed. The host app can now persist the response.')
              }}
              submitLabel="Validate response"
            />
          </div>
        ) : null}
        {mode === 'schema' ? (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div>
              <h2 className="font-semibold text-fg">Portable JSON contract</h2>
              <p className="text-sm text-fg-muted">Edit or paste a schema from OpenBooks or BeaconHS. Apply validates the complete structure and its cross-field references.</p>
            </div>
            <Textarea value={json} onChange={(event) => setJson(event.target.value)} className="min-h-[34rem] font-mono text-xs leading-5" spellCheck={false} />
            <div className="flex justify-end"><Button onClick={applyJson}>Validate and apply</Button></div>
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
  const text = typeof value === 'string' ? value : value.en ?? 'form'
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form'
}
