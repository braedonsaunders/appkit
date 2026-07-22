import cronParser from 'cron-parser'
import { abort, forbidden, runSandbox, type SandboxHostFunction, type SandboxLimits } from '@appkit/sandbox'

export const SCRIPT_KINDS = ['event', 'scheduled', 'endpoint', 'bulk', 'client'] as const
export type ScriptKind = (typeof SCRIPT_KINDS)[number]
export type ScriptRunStatus = 'ok' | 'aborted' | 'error' | 'timeout'

export interface ScriptIdentity {
  id: string
  name: string
  role?: string
}

export interface ScriptTenant {
  id: string
  name: string
  locale?: string
  timezone?: string
  metadata?: Record<string, unknown>
}

export interface ScriptContext {
  trigger: string
  tenant: ScriptTenant
  user?: ScriptIdentity
  subject?: { type: string; id?: string; data: Record<string, unknown>; lines?: Record<string, unknown>[] }
  request?: { method: string; path?: string; query: Record<string, string>; body: unknown }
  input?: unknown
}

export interface ScriptDefinition {
  id: string
  tenantId: string
  name: string
  kind: ScriptKind
  triggerPoint: string
  subjectType: string | null
  endpointSlug: string | null
  source: string
  cron: string | null
  timezone: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  timeoutMs: number
  unitBudget: number
  sortOrder: number
  isActive: boolean
}

export interface ScriptRun {
  id?: string
  tenantId: string
  scriptId: string
  targetType: string | null
  targetId: string | null
  status: ScriptRunStatus
  logs: string[]
  errorMessage: string | null
  returned?: unknown
  changes?: Record<string, unknown>
  units: number
  durationMs: number
  at: Date
}

export interface ScriptOutcome {
  status: ScriptRunStatus
  changes?: Record<string, unknown>
  returned?: unknown
  abortReason?: string
  logs: string[]
  units: number
  durationMs: number
}

export interface ScriptDataAdapter {
  /** Execute through a tenant-bound, read-only query surface. */
  query?(statement: string, options: { maxRows: number; timeoutMs: number }): Promise<unknown[]>
  load?(type: string, id: string): Promise<unknown>
  search?(type: string, filters: Record<string, unknown>, options: { limit: number }): Promise<unknown[]>
  /** App-defined, capability-scoped writes and service calls. */
  functions?: Record<string, { cost: number; handler: (args: unknown[], context: ScriptContext) => Promise<unknown> | unknown }>
}

export interface ScriptStore {
  listForTrigger(input: { tenantId: string; triggerPoint: string; subjectType?: string | null }): Promise<ScriptDefinition[]>
  findById(tenantId: string, scriptId: string): Promise<ScriptDefinition | null>
  findEndpoint(tenantId: string, slug: string): Promise<ScriptDefinition | null>
  listScheduled(tenantId: string): Promise<ScriptDefinition[]>
  recordRun(run: ScriptRun): Promise<void>
  updateSchedule(scriptId: string, input: { lastRunAt?: Date; nextRunAt?: Date | null }): Promise<void>
}

export interface RunScriptOptions extends SandboxLimits {
  definition?: Pick<ScriptDefinition, 'timeoutMs' | 'unitBudget'>
  source: string
  context: ScriptContext
  adapters?: ScriptDataAdapter
  /** Header/subject keys that a returned `{ set }` may change. */
  mutableFields?: Iterable<string>
  /** Defaults to triggers beginning with `before_`. */
  allowAbort?: boolean
  globalName?: string
  /** Preserve an existing authored context shape during a consuming-app cutover. */
  sandboxInput?: unknown
  /** Additional frozen values exposed on the configured sandbox global. */
  hostValues?: Record<string, unknown>
}

export type ScriptRuntimeConfiguration = Pick<RunScriptOptions, 'globalName' | 'sandboxInput' | 'hostValues'>

/** Execute one `main(ctx)` script with the production host API contract. */
export async function runScript(options: RunScriptOptions): Promise<ScriptOutcome> {
  const adapters = options.adapters ?? {}
  const context = options.context
  const globalName = options.globalName ?? 'app'
  const allowAbort = options.allowAbort ?? context.trigger.startsWith('before_')
  const functions: Record<string, SandboxHostFunction> = {
    abort: {
      cost: 0,
      handler: ([reason]) => {
        if (!allowAbort) forbidden(`abort is not permitted for trigger ${context.trigger}`)
        return abort(String(reason ?? 'script aborted'))
      },
    },
    query: {
      cost: 10,
      handler: ([statement]) => {
        if (!adapters.query) forbidden('read-only query capability is not granted')
        return adapters.query(String(statement), { maxRows: 5_000, timeoutMs: 5_000 })
      },
    },
    'record.load': {
      cost: 5,
      handler: ([type, id]) => {
        if (!adapters.load) forbidden('record load capability is not granted')
        return adapters.load(String(type), String(id))
      },
    },
    search: {
      cost: 10,
      handler: ([type, filters]) => {
        if (!adapters.search) forbidden('record search capability is not granted')
        return adapters.search(String(type), asRecord(filters), { limit: 1_000 })
      },
    },
  }
  for (const [name, definition] of Object.entries(adapters.functions ?? {})) {
    functions[name] = { cost: definition.cost, handler: (args) => definition.handler(args, context) }
  }

  const runtime = await runSandbox({
    source: options.source,
    entrypoint: 'main',
    input: options.sandboxInput ?? context,
    globalName,
    values: options.hostValues ?? { runtime: { tenant: context.tenant, trigger: context.trigger, user: context.user ?? null } },
    functions,
    timeoutMs: options.timeoutMs ?? options.definition?.timeoutMs,
    unitBudget: options.unitBudget ?? options.definition?.unitBudget,
    memoryBytes: options.memoryBytes,
    stackBytes: options.stackBytes,
  })

  if (runtime.status !== 'ok') {
    return {
      status: runtime.status === 'aborted' ? 'aborted' : runtime.status === 'timeout' ? 'timeout' : 'error',
      abortReason: runtime.error,
      logs: runtime.logs,
      units: runtime.units,
      durationMs: runtime.durationMs,
    }
  }

  const returned = runtime.value
  const proposed = isRecord(returned) && isRecord(returned.set) ? returned.set : undefined
  const changes: Record<string, unknown> = {}
  if (proposed) {
    const allowed = new Set(options.mutableFields ?? [])
    for (const [key, value] of Object.entries(proposed)) {
      if (!allowed.has(key)) {
        return {
          status: 'aborted',
          abortReason: `script tried to set non-whitelisted field "${key}"`,
          logs: runtime.logs,
          units: runtime.units,
          durationMs: runtime.durationMs,
        }
      }
      changes[key] = value
    }
  }
  return {
    status: 'ok',
    ...(Object.keys(changes).length ? { changes } : {}),
    returned,
    logs: runtime.logs,
    units: runtime.units,
    durationMs: runtime.durationMs,
  }
}

/** Run matching active scripts in deterministic order and stop on failure. */
export async function runTriggerScripts(options: {
  store: ScriptStore
  context: ScriptContext
  targetId?: string | null
  adapters?: ScriptDataAdapter
  mutableFields?: Iterable<string>
  runtime?: (context: ScriptContext) => ScriptRuntimeConfiguration
}): Promise<Array<ScriptOutcome & { scriptId: string; name: string }>> {
  const subjectType = options.context.subject?.type ?? null
  const definitions = await options.store.listForTrigger({
    tenantId: options.context.tenant.id,
    triggerPoint: options.context.trigger,
    subjectType,
  })
  const outcomes: Array<ScriptOutcome & { scriptId: string; name: string }> = []
  for (const definition of [...definitions].filter((item) => item.isActive).sort(compareScripts)) {
    const outcome = await runScript({
      source: definition.source,
      definition,
      context: options.context,
      adapters: options.adapters,
      mutableFields: options.mutableFields,
      ...options.runtime?.(options.context),
    })
    outcomes.push({ scriptId: definition.id, name: definition.name, ...outcome })
    await persistOutcome(options.store, definition, options.context, options.targetId ?? null, outcome)
    if (outcome.status !== 'ok') break
  }
  return outcomes
}

export async function runScheduledScript(options: {
  store: ScriptStore
  tenant: ScriptTenant
  scriptId: string
  adapters?: ScriptDataAdapter
  now?: Date
  runtime?: (context: ScriptContext) => ScriptRuntimeConfiguration
}): Promise<ScriptOutcome & { scriptId: string; name: string }> {
  const definition = await requireScript(options.store, options.tenant.id, options.scriptId)
  if (definition.kind !== 'scheduled') throw new Error('script is not scheduled')
  const context: ScriptContext = { trigger: definition.triggerPoint, tenant: options.tenant }
  const outcome = await runScript({ source: definition.source, definition, context, adapters: options.adapters, allowAbort: false, ...options.runtime?.(context) })
  const at = options.now ?? new Date()
  await persistOutcome(options.store, definition, context, null, outcome, at)
  await options.store.updateSchedule(definition.id, {
    lastRunAt: at,
    nextRunAt: definition.cron ? computeNextRunAt(definition.cron, at, definition.timezone) : null,
  })
  return { scriptId: definition.id, name: definition.name, ...outcome }
}

export async function runBulkScript(options: {
  store: ScriptStore
  tenant: ScriptTenant
  scriptId: string
  adapters?: ScriptDataAdapter
  runtime?: (context: ScriptContext) => ScriptRuntimeConfiguration
}): Promise<ScriptOutcome & { scriptId: string; name: string }> {
  const definition = await requireScript(options.store, options.tenant.id, options.scriptId)
  if (definition.kind !== 'bulk') throw new Error('script is not a bulk script')
  const context: ScriptContext = { trigger: definition.triggerPoint, tenant: options.tenant }
  const outcome = await runScript({ source: definition.source, context, adapters: options.adapters, timeoutMs: 15_000, unitBudget: Math.max(definition.unitBudget, 10_000), allowAbort: false, ...options.runtime?.(context) })
  await persistOutcome(options.store, definition, context, null, outcome)
  return { scriptId: definition.id, name: definition.name, ...outcome }
}

export async function runEndpointScript(options: {
  store: ScriptStore
  tenant: ScriptTenant
  user: ScriptIdentity
  slug: string
  request: NonNullable<ScriptContext['request']>
  adapters?: ScriptDataAdapter
  runtime?: (context: ScriptContext) => ScriptRuntimeConfiguration
}): Promise<(ScriptOutcome & { scriptId: string; name: string }) | null> {
  const definition = await options.store.findEndpoint(options.tenant.id, options.slug)
  if (!definition || !definition.isActive) return null
  const context: ScriptContext = { trigger: definition.triggerPoint, tenant: options.tenant, user: options.user, request: options.request }
  const outcome = await runScript({ source: definition.source, definition, context, adapters: options.adapters, allowAbort: false, ...options.runtime?.(context) })
  await persistOutcome(options.store, definition, context, null, outcome)
  return { scriptId: definition.id, name: definition.name, ...outcome }
}

export function computeNextRunAt(cron: string, from: Date = new Date(), timezone = 'UTC'): Date | null {
  try {
    return cronParser.parseExpression(cron, { currentDate: from, tz: timezone }).next().toDate()
  } catch {
    return null
  }
}

export async function refreshScheduledNextRuns(store: ScriptStore, tenantId: string, from = new Date()): Promise<void> {
  for (const script of await store.listScheduled(tenantId)) {
    await store.updateSchedule(script.id, { nextRunAt: script.cron ? computeNextRunAt(script.cron, from, script.timezone) : null })
  }
}

async function persistOutcome(
  store: ScriptStore,
  definition: ScriptDefinition,
  context: ScriptContext,
  targetId: string | null,
  outcome: ScriptOutcome,
  at = new Date(),
): Promise<void> {
  await store.recordRun({
    tenantId: context.tenant.id,
    scriptId: definition.id,
    targetType: context.subject?.type ?? definition.kind,
    targetId,
    status: outcome.status,
    logs: outcome.logs,
    errorMessage: outcome.status === 'ok' ? null : outcome.abortReason ?? outcome.status,
    returned: outcome.returned,
    changes: outcome.changes,
    units: outcome.units,
    durationMs: outcome.durationMs,
    at,
  })
  await store.updateSchedule(definition.id, { lastRunAt: at })
}

async function requireScript(store: ScriptStore, tenantId: string, scriptId: string): Promise<ScriptDefinition> {
  const script = await store.findById(tenantId, scriptId)
  if (!script) throw new Error('script not found')
  if (!script.isActive) throw new Error('script is disabled')
  return script
}

function compareScripts(left: ScriptDefinition, right: ScriptDefinition): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
