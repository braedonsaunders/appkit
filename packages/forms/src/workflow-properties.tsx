'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { FormSchemaV1, FormWorkflowStep } from '@appkit/forms-core'
import type { AppLocale } from '@appkit/i18n'
import { Button, Checkbox, Input, Label, Select } from '@appkit/ui'
import { readText, writeText } from './text'

function uniqueId(prefix: string, values: ReadonlySet<string>): string {
  let index = values.size + 1
  while (values.has(`${prefix}_${index}`)) index += 1
  return `${prefix}_${index}`
}

function emptyStep(existing: readonly FormWorkflowStep[]): FormWorkflowStep {
  return { key: uniqueId('step', new Set(existing.map((step) => step.key))), title: { en: 'New step' }, assignee: { type: 'expression', expr: '$submitter' } }
}

export function FormWorkflowEditor({ schema, locale, readOnly = false, onChange }: { schema: FormSchemaV1; locale: AppLocale; readOnly?: boolean; onChange: (steps: FormWorkflowStep[]) => void }) {
  const steps = schema.workflow?.steps ?? []
  const setStep = (index: number, patch: Partial<FormWorkflowStep>) => onChange(steps.map((step, candidate) => candidate === index ? { ...step, ...patch } : step))
  const move = (index: number, delta: -1 | 1) => { const target = index + delta; if (target < 0 || target >= steps.length) return; const next = [...steps]; [next[index], next[target]] = [next[target]!, next[index]!]; onChange(next) }
  return <section className="space-y-2"><div><h3 className="text-sm font-semibold text-fg">Guided workflow</h3><p className="mt-1 text-xs text-fg-muted">Build the ordered fill, review, and sign-off steps. Sections are assigned to these steps from section settings.</p></div><ul className="space-y-2">{steps.map((step, index) => <li key={step.key} className="rounded-md border border-border bg-surface p-2"><div className="flex items-start gap-2"><span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">{index + 1}</span><div className="min-w-0 flex-1 space-y-2"><div className="grid grid-cols-2 gap-2"><Field label="Title"><Input className="h-8 text-xs" value={readText(step.title, locale, step.key)} disabled={readOnly} onChange={(event) => setStep(index, { title: writeText(step.title, event.target.value, locale) })} /></Field><Field label="Step key"><Input className="h-8 font-mono text-xs" value={step.key} disabled /></Field></div><div className="grid grid-cols-2 gap-2"><Field label="Assignee"><Select value={step.assignee.type} disabled={readOnly} onChange={(event) => { const type = event.target.value; setStep(index, { assignee: type === 'literal' ? { type: 'literal', userId: '' } : type === 'role' ? { type: 'role', role: '' } : { type: 'expression', expr: '$submitter' } }) }}><option value="expression">Expression</option><option value="role">Role</option><option value="literal">Specific user</option></Select></Field><Field label="Value"><Input className="h-8 text-xs" disabled={readOnly} value={step.assignee.type === 'literal' ? step.assignee.userId : step.assignee.type === 'role' ? step.assignee.role : step.assignee.expr} onChange={(event) => { const value = event.target.value; setStep(index, { assignee: step.assignee.type === 'literal' ? { type: 'literal', userId: value } : step.assignee.type === 'role' ? { type: 'role', role: value } : { type: 'expression', expr: value } }) }} /></Field></div><label className="flex items-center gap-2 text-xs"><Checkbox checked={step.signatureRequired ?? false} disabled={readOnly} onChange={(event) => setStep(index, { signatureRequired: event.currentTarget.checked })} />Require signature</label></div><div className="flex flex-col gap-1"><Icon label="Move step up" disabled={readOnly || index === 0} onClick={() => move(index, -1)}><ArrowUp size={12} /></Icon><Icon label="Move step down" disabled={readOnly || index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12} /></Icon><Icon label="Delete step" disabled={readOnly || steps.length === 1} onClick={() => onChange(steps.filter((_, candidate) => candidate !== index))}><Trash2 size={12} /></Icon></div></div></li>)}</ul><Button variant="outline" disabled={readOnly} onClick={() => onChange([...steps, emptyStep(steps)])} className="w-full"><Plus size={14} />Add workflow step</Button></section>
}

export function FormTabsEditor({ schema, locale, readOnly = false, onChange }: { schema: FormSchemaV1; locale: AppLocale; readOnly?: boolean; onChange: (tabs: NonNullable<FormSchemaV1['tabs']> | undefined, sectionTabs: Record<string, string | undefined>) => void }) {
  const tabs = schema.tabs ?? []
  function commit(next: typeof tabs, assignments: Record<string, string | undefined> = Object.fromEntries(schema.sections.map((section) => [section.id, section.tabId]))) { onChange(next.length ? next : undefined, assignments) }
  function add() { const id = uniqueId('tab', new Set(tabs.map((tab) => tab.id))); const next = [...tabs, { id, title: writeText(undefined, `Tab ${tabs.length + 1}`, locale) }]; const assignments = Object.fromEntries(schema.sections.map((section) => [section.id, section.tabId ?? (tabs.length === 0 ? id : undefined)])); commit(next, assignments) }
  return <section className="space-y-2 border-b border-border pb-4"><div><h3 className="text-sm font-semibold text-fg">App pages</h3><p className="mt-1 text-xs text-fg-muted">Optional top-level tabs organize sections into pages without changing the workflow.</p></div>{tabs.map((tab, index) => <div key={tab.id} className="flex gap-1"><Input value={readText(tab.title, locale, tab.id)} disabled={readOnly} onChange={(event) => commit(tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, title: writeText(candidate.title, event.target.value, locale) } : candidate))} /><Icon label="Delete tab" disabled={readOnly} onClick={() => { const next = tabs.filter((candidate) => candidate.id !== tab.id); const fallback = next[0]?.id; commit(next, Object.fromEntries(schema.sections.map((section) => [section.id, section.tabId === tab.id ? fallback : section.tabId]))) }}><Trash2 size={13} /></Icon>{index === 0 ? null : <span className="sr-only">Tab {index + 1}</span>}</div>)}<Button variant="outline" size="sm" disabled={readOnly} onClick={add}><Plus size={12} />Add page</Button></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-[10px]">{label}</Label>{children}</div> }
function Icon({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-30">{children}</button> }
