'use client'

import * as React from 'react'
import { Download, Eye, FileJson, LayoutGrid, RotateCcw, Save, Upload } from 'lucide-react'
import { FormDesigner, FormRenderer, type FormValues } from '@appkit/forms'
import { parseFormSchema, type FormSchemaV1 } from '@appkit/forms-core'
import { Badge, Button, TabContent, Textarea, toast } from '@appkit/ui'
import { SUPPLIER_QUALIFICATION_SCHEMA } from '../../../lib/forms/example-schema'

const STORAGE_KEY = 'appkit.forms.workbench.schema.v1'

const STARTER_SCHEMA = SUPPLIER_QUALIFICATION_SCHEMA

type Mode = 'design' | 'preview' | 'schema'

export function FormWorkbench() {
  const [schema, setSchema] = React.useState<FormSchemaV1>(STARTER_SCHEMA)
  const [mode, setMode] = React.useState<Mode>('design')
  const [json, setJson] = React.useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))
  const [values, setValues] = React.useState<FormValues>({})
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
        {mode === 'design' ? <FormDesigner value={schema} onChange={updateSchema} className="h-full" /> : null}
        {mode === 'preview' ? (
          <div className="app-scroll h-full overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-4xl rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-8">
              <FormRenderer
                schema={schema}
                values={values}
                onChange={setValues}
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
