// Real Postgres RLS isolation test. Skipped unless APPKIT_SUPER_URL (a superuser
// connection) is set. Proves tenant isolation end-to-end: creates a NON-superuser
// role (superusers bypass RLS), installs the policies, seeds two tenants, and
// asserts a tenant-scoped query only ever sees its own rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { createDb } from './client'
import { installRlsSql } from './rls'
import * as schema from './schema'
import { memberships, tenants, users, IDENTITY_TENANT_TABLES } from './index'

const SUPER_URL = process.env.APPKIT_SUPER_URL
const APP_URL = process.env.APPKIT_APP_URL

test('Postgres RLS isolates tenants end-to-end', { skip: !SUPER_URL || !APP_URL }, async () => {
  const superPool = new pg.Pool({ connectionString: SUPER_URL })
  const admin = async (sql: string) => {
    await superPool.query(sql)
  }

  // Fresh slate + a NON-superuser, NON-bypassrls app role bound by the policy.
  await admin(
    `do $$ begin if exists (select 1 from pg_roles where rolname='appkit_app') then execute 'drop owned by appkit_app'; execute 'drop role appkit_app'; end if; end $$;`,
  )
  await admin(`create role appkit_app login password 'appkit' nosuperuser nobypassrls`)
  await admin(`grant usage on schema public to appkit_app`)
  await admin(`grant select, insert, update, delete on all tables in schema public to appkit_app`)
  // Install the RLS policies on the identity tenant tables.
  for (const stmt of installRlsSql([...IDENTITY_TENANT_TABLES]).split(';')) {
    const s = stmt.trim()
    if (s) await admin(s)
  }

  const { db, superDb, withTenantContext, withTenant, withSuperAdmin, pool, superPool: sp } =
    createDb({ url: APP_URL!, superUrl: SUPER_URL!, schema })

  try {
    // Seed via superDb (BYPASSRLS): two tenants, a user + membership in each.
    await withSuperAdmin(async (sdb) => {
      await sdb.delete(memberships)
      await sdb.delete(users)
      await sdb.delete(tenants)
    })
    const [tenantA, tenantB, userA, userB] = await withSuperAdmin(async (sdb) => {
      const [a] = await sdb.insert(tenants).values({ name: 'Alpha', slug: 'alpha' }).returning({ id: tenants.id })
      const [b] = await sdb.insert(tenants).values({ name: 'Bravo', slug: 'bravo' }).returning({ id: tenants.id })
      const [ua] = await sdb.insert(users).values({ email: 'a@x.com', name: 'A' }).returning({ id: users.id })
      const [ub] = await sdb.insert(users).values({ email: 'b@x.com', name: 'B' }).returning({ id: users.id })
      await sdb.insert(memberships).values({ tenantId: a!.id, userId: ua!.id, displayName: 'A' })
      await sdb.insert(memberships).values({ tenantId: b!.id, userId: ub!.id, displayName: 'B' })
      return [a!.id, b!.id, ua!.id, ub!.id] as const
    })
    void userA
    void userB

    // Scoped to tenant A → sees ONLY A's membership.
    const seenByA = await withTenantContext(tenantA, () => db.select().from(memberships))
    assert.equal(seenByA.length, 1)
    assert.equal(seenByA[0]!.tenantId, tenantA)

    // Scoped to tenant B → sees ONLY B's.
    const seenByB = await withTenantContext(tenantB, () => db.select().from(memberships))
    assert.equal(seenByB.length, 1)
    assert.equal(seenByB[0]!.tenantId, tenantB)

    // No tenant context → deny-by-default, zero rows.
    const seenUnscoped = await db.select().from(memberships)
    assert.equal(seenUnscoped.length, 0)

    // superDb (BYPASSRLS) sees everything.
    const seenBySuper = await superDb.select().from(memberships)
    assert.equal(seenBySuper.length, 2)

    // A cross-tenant WRITE is refused by the WITH CHECK clause. drizzle wraps the
    // pg error, so the RLS message rides on `.cause`.
    await assert.rejects(
      () => withTenant(tenantA, () => db.insert(memberships).values({ tenantId: tenantB, userId: userA, displayName: 'X' })),
      (e: unknown) => {
        const cause = (e as { cause?: { message?: string; code?: string } }).cause
        return /row-level security|violates/i.test(cause?.message ?? '') || cause?.code === '42501'
      },
    )

    // And an UPDATE scoped to A cannot touch B's row (0 rows matched).
    const updated = await withTenantContext(tenantA, () =>
      db.update(memberships).set({ displayName: 'hacked' }).where(eq(memberships.tenantId, tenantB)).returning({ id: memberships.id }),
    )
    assert.equal(updated.length, 0)
  } finally {
    await pool.end().catch(() => {})
    await sp.end().catch(() => {})
    await superPool.end().catch(() => {})
  }
})
