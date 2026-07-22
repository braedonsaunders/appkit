import { runBulkScript, runScheduledScript, type ScriptDataAdapter, type ScriptStore, type ScriptTenant } from './index'

export interface ScriptJobData {
  tenantId: string
  scriptId: string
  kind: 'scheduled' | 'bulk'
  actorId?: string
}

/** Queue-neutral worker handler; BullMQ, serverless jobs, or a local worker can call the same function. */
export function createScriptJobHandler(options: {
  store: ScriptStore
  loadTenant: (tenantId: string) => Promise<ScriptTenant>
  adapters?: (tenantId: string, actorId?: string) => Promise<ScriptDataAdapter> | ScriptDataAdapter
}) {
  return async (job: ScriptJobData): Promise<{ status: string; durationMs: number }> => {
    const tenant = await options.loadTenant(job.tenantId)
    const adapters = await options.adapters?.(job.tenantId, job.actorId)
    const outcome = job.kind === 'bulk'
      ? await runBulkScript({ store: options.store, tenant, scriptId: job.scriptId, adapters })
      : await runScheduledScript({ store: options.store, tenant, scriptId: job.scriptId, adapters })
    return { status: outcome.status, durationMs: outcome.durationMs }
  }
}
