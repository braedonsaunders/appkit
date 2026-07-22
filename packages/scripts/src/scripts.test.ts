import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeNextRunAt, runScript, runTriggerScripts, type ScriptDefinition, type ScriptRun, type ScriptStore } from './index'
import { createBoundScriptRuntime } from './bound'

const context = {
  trigger: 'before_save',
  tenant: { id: 'tenant-1', name: 'Acme' },
  subject: { type: 'order', id: 'order-1', data: { total: 20 } },
}

test('preserves the source script contract: query, log, abort, and whitelisted set', async () => {
  const result = await runScript({
    source: `function main(ctx) {
      const rows = app.query('approved');
      app.log('rows', rows.length);
      if (ctx.subject.data.total > 10) return { set: { review: true } };
    }`,
    context,
    mutableFields: ['review'],
    adapters: { query: async () => [{ id: 1 }] },
  })
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.changes, { review: true })
  assert.deepEqual(result.logs, ['rows 1'])

  const denied = await runScript({
    source: 'function main() { return { set: { total: 0 } } }',
    context,
    mutableFields: ['review'],
  })
  assert.equal(denied.status, 'aborted')
  assert.match(denied.abortReason!, /non-whitelisted/)
})

test('runs trigger scripts in order, audits every result, and stops after a veto', async () => {
  const runs: ScriptRun[] = []
  const definitions: ScriptDefinition[] = [
    definition('second', 20, 'function main() { app.abort("no") }'),
    definition('first', 10, 'function main() { app.log("first") }'),
    definition('third', 30, 'function main() { app.log("never") }'),
  ]
  const store = memoryStore(definitions, runs)
  const outcomes = await runTriggerScripts({ store, context })
  assert.deepEqual(outcomes.map((item) => item.name), ['first', 'second'])
  assert.equal(runs.length, 2)
  assert.equal(runs[1]?.status, 'aborted')
})

test('computes timezone-aware cron ticks and rejects malformed expressions', () => {
  const next = computeNextRunAt('0 9 * * *', new Date('2026-01-01T12:00:00Z'), 'America/Toronto')
  assert.equal(next?.toISOString(), '2026-01-01T14:00:00.000Z')
  assert.equal(computeNextRunAt('not cron'), null)
})

test('binds an existing positional runtime contract without changing authored globals or context', async () => {
  type NativeContext = { trigger: string; organization: { id: string; name: string } }
  const runtime = createBoundScriptRuntime<NativeContext>({
    store: memoryStore([], []),
    tenantId: (native) => native.organization.id,
    tenant: (id) => ({ id, name: 'Acme' }),
    context: ({ trigger, tenant }) => ({ trigger, organization: { id: tenant.id, name: tenant.name } }),
    globalName: 'suite',
    hostValues: (native) => ({ runtime: { organization: native.organization, trigger: native.trigger } }),
  })
  const result = await runtime.runScript(
    'function main(ctx) { suite.log(ctx.organization.name); return suite.runtime.organization.id }',
    { trigger: 'manual', organization: { id: 'tenant-1', name: 'Acme' } },
    2_000,
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.returned, 'tenant-1')
  assert.deepEqual(result.logs, ['Acme'])
})

function definition(name: string, sortOrder: number, source: string): ScriptDefinition {
  return {
    id: name,
    tenantId: 'tenant-1',
    name,
    kind: 'event',
    triggerPoint: 'before_save',
    subjectType: null,
    endpointSlug: null,
    source,
    cron: null,
    timezone: 'UTC',
    nextRunAt: null,
    lastRunAt: null,
    timeoutMs: 2_000,
    unitBudget: 1_000,
    sortOrder,
    isActive: true,
  }
}

function memoryStore(definitions: ScriptDefinition[], runs: ScriptRun[]): ScriptStore {
  return {
    async listForTrigger() { return definitions },
    async findById(_tenantId, scriptId) { return definitions.find((item) => item.id === scriptId) ?? null },
    async findEndpoint(_tenantId, slug) { return definitions.find((item) => item.endpointSlug === slug) ?? null },
    async listScheduled() { return definitions.filter((item) => item.kind === 'scheduled') },
    async recordRun(run) { runs.push(run) },
    async updateSchedule() { return undefined },
  }
}
