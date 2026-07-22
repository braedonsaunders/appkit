'use client'

import * as React from 'react'
import { ScriptStudio, type ScriptEditorValue } from '@appkit/scripts/react'
import type { ScriptDefinition, ScriptRun } from '@appkit/scripts'

interface Snapshot { scripts: ScriptDefinition[]; runs: Record<string, ScriptRun[]> }

const TRIGGERS = [
  { value: 'before_save', label: 'Before save', kind: 'event' as const },
  { value: 'after_save', label: 'After save', kind: 'event' as const },
  { value: 'before_delete', label: 'Before delete', kind: 'event' as const },
  { value: 'scheduled', label: 'Scheduled', kind: 'scheduled' as const },
  { value: 'endpoint', label: 'Endpoint', kind: 'endpoint' as const },
  { value: 'bulk', label: 'Bulk', kind: 'bulk' as const },
  { value: 'client', label: 'Client validation', kind: 'client' as const },
]

const SUBJECTS = [
  { value: 'project', label: 'Projects' },
  { value: 'work-order', label: 'Work orders' },
  { value: 'customer', label: 'Customers' },
]

export function ScriptsWorkbench({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = React.useState(() => normalize(initial))

  async function request(payload: Record<string, unknown>): Promise<{ snapshot: Snapshot; run?: ScriptRun }> {
    const response = await fetch('/api/demo/scripts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json() as { snapshot: Snapshot; run?: ScriptRun; error?: string }
    if (!response.ok) throw new Error(data.error ?? 'Script request failed')
    const next = normalize(data.snapshot)
    setSnapshot(next)
    return { snapshot: next, run: data.run ? normalizeRun(data.run) : undefined }
  }

  return <ScriptStudio
    scripts={snapshot.scripts}
    runs={snapshot.runs}
    triggerOptions={TRIGGERS}
    subjectTypes={SUBJECTS}
    onSave={(value: ScriptEditorValue) => request({ action: 'save', value }).then(() => undefined)}
    onDelete={(id) => request({ action: 'delete', id }).then(() => undefined)}
    onRun={(id) => request({ action: 'run', id }).then((result) => result.run)}
  />
}

function normalize(snapshot: Snapshot): Snapshot {
  return {
    scripts: snapshot.scripts.map((script) => ({ ...script, nextRunAt: dateOrNull(script.nextRunAt), lastRunAt: dateOrNull(script.lastRunAt) })),
    runs: Object.fromEntries(Object.entries(snapshot.runs).map(([id, runs]) => [id, runs.map(normalizeRun)])),
  }
}

function normalizeRun(run: ScriptRun): ScriptRun { return { ...run, at: new Date(run.at) } }
function dateOrNull(value: Date | null): Date | null { return value ? new Date(value) : null }
