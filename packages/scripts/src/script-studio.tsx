'use client'

import * as React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { Check, Code2, History, Play, Plus, Search, Settings2, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Drawer,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@appkit/ui'
import type { ScriptDefinition, ScriptKind, ScriptRun } from './index'

export interface ScriptEditorValue {
  id?: string
  name: string
  kind: ScriptKind
  triggerPoint: string
  subjectType: string | null
  endpointSlug: string | null
  source: string
  cron: string | null
  timezone: string
  timeoutMs: number
  unitBudget: number
  sortOrder: number
  isActive: boolean
}

export interface ScriptStudioProps {
  scripts: ScriptDefinition[]
  runs?: Record<string, ScriptRun[]>
  triggerOptions: Array<{ value: string; label: string; kind?: ScriptKind }>
  subjectTypes?: Array<{ value: string; label: string }>
  selectedId?: string | 'new' | null
  onSelectedIdChange?: (id: string | 'new' | null) => void
  onSave: (value: ScriptEditorValue) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onRun: (id: string) => Promise<ScriptRun | void> | ScriptRun | void
  className?: string
}

const EVENT_TEMPLATE = `// The context is deeply frozen. All data access is capability-scoped.
function main(ctx) {
  app.log('running', ctx.trigger)
  if (ctx.subject && ctx.subject.data.needsReview) {
    return { set: { reviewStatus: 'required' } }
  }
}`

const ENDPOINT_TEMPLATE = `function main(ctx) {
  app.log('request', ctx.request.method)
  return { ok: true, echo: ctx.request.body }
}`

const SCHEDULED_TEMPLATE = `function main(ctx) {
  const rows = app.query('select approved work through the host read-only adapter')
  app.log('processed', rows.length, 'rows for', ctx.tenant.name)
  return { processed: rows.length }
}`

export function ScriptStudio({
  scripts,
  runs = {},
  triggerOptions,
  subjectTypes = [],
  selectedId,
  onSelectedIdChange,
  onSave,
  onDelete,
  onRun,
  className,
}: ScriptStudioProps) {
  const [internalSelected, setInternalSelected] = React.useState<string | 'new' | null>(null)
  const [query, setQuery] = React.useState('')
  const currentId = selectedId === undefined ? internalSelected : selectedId
  const choose = (id: string | 'new' | null) => {
    if (selectedId === undefined) setInternalSelected(id)
    onSelectedIdChange?.(id)
  }
  const selected = currentId && currentId !== 'new' ? scripts.find((script) => script.id === currentId) ?? null : null
  const filtered = scripts.filter((script) => {
    const haystack = `${script.name} ${script.triggerPoint} ${script.subjectType ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-64 flex-1 sm:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scripts" className="pl-9" />
        </div>
        <Button onClick={() => choose('new')}><Plus className="size-4" /> New script</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow noAnimate>
            <TableHead>Script</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((script) => (
            <TableRow key={script.id} className="cursor-pointer" onClick={() => choose(script.id)}>
              <TableCell className="font-medium text-fg">{script.name}</TableCell>
              <TableCell><Badge variant="secondary">{triggerLabel(script.triggerPoint, triggerOptions)}</Badge></TableCell>
              <TableCell className="text-fg-muted">{subjectLabel(script.subjectType, subjectTypes)}</TableCell>
              <TableCell className="text-right tabular-nums">{runs[script.id]?.length ?? 0}</TableCell>
              <TableCell className="text-fg-muted">{script.lastRunAt ? formatDate(script.lastRunAt) : 'Never'}</TableCell>
              <TableCell><Badge variant={script.isActive ? 'success' : 'outline'}>{script.isActive ? 'Active' : 'Disabled'}</Badge></TableCell>
            </TableRow>
          ))}
          {!filtered.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-fg-muted">No scripts match this view.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <ScriptEditorDrawer
        key={currentId ?? 'closed'}
        open={Boolean(currentId)}
        script={selected}
        runs={selected ? runs[selected.id] ?? [] : []}
        triggerOptions={triggerOptions}
        subjectTypes={subjectTypes}
        onClose={() => choose(null)}
        onSave={async (value) => { await onSave(value); choose(null) }}
        onDelete={async (id) => { await onDelete(id); choose(null) }}
        onRun={onRun}
      />
    </div>
  )
}

export function ScriptEditorDrawer({
  open,
  script,
  runs,
  triggerOptions,
  subjectTypes,
  onClose,
  onSave,
  onDelete,
  onRun,
}: {
  open: boolean
  script: ScriptDefinition | null
  runs: ScriptRun[]
  triggerOptions: ScriptStudioProps['triggerOptions']
  subjectTypes: NonNullable<ScriptStudioProps['subjectTypes']>
  onClose: () => void
  onSave: ScriptStudioProps['onSave']
  onDelete: ScriptStudioProps['onDelete']
  onRun: ScriptStudioProps['onRun']
}) {
  const [tab, setTab] = React.useState<'general' | 'code' | 'runs' | 'log'>(script ? 'code' : 'general')
  const [value, setValue] = React.useState<ScriptEditorValue>(() => toEditorValue(script, triggerOptions))
  const [busy, setBusy] = React.useState(false)
  const [runResult, setRunResult] = React.useState<ScriptRun | null>(null)
  const [selectedRun, setSelectedRun] = React.useState(0)
  const activeRuns = runResult && !runs.some((run) => sameRun(run, runResult)) ? [runResult, ...runs] : runs
  const change = <K extends keyof ScriptEditorValue>(key: K, next: ScriptEditorValue[K]) => setValue((current) => ({ ...current, [key]: next }))
  const supportsSubject = value.kind === 'event' || value.kind === 'client'

  async function save() {
    setBusy(true)
    try { await onSave(value) } finally { setBusy(false) }
  }

  async function run() {
    if (!script) return
    setBusy(true)
    try {
      const result = await onRun(script.id)
      if (result) {
        setRunResult(result)
        setSelectedRun(0)
      }
      setTab('log')
    } finally { setBusy(false) }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="2xl"
      initialFullscreen
      title={script ? script.name : 'New script'}
      description="Governed JavaScript executed in an isolated QuickJS runtime."
      headerActions={<>
        {script && (script.kind === 'scheduled' || script.kind === 'bulk') ? <Button size="sm" variant="outline" onClick={run} disabled={busy}><Play className="size-4" /> Run now</Button> : null}
        {script ? <Button variant="ghost" size="sm" onClick={() => onDelete(script.id)} disabled={busy} className="text-danger hover:text-danger"><Trash2 className="size-4" /> Delete</Button> : null}
        <Button onClick={save} disabled={busy || !value.name.trim() || !value.source.includes('function main')}><Check className="size-4" /> {script ? 'Save script' : 'Create script'}</Button>
      </>}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      footer={
        <label className="flex w-full items-center gap-2 text-sm"><input type="checkbox" checked={value.isActive} onChange={(event) => change('isActive', event.currentTarget.checked)} className="size-4 accent-primary" /> Active</label>
      }
    >
      <div className="flex shrink-0 border-b border-border px-5">
        <EditorTab active={tab === 'general'} icon={<Settings2 />} onClick={() => setTab('general')}>General</EditorTab>
        <EditorTab active={tab === 'code'} icon={<Code2 />} onClick={() => setTab('code')}>Code</EditorTab>
        <EditorTab active={tab === 'runs'} icon={<History />} onClick={() => setTab('runs')}>Runs <span className="tabular-nums">{activeRuns.length}</span></EditorTab>
        <EditorTab active={tab === 'log'} icon={<History />} onClick={() => setTab('log')}>Log</EditorTab>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {tab === 'general' ? (
          <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={value.name} onChange={(event) => change('name', event.currentTarget.value)} /></Field>
            <Field label="Trigger">
              <Select value={value.triggerPoint} onChange={(event) => {
                const trigger = triggerOptions.find((option) => option.value === event.currentTarget.value)
                change('triggerPoint', event.currentTarget.value)
                if (trigger?.kind) change('kind', trigger.kind)
              }}>
                {triggerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Field label="Kind"><Input value={value.kind} readOnly className="bg-bg-subtle text-fg-muted" /></Field>
            {supportsSubject ? <Field label="Subject type"><Select value={value.subjectType ?? ''} onChange={(event) => change('subjectType', event.currentTarget.value || null)}><option value="">All subjects</option>{subjectTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field> : null}
            {value.kind === 'endpoint' ? <Field label="Endpoint slug"><Input value={value.endpointSlug ?? ''} onChange={(event) => change('endpointSlug', event.currentTarget.value || null)} /></Field> : null}
            {value.kind === 'scheduled' ? <><Field label="Cron expression"><Input value={value.cron ?? ''} onChange={(event) => change('cron', event.currentTarget.value || null)} /></Field><Field label="Timezone"><Input value={value.timezone} onChange={(event) => change('timezone', event.currentTarget.value)} /></Field></> : null}
            <Field label="Timeout (ms)"><Input type="number" min={1} max={15000} value={value.timeoutMs} onChange={(event) => change('timeoutMs', Number(event.currentTarget.value))} /></Field>
            <Field label="Governance units"><Input type="number" min={1} value={value.unitBudget} onChange={(event) => change('unitBudget', Number(event.currentTarget.value))} /></Field>
            <Field label="Execution order"><Input type="number" value={value.sortOrder} onChange={(event) => change('sortOrder', Number(event.currentTarget.value))} /></Field>
          </div>
        ) : null}
        {tab === 'code' ? (
          <div className="flex min-h-[32rem] flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted"><span>Define <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-fg">function main(ctx)</code>.</span><span>QuickJS · no ambient network, filesystem, process, or database</span></div>
            <div className="min-h-[30rem] flex-1 overflow-hidden rounded-lg border border-border">
            <CodeMirror
              value={value.source}
              onChange={(source) => change('source', source)}
              extensions={[javascript()]}
              theme="dark"
              minHeight="480px"
              maxHeight="calc(100vh - 16rem)"
              basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }}
            />
            </div>
          </div>
        ) : null}
        {tab === 'runs' ? <RunList runs={activeRuns} selected={selectedRun} onSelect={(index) => { setSelectedRun(index); setTab('log') }} /> : null}
        {tab === 'log' ? <RunLog run={activeRuns[selectedRun]} hasRuns={activeRuns.length > 0} /> : null}
      </div>
    </Drawer>
  )
}

function RunList({ runs, selected, onSelect }: { runs: ScriptRun[]; selected: number; onSelect: (index: number) => void }) {
  if (!runs.length) return <div className="grid min-h-80 place-items-center text-sm text-fg-muted">This script has not run yet.</div>
  return (
    <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border">
      {runs.map((item, index) => <button key={`${item.at.toISOString()}-${index}`} type="button" onClick={() => onSelect(index)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-hover', selected === index && 'bg-primary-subtle')}><Badge variant={item.status === 'ok' ? 'success' : item.status === 'aborted' ? 'warning' : 'destructive'}>{item.status}</Badge><span className="text-xs text-fg-muted">{formatDate(item.at)} · {item.durationMs} ms · {item.units} units</span>{item.errorMessage ? <span className="min-w-0 flex-1 truncate text-xs text-danger">{item.errorMessage}</span> : null}</button>)}
    </div>
  )
}

function RunLog({ run, hasRuns }: { run: ScriptRun | undefined; hasRuns: boolean }) {
  if (!run) return <div className="grid min-h-80 place-items-center text-sm text-fg-muted">{hasRuns ? 'Select a run to inspect its log.' : 'This script has not run yet.'}</div>
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><Badge variant={run.status === 'ok' ? 'success' : run.status === 'aborted' ? 'warning' : 'destructive'}>{run.status}</Badge><span className="text-xs text-fg-muted">{formatDate(run.at)} · {run.durationMs} ms · {run.units} units</span></div>
    {run.errorMessage ? <div className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">{run.errorMessage}</div> : null}
    <LogBlock title="Console" value={run.logs.join('\n') || 'No log output.'} />
    {run.returned !== undefined ? <LogBlock title="Return value" value={JSON.stringify(run.returned, null, 2)} /> : null}
    {run.changes ? <LogBlock title="Proposed changes" value={JSON.stringify(run.changes, null, 2)} /> : null}
  </div>
}

function EditorTab({ active, icon, onClick, children }: { active: boolean; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn('flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium', active ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg')}><span className="[&>svg]:size-4">{icon}</span>{children}</button>
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={cn('space-y-2', className)}><Label>{label}</Label>{children}</div>
}

function LogBlock({ title, value }: { title: string; value: string }) {
  return <section className="space-y-2"><h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-bg-subtle p-3 font-mono text-xs leading-5 text-fg">{value}</pre></section>
}

function sameRun(left: ScriptRun, right: ScriptRun): boolean {
  if (left.id && right.id) return left.id === right.id
  return left.scriptId === right.scriptId && left.at.getTime() === right.at.getTime() && left.status === right.status
}

function toEditorValue(script: ScriptDefinition | null, triggerOptions: ScriptStudioProps['triggerOptions']): ScriptEditorValue {
  if (script) return { ...script }
  const trigger = triggerOptions[0] ?? { value: 'before_save', kind: 'event' as const }
  const kind = trigger.kind ?? 'event'
  return {
    name: '',
    kind,
    triggerPoint: trigger.value,
    subjectType: null,
    endpointSlug: kind === 'endpoint' ? 'my-endpoint' : null,
    source: kind === 'endpoint' ? ENDPOINT_TEMPLATE : kind === 'scheduled' || kind === 'bulk' ? SCHEDULED_TEMPLATE : EVENT_TEMPLATE,
    cron: kind === 'scheduled' ? '0 * * * *' : null,
    timezone: 'UTC',
    timeoutMs: 2_000,
    unitBudget: 1_000,
    sortOrder: 100,
    isActive: true,
  }
}

function triggerLabel(value: string, options: ScriptStudioProps['triggerOptions']): string {
  return options.find((option) => option.value === value)?.label ?? value.replaceAll('_', ' ')
}

function subjectLabel(value: string | null, options: NonNullable<ScriptStudioProps['subjectTypes']>): string {
  if (!value) return 'All subjects'
  return options.find((option) => option.value === value)?.label ?? value
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}
