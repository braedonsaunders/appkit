'use client'

import * as React from 'react'
import { ExternalLink, MousePointerClick, Plus, Trash2 } from 'lucide-react'
import type { ActionData, AutomationGraph, TriggerData } from '@appkit/forms-core/safety-automation'
import { Button, Input, Label, Select, cn } from '@appkit/ui'
import type { RecordActionFlow, RecordActionFlowAdapter } from './record-config'

type ManualTrigger = Extract<TriggerData, { trigger: 'manual' }>
type ButtonVariant = NonNullable<ManualTrigger['variant']>

const ACTION_LABEL: Record<ActionData['action'], string> = {
  send_email: 'Send email',
  create_capa: 'Create corrective action',
  create_incident: 'Create incident',
  notify_role: 'Notify role',
  set_field: 'Set field',
  flag_non_compliant: 'Flag non-compliant',
  webhook: 'Webhook',
  create_response: 'Start another form',
  analyze_photos: 'Analyze photos (AI)',
  start_monitored_session: 'Start monitored session',
  change_status: 'Change status',
  duplicate_record: 'Duplicate record',
  export_pdf: 'Generate PDF',
}

const VARIANTS: { value: ButtonVariant; label: string }[] = [
  { value: 'default', label: 'Primary' },
  { value: 'outline', label: 'Outline' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'destructive', label: 'Destructive' },
]

const QUICK_ACTIONS = ['flag_non_compliant', 'start_monitored_session', 'duplicate_record', 'export_pdf'] as const satisfies readonly ActionData['action'][]
type QuickAction = (typeof QUICK_ACTIONS)[number]

function defaultAction(kind: QuickAction): ActionData {
  switch (kind) {
    case 'flag_non_compliant': return { action: 'flag_non_compliant' }
    case 'start_monitored_session': return { action: 'start_monitored_session', intervalMinutes: 30, graceMinutes: 10, durationMinutes: 120, requireGeo: false }
    case 'duplicate_record': return { action: 'duplicate_record' }
    case 'export_pdf': return { action: 'export_pdf' }
  }
}

function slugify(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

function buttonIdFromLabel(label: string): string {
  const base = slugify(label)
  return `btn_${base || globalThis.crypto.randomUUID().slice(0, 8)}`
}

export function manualTrigger(graph: AutomationGraph): ManualTrigger | null {
  for (const node of graph.nodes) {
    if (node.data.kind === 'trigger' && node.data.trigger.trigger === 'manual') return node.data.trigger
  }
  return null
}

function firstActionLabel(graph: AutomationGraph): string {
  const node = graph.nodes.find((candidate) => candidate.data.kind === 'action')
  if (node?.data.kind === 'action') return ACTION_LABEL[node.data.action.action]
  return 'No action yet'
}

export function buildRecordButtonGraph(input: { label: string; icon?: string; variant: ButtonVariant; actionKind: QuickAction; order: number }): AutomationGraph {
  const trigger: TriggerData = {
    trigger: 'manual',
    buttonId: buttonIdFromLabel(input.label),
    label: input.label.trim(),
    variant: input.variant,
    order: input.order,
    ...(input.icon?.trim() ? { icon: input.icon.trim() } : {}),
  }
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'trg', position: { x: 80, y: 80 }, data: { kind: 'trigger', trigger } },
      { id: 'act', position: { x: 400, y: 80 }, data: { kind: 'action', action: defaultAction(input.actionKind) } },
    ],
    edges: [{ id: 'e1', source: 'trg', target: 'act', sourceHandle: 'next' }],
  }
}

export type RecordActionsPanelProps = {
  flows: RecordActionFlow[]
  adapter: RecordActionFlowAdapter
  onChanged?: () => void | Promise<void>
  confirmRemove?: (flow: RecordActionFlow) => boolean | Promise<boolean>
  readOnly?: boolean
  className?: string
}

export function RecordActionsPanel({ flows, adapter, onChanged, confirmRemove, readOnly = false, className }: RecordActionsPanelProps) {
  const buttons = React.useMemo(() => flows
    .map((flow) => ({ flow, trigger: manualTrigger(flow.graph) }))
    .filter((entry): entry is { flow: RecordActionFlow; trigger: ManualTrigger } => entry.trigger !== null)
    .sort((left, right) => (left.trigger.order ?? 0) - (right.trigger.order ?? 0) || left.flow.name.localeCompare(right.flow.name)), [flows])

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-xs text-fg-muted">Add the buttons people can run from a record. Each button is a manual workflow that can be expanded into conditions, approvals, and multi-step branches in the workflow studio.</p>
      <ButtonList buttons={buttons} adapter={adapter} onChanged={onChanged} confirmRemove={confirmRemove} readOnly={readOnly} />
      <AddButtonForm adapter={adapter} nextOrder={buttons.length} onChanged={onChanged} readOnly={readOnly} />
    </div>
  )
}

function ButtonList({ buttons, adapter, onChanged, confirmRemove, readOnly }: { buttons: { flow: RecordActionFlow; trigger: ManualTrigger }[]; adapter: RecordActionFlowAdapter; onChanged?: () => void | Promise<void>; confirmRemove?: (flow: RecordActionFlow) => boolean | Promise<boolean>; readOnly: boolean }) {
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function run(flow: RecordActionFlow, task: () => Promise<void>) {
    setBusyId(flow.id)
    setError(null)
    try {
      await task()
      await onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The record action could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(flow: RecordActionFlow) {
    if (confirmRemove ? !(await confirmRemove(flow)) : !globalThis.confirm(`Delete the “${manualTrigger(flow.graph)?.label || flow.name}” button? Its workflow is removed too.`)) return
    await run(flow, () => adapter.remove(flow.id))
  }

  if (buttons.length === 0) return <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-fg-subtle">No record buttons yet.</p>

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {buttons.map(({ flow, trigger }) => (
          <li key={flow.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-fg"><MousePointerClick size={13} className="shrink-0 text-fg-subtle" /><span className="truncate">{trigger.label || 'Untitled button'}</span></div>
                <div className="mt-0.5 text-xs text-fg-muted">{firstActionLabel(flow.graph)}{!flow.enabled ? <span className="ml-2 rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium">Disabled</span> : null}</div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-fg-muted">
                <input type="checkbox" checked={flow.enabled} disabled={readOnly || busyId === flow.id} onChange={(event) => run(flow, () => adapter.setEnabled(flow.id, event.target.checked))} />Enabled
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {adapter.open ? <button type="button" disabled={readOnly} onClick={() => adapter.open?.(flow.id)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"><ExternalLink size={12} />Open workflow</button> : null}
              <button type="button" disabled={readOnly || busyId === flow.id} onClick={() => remove(flow)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:opacity-50"><Trash2 size={12} />Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}

function AddButtonForm({ adapter, nextOrder, onChanged, readOnly }: { adapter: RecordActionFlowAdapter; nextOrder: number; onChanged?: () => void | Promise<void>; readOnly: boolean }) {
  const [label, setLabel] = React.useState('')
  const [actionKind, setActionKind] = React.useState<QuickAction>('export_pdf')
  const [icon, setIcon] = React.useState('')
  const [variant, setVariant] = React.useState<ButtonVariant>('default')
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function add() {
    const trimmed = label.trim()
    if (trimmed.length < 2) { setError('Enter a button label with at least two characters.'); return }
    setError(null)
    startTransition(async () => {
      try {
        const graph = buildRecordButtonGraph({ label: trimmed, icon, variant, actionKind, order: nextOrder })
        await adapter.create(trimmed, graph)
        setLabel('')
        setIcon('')
        await onChanged?.()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The record button could not be created.')
      }
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="text-sm font-medium text-fg">Add record button</div>
      <div className="space-y-1"><Label className="text-xs">Label</Label><Input value={label} disabled={readOnly} placeholder="Generate PDF" onChange={(event) => setLabel(event.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">First action</Label><Select value={actionKind} disabled={readOnly} onChange={(event) => setActionKind(event.target.value as QuickAction)}>{QUICK_ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABEL[action]}</option>)}</Select></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-xs">Style</Label><Select value={variant} disabled={readOnly} onChange={(event) => setVariant(event.target.value as ButtonVariant)}>{VARIANTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></div>
        <div className="space-y-1"><Label className="text-xs">Icon</Label><Input value={icon} disabled={readOnly} placeholder="download" onChange={(event) => setIcon(event.target.value)} /></div>
      </div>
      <p className="text-[11px] text-fg-subtle">The workflow opens with one trigger and one action. Add conditions, approvals, notifications, and branches in the workflow studio.</p>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <Button type="button" disabled={pending || readOnly} className="w-full" onClick={add}><Plus size={14} />{pending ? 'Adding…' : 'Add button'}</Button>
    </div>
  )
}
