import 'server-only'
import {
  computeNextRunAt,
  runBulkScript,
  runScheduledScript,
  type ScriptDefinition,
  type ScriptRun,
  type ScriptStore,
} from '@appkit/scripts'
import type { ScriptEditorValue } from '@appkit/scripts/react'

const TENANT_ID = '00000000-0000-0000-0000-000000000010'

interface ScriptState { scripts: ScriptDefinition[]; runs: ScriptRun[]; store: ScriptStore }
const processState = globalThis as typeof globalThis & { __appkitScriptsDemo?: ScriptState }

export function scriptsState(): ScriptState {
  if (processState.__appkitScriptsDemo) return processState.__appkitScriptsDemo
  const scripts = initialScripts()
  const runs: ScriptRun[] = []
  const store: ScriptStore = {
    async listForTrigger({ tenantId, triggerPoint, subjectType }) { return scripts.filter((script) => script.tenantId === tenantId && script.triggerPoint === triggerPoint && (!script.subjectType || script.subjectType === subjectType)) },
    async findById(tenantId, scriptId) { return scripts.find((script) => script.tenantId === tenantId && script.id === scriptId) ?? null },
    async findEndpoint(tenantId, slug) { return scripts.find((script) => script.tenantId === tenantId && script.endpointSlug === slug && script.kind === 'endpoint') ?? null },
    async listScheduled(tenantId) { return scripts.filter((script) => script.tenantId === tenantId && script.kind === 'scheduled' && script.isActive) },
    async recordRun(run) { runs.push({ ...run, id: run.id ?? crypto.randomUUID() }) },
    async updateSchedule(scriptId, update) { const script = scripts.find((item) => item.id === scriptId); if (script) Object.assign(script, update) },
  }
  processState.__appkitScriptsDemo = { scripts, runs, store }
  return processState.__appkitScriptsDemo
}

export function scriptsSnapshot() {
  const state = scriptsState()
  return {
    scripts: [...state.scripts].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    runs: Object.fromEntries(state.scripts.map((script) => [script.id, state.runs.filter((run) => run.scriptId === script.id).sort((left, right) => right.at.getTime() - left.at.getTime())])),
  }
}

export function saveDemoScript(value: ScriptEditorValue): void {
  const state = scriptsState()
  const existing = value.id ? state.scripts.find((script) => script.id === value.id) : null
  const definition: ScriptDefinition = {
    id: existing?.id ?? crypto.randomUUID(),
    tenantId: TENANT_ID,
    ...value,
    nextRunAt: value.kind === 'scheduled' && value.cron ? computeNextRunAt(value.cron, new Date(), value.timezone) : null,
    lastRunAt: existing?.lastRunAt ?? null,
  }
  if (existing) Object.assign(existing, definition)
  else state.scripts.push(definition)
}

export function deleteDemoScript(id: string): void {
  const state = scriptsState()
  const index = state.scripts.findIndex((script) => script.id === id)
  if (index < 0) throw new Error('script not found')
  state.scripts.splice(index, 1)
  for (let runIndex = state.runs.length - 1; runIndex >= 0; runIndex -= 1) {
    if (state.runs[runIndex]?.scriptId === id) state.runs.splice(runIndex, 1)
  }
}

export async function runDemoScript(id: string): Promise<ScriptRun> {
  const state = scriptsState()
  const definition = state.scripts.find((script) => script.id === id)
  if (!definition) throw new Error('script not found')
  const options = {
    store: state.store,
    tenant: { id: TENANT_ID, name: 'Public demo', timezone: 'America/Toronto' },
    scriptId: id,
    adapters: {
      async query() { return [{ id: 'job-1', status: 'approved', amount: 1840000 }, { id: 'job-2', status: 'approved', amount: 725000 }] },
      async load(type: string, recordId: string) { return { id: recordId, type, status: 'active' } },
      async search(type: string) { return [{ id: 'record-1', type, status: 'active' }] },
    },
  }
  if (definition.kind === 'bulk') await runBulkScript(options)
  else if (definition.kind === 'scheduled') await runScheduledScript(options)
  else throw new Error('only scheduled and bulk scripts can be run manually')
  const run = state.runs.filter((item) => item.scriptId === id).sort((left, right) => right.at.getTime() - left.at.getTime())[0]
  if (!run) throw new Error('script run was not recorded')
  return run
}

function initialScripts(): ScriptDefinition[] {
  const now = new Date()
  return [
    definition({
      id: 'review-policy', name: 'Review policy', kind: 'event', triggerPoint: 'before_save', subjectType: 'project', sortOrder: 10,
      source: `function main(ctx) {
  var value = Number(ctx.subject.data.contractValue || 0)
  app.log('checking contract value', value)
  if (value > 1000000 && !ctx.subject.data.executiveSponsor) app.abort('An executive sponsor is required above $1M')
  return { set: { reviewStatus: value > 500000 ? 'required' : 'standard' } }
}`,
    }),
    definition({
      id: 'morning-review', name: 'Morning review queue', kind: 'scheduled', triggerPoint: 'scheduled', subjectType: null, cron: '0 8 * * 1-5', nextRunAt: computeNextRunAt('0 8 * * 1-5', now, 'America/Toronto'), sortOrder: 20,
      source: `function main(ctx) {
  var rows = app.query('approved work requiring review')
  var total = rows.reduce(function(sum, row) { return sum + Number(row.amount || 0) }, 0)
  app.log('reviewed', rows.length, 'records for', ctx.tenant.name)
  return { records: rows.length, total: total }
}`,
    }),
    definition({
      id: 'portfolio-rollup', name: 'Portfolio rollup', kind: 'bulk', triggerPoint: 'bulk', subjectType: null, sortOrder: 30,
      source: `function main() {
  var rows = app.query('portfolio records')
  app.log('processed', rows.length, 'portfolio records')
  return { processed: rows.length }
}`,
    }),
    definition({
      id: 'status-endpoint', name: 'Status endpoint', kind: 'endpoint', triggerPoint: 'endpoint', subjectType: null, endpointSlug: 'status', sortOrder: 40,
      source: `function main(ctx) { app.log('endpoint', ctx.request.method); return { ok: true, received: ctx.request.body } }`,
    }),
    definition({
      id: 'form-validation', name: 'Form validation', kind: 'client', triggerPoint: 'client', subjectType: 'project', sortOrder: 50,
      source: `function main(ctx) {
  if (!ctx.value.name) return { abort: 'Project name is required' }
  return { warnings: Number(ctx.value.contractValue || 0) > 1000000 ? ['Confirm the executive sponsor'] : [] }
}`,
    }),
  ]
}

function definition(input: Partial<ScriptDefinition> & Pick<ScriptDefinition, 'id' | 'name' | 'kind' | 'triggerPoint' | 'source'>): ScriptDefinition {
  return {
    tenantId: TENANT_ID, subjectType: null, endpointSlug: null, cron: null, timezone: 'America/Toronto', nextRunAt: null,
    lastRunAt: null, timeoutMs: 2_000, unitBudget: 1_000, sortOrder: 100, isActive: true, ...input,
  }
}
