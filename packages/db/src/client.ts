import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'

// Tenant isolation via Postgres RLS. Every RLS-secured table's policy keys off
// `app.current_tenant`... no — `app.tenant_id` (see rls.ts). The GUC is applied
// per checked-out connection from an AsyncLocalStorage context. With no context
// set, `app.tenant_id` is '' → the policy matches no rows (deny-by-default), so
// an unscoped query is safe. Cross-tenant / system work uses `superDb`, a
// separate pool connected as a BYPASSRLS role — never a bypass branch in the
// policy (which would force Seq Scans).

export type TenantCtx = { tenantId: string | null; txDb?: NodePgDatabase<any> }

export type AppkitDb<TSchema extends Record<string, unknown>> = {
  /** Tenant-scoped handle. Inside `withTenant` routes to the pinned tx; otherwise
   *  the pool, which applies `app.tenant_id` from the active context per query. */
  db: NodePgDatabase<TSchema>
  /** BYPASSRLS handle for super-admin / system work that must span tenants. */
  superDb: NodePgDatabase<TSchema>
  pool: pg.Pool
  superPool: pg.Pool
  /** Scope pooled queries in `fn` to a tenant (no pinned transaction). */
  withTenantContext: <T>(tenantId: string, fn: () => Promise<T>) => Promise<T>
  /** One atomic transaction pinned to a tenant (RLS GUC set LOCAL). */
  withTenant: <T>(tenantId: string, fn: () => Promise<T>) => Promise<T>
  /** Run `fn` with the BYPASSRLS handle. Use intentionally. */
  withSuperAdmin: <T>(fn: (db: NodePgDatabase<TSchema>) => Promise<T>) => Promise<T>
  orgContext: AsyncLocalStorage<TenantCtx>
}

export function createDb<TSchema extends Record<string, unknown>>(opts: {
  url: string
  /** Connection string for a BYPASSRLS role (super-admin / system). Defaults to `url`. */
  superUrl?: string
  schema: TSchema
  poolConfig?: pg.PoolConfig
}): AppkitDb<TSchema> {
  const orgContext = new AsyncLocalStorage<TenantCtx>()

  const basePool = new pg.Pool({
    connectionString: opts.url,
    max: 10,
    keepAlive: true,
    ...opts.poolConfig,
  })
  basePool.on('error', (e) =>
    console.error('[appkit/db pool] transient client error (ignored):', (e as Error).message),
  )
  const superPool = new pg.Pool({ connectionString: opts.superUrl ?? opts.url, max: 4, keepAlive: true })
  superPool.on('error', (e) =>
    console.error('[appkit/db superPool] transient client error (ignored):', (e as Error).message),
  )

  const rawConnect = (): Promise<pg.PoolClient> =>
    (pg.Pool.prototype.connect as (...a: unknown[]) => Promise<pg.PoolClient>).call(basePool)

  async function applyTenant(client: pg.PoolClient, ctx: TenantCtx | undefined): Promise<void> {
    await client.query("select set_config('app.tenant_id', $1, false)", [ctx?.tenantId ?? ''])
  }

  // Wrap the pool so every drizzle query/transaction carries the RLS GUC from the
  // active AsyncLocalStorage context on a dedicated client.
  ;(basePool as unknown as { query: unknown }).query = async (text: unknown, params?: unknown) => {
    const ctx = orgContext.getStore()
    const client = await rawConnect()
    try {
      await applyTenant(client, ctx)
      return await client.query(text as string, params as unknown[])
    } finally {
      client.release()
    }
  }
  ;(basePool as unknown as { connect: unknown }).connect = async (cb?: unknown) => {
    const client = await rawConnect()
    await applyTenant(client, orgContext.getStore())
    if (typeof cb === 'function') {
      ;(cb as (e: unknown, c: pg.PoolClient, done: () => void) => void)(
        null,
        client,
        client.release.bind(client),
      )
      return
    }
    return client
  }

  const poolDb = drizzle(basePool, { schema: opts.schema })
  const superDb = drizzle(superPool, { schema: opts.schema })

  const db = new Proxy(poolDb, {
    get(target, prop, receiver) {
      const active = orgContext.getStore()?.txDb ?? target
      const value = Reflect.get(active as object, prop, receiver)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(active) : value
    },
  }) as typeof poolDb

  function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return orgContext.run({ tenantId }, fn)
  }

  async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const client = await rawConnect()
    try {
      await client.query('begin')
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId])
      const txDb = drizzle(client, { schema: opts.schema }) as unknown as NodePgDatabase<TSchema>
      const result = await orgContext.run({ tenantId, txDb }, fn)
      await client.query('commit')
      return result
    } catch (err) {
      try {
        await client.query('rollback')
      } catch {
        /* connection already broken */
      }
      throw err
    } finally {
      client.release()
    }
  }

  function withSuperAdmin<T>(fn: (db: NodePgDatabase<TSchema>) => Promise<T>): Promise<T> {
    return fn(superDb)
  }

  return { db, superDb, pool: basePool, superPool, withTenantContext, withTenant, withSuperAdmin, orgContext }
}
