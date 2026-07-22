import {
  refreshScheduledNextRuns,
  runBulkScript,
  runEndpointScript,
  runScheduledScript,
  runScript,
  runTriggerScripts,
  type ScriptContext,
  type ScriptDataAdapter,
  type ScriptIdentity,
  type ScriptRuntimeConfiguration,
  type ScriptStore,
  type ScriptTenant,
} from './index'

export interface BoundScriptRuntimeOptions<TContext extends { trigger: string }> {
  store: ScriptStore
  /** Resolve the package tenant key from the consuming application's context. */
  tenantId: (context: TContext) => string
  /** Load the display/runtime tenant shape for scheduled, bulk, and endpoint work. */
  tenant: (tenantId: string) => Promise<ScriptTenant> | ScriptTenant
  /** Build the consuming application's native context for jobs without an inbound context. */
  context: (input: { trigger: string; tenant: ScriptTenant; user?: ScriptIdentity; request?: NonNullable<ScriptContext['request']> }) => TContext
  /** Existing authored global name, supplied by the consuming application. */
  globalName: string
  subjectType?: (context: TContext) => string | null
  adapters?: (context: TContext) => ScriptDataAdapter | undefined
  hostValues?: (context: TContext) => Record<string, unknown>
  mutableFields?: Iterable<string>
}

/**
 * Bind AppKit's governed engine to an application's existing context and
 * persistence seam. The returned methods intentionally use positional service
 * signatures so a consuming application can replace its current runtime import
 * without rewriting every caller or authored script.
 */
export function createBoundScriptRuntime<TContext extends { trigger: string }>(options: BoundScriptRuntimeOptions<TContext>) {
  const runtime = (native: TContext): ScriptRuntimeConfiguration => ({
    globalName: options.globalName,
    sandboxInput: native,
    ...(options.hostValues ? { hostValues: options.hostValues(native) } : {}),
  })

  const coreContext = async (native: TContext): Promise<ScriptContext> => {
    const tenant = await options.tenant(options.tenantId(native))
    const candidate = native as TContext & { user?: ScriptIdentity; request?: NonNullable<ScriptContext['request']> }
    const subjectType = options.subjectType?.(native) ?? null
    return {
      trigger: native.trigger,
      tenant,
      ...(candidate.user ? { user: candidate.user } : {}),
      ...(candidate.request ? { request: candidate.request } : {}),
      ...(subjectType ? { subject: { type: subjectType, data: {} } } : {}),
    }
  }

  return {
    async runScript(source: string, context: TContext, timeoutMs: number) {
      const core = await coreContext(context)
      const outcome = await runScript({
        source,
        context: core,
        timeoutMs,
        adapters: options.adapters?.(context),
        mutableFields: options.mutableFields,
        ...runtime(context),
      })
      return withSetAlias(outcome)
    },
    async runTriggerScripts(trigger: string, context: TContext, targetId: string) {
      const native = { ...context, trigger } as TContext
      const core = await coreContext(native)
      const outcomes = await runTriggerScripts({
        store: options.store,
        context: core,
        targetId,
        adapters: options.adapters?.(native),
        mutableFields: options.mutableFields,
        runtime: () => runtime(native),
      })
      return outcomes.map(withSetAlias)
    },
    async runScheduledScript(scriptId: string, tenantId: string) {
      const tenant = await options.tenant(tenantId)
      const native = options.context({ trigger: 'scheduled', tenant })
      return withSetAlias(await runScheduledScript({ store: options.store, tenant, scriptId, adapters: options.adapters?.(native), runtime: () => runtime(native) }))
    },
    async runBulkScript(scriptId: string, tenantId: string) {
      const tenant = await options.tenant(tenantId)
      const native = options.context({ trigger: 'bulk', tenant })
      return withSetAlias(await runBulkScript({ store: options.store, tenant, scriptId, adapters: options.adapters?.(native), runtime: () => runtime(native) }))
    },
    async runEndpointScript(slug: string, tenantId: string, user: ScriptIdentity, request: NonNullable<ScriptContext['request']>) {
      const tenant = await options.tenant(tenantId)
      const native = options.context({ trigger: 'endpoint', tenant, user, request })
      const outcome = await runEndpointScript({ store: options.store, tenant, user, slug, request, adapters: options.adapters?.(native), runtime: () => runtime(native) })
      return outcome ? withSetAlias(outcome) : null
    },
    refreshScheduledNextRuns: (tenantId: string) => refreshScheduledNextRuns(options.store, tenantId),
  }
}

function withSetAlias<T extends { changes?: Record<string, unknown> }>(outcome: T): T & { set?: Record<string, unknown> } {
  return { ...outcome, ...(outcome.changes ? { set: outcome.changes } : {}) }
}
