// Seed the public playground against a real Postgres. Idempotent: re-running
// keeps the tenant/users; the public demo never creates login credentials.
//
//   pnpm seed  # reads .env.local when present, otherwise the process environment

import {
  API_TENANT_TABLES,
  IDENTITY_TENANT_TABLES,
  PLATFORM_TENANT_TABLES,
  addMembership,
  apiKeys,
  assignRole,
  createDb,
  createTenant,
  createUser,
  findUserByEmail,
  installRlsSql,
  memberships,
  schema,
  seedRoles,
  tenants,
} from '@appkit/db'
import {
  DASHBOARD_TENANT_TABLES,
  insightCards,
  userDashboardLayouts,
} from '@appkit/dashboard/schema'
import { and, eq } from 'drizzle-orm'

const APP_URL = process.env.APPKIT_DB_URL
const SUPER_URL = process.env.APPKIT_SUPER_URL
if (!APP_URL || !SUPER_URL) {
  console.error('Set APPKIT_DB_URL and APPKIT_SUPER_URL')
  process.exit(1)
}
const appConnection = new URL(APP_URL)
const appRole = decodeURIComponent(appConnection.username)
const appPassword = decodeURIComponent(appConnection.password)
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(appRole) || !appPassword) {
  console.error('APPKIT_DB_URL must contain a valid Postgres role and password')
  process.exit(1)
}

const ADMIN_EMAIL = 'admin@appkit.dev'
const MEMBER_EMAIL = 'casey@appkit.dev'

async function main() {
  const { withSuperAdmin, superPool, pool } = createDb({ url: APP_URL!, superUrl: SUPER_URL!, schema })

  // 1. App role + grants + RLS policies (idempotent).
  const roleExists = await superPool.query(`select 1 from pg_roles where rolname = $1`, [appRole])
  if (roleExists.rowCount === 0) {
    await superPool.query(
      `create role ${quoteIdentifier(appRole)} login password ${quoteLiteral(appPassword)} nosuperuser nobypassrls`,
    )
  } else {
    await superPool.query(
      `alter role ${quoteIdentifier(appRole)} login password ${quoteLiteral(appPassword)} nosuperuser nobypassrls`,
    )
  }
  await superPool.query(`grant usage on schema public to ${quoteIdentifier(appRole)}`)
  await superPool.query(
    `grant select, insert, update, delete on all tables in schema public to ${quoteIdentifier(appRole)}`,
  )
  const rls = installRlsSql([...IDENTITY_TENANT_TABLES, ...PLATFORM_TENANT_TABLES, ...API_TENANT_TABLES, ...DASHBOARD_TENANT_TABLES])
  for (const stmt of rls.split(';')) {
    const s = stmt.trim()
    if (s) await superPool.query(s)
  }
  console.log('✓ RLS installed on', [...IDENTITY_TENANT_TABLES, ...PLATFORM_TENANT_TABLES, ...API_TENANT_TABLES, ...DASHBOARD_TENANT_TABLES].length, 'tables')

  await withSuperAdmin(async (sdb) => {
    // 2. Tenant.
    const [existingTenant] = await sdb.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, 'acme')).limit(1)
    const tenantId = existingTenant?.id ?? (await createTenant(sdb as never, { name: 'Acme Inc', slug: 'acme' })).id
    console.log(`✓ tenant Acme Inc (${tenantId})`)

    // The playground never accepts bearer credentials. Remove keys from older
    // seed runs so the persisted demo state cannot imply otherwise.
    await sdb.delete(apiKeys).where(eq(apiKeys.tenantId, tenantId))
    console.log('✓ API credentials cleared (authentication disabled)')

    // 3. Built-in roles.
    const roleIds = await seedRoles(sdb as never, tenantId, [
      { key: 'admin', name: 'Admin', permissions: ['team.read', 'team.manage'] },
      { key: 'member', name: 'Member', permissions: ['team.read'] },
    ])
    console.log('✓ roles admin/member')

    // 4. Users + memberships + role assignments.
    async function ensureUser(email: string, name: string, roleKey: 'admin' | 'member', isSuperAdmin: boolean) {
      const existing = await findUserByEmail(sdb as never, email)
      const userId =
        existing?.id ??
        (await createUser(sdb as never, { email, name, isSuperAdmin })).id
      const [m] = await sdb
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)))
        .limit(1)
      if (!m) {
        const { id: membershipId } = await addMembership(sdb as never, { tenantId, userId, displayName: name })
        await assignRole(sdb as never, { tenantId, membershipId, roleId: roleIds[roleKey]! })
      }
      return userId
    }
    const adminId = await ensureUser(ADMIN_EMAIL, 'Ada Lovelace', 'admin', true)
    await ensureUser(MEMBER_EMAIL, 'Casey Grant', 'member', false)
    console.log('✓ users + memberships')

    // 5. A real starter card library. These semantic queries are persisted in
    // the same format authored by CardStudio and run through the safe compiler.
    const starterCards = [
      {
        name: 'Members by role',
        description: 'Current workspace membership grouped by assigned role.',
        query: { source: 'members', dimensions: [{ field: 'role' }], measures: [{ fn: 'count' as const }], filters: [], limit: 100 },
        visualization: 'donut' as const,
        visualizationSettings: {},
        status: 'published' as const,
      },
      {
        name: 'Membership growth',
        description: 'Team members grouped by the month they joined.',
        query: { source: 'members', dimensions: [{ field: 'joined_at', bin: 'month' as const }], measures: [{ fn: 'count' as const }], filters: [], limit: 100 },
        visualization: 'line' as const,
        visualizationSettings: { showValues: true },
        status: 'published' as const,
      },
      {
        name: 'Recent audit activity',
        description: 'The latest tenant-scoped events from the append-only audit trail.',
        query: { source: 'audit', measures: [], dimensions: [], filters: [], limit: 20 },
        visualization: 'table' as const,
        visualizationSettings: {},
        status: 'published' as const,
      },
    ]
    const cardIds: string[] = []
    for (const card of starterCards) {
      const [existing] = await sdb.select({ id: insightCards.id }).from(insightCards).where(and(eq(insightCards.tenantId, tenantId), eq(insightCards.name, card.name))).limit(1)
      if (existing) {
        await sdb.update(insightCards).set({ ...card, ownerUserId: adminId, updatedAt: new Date() }).where(eq(insightCards.id, existing.id))
        cardIds.push(existing.id)
      } else {
        const [created] = await sdb.insert(insightCards).values({ tenantId, ownerUserId: adminId, ...card }).returning({ id: insightCards.id })
        cardIds.push(created!.id)
      }
    }
    const [dashboard] = await sdb.select({ id: userDashboardLayouts.id }).from(userDashboardLayouts).where(and(eq(userDashboardLayouts.tenantId, tenantId), eq(userDashboardLayouts.userId, adminId))).limit(1)
    if (!dashboard) {
      await sdb.insert(userDashboardLayouts).values({ tenantId, userId: adminId, isCustomized: false, sourceRole: 'admin', layout: { widgets: [
        { id: 'metric:members', x: 0, y: 0, w: 3, h: 2 },
        { id: 'metric:roles', x: 3, y: 0, w: 3, h: 2 },
        { id: 'metric:auth', x: 6, y: 0, w: 3, h: 2 },
        { id: 'metric:audit', x: 9, y: 0, w: 3, h: 2 },
        { id: `card:${cardIds[0]}`, x: 0, y: 2, w: 6, h: 5 },
        { id: `card:${cardIds[1]}`, x: 6, y: 2, w: 6, h: 5 },
        { id: 'panel:quick-actions', x: 0, y: 7, w: 4, h: 5 },
        { id: 'panel:platform', x: 4, y: 7, w: 8, h: 5 },
      ] } })
    }
    console.log('✓ dashboard + insight card library')
    console.log('')
    console.log('──────────────────────────────────────────────')
    console.log(`  demo user: ${ADMIN_EMAIL} (authentication disabled)`)
    console.log('──────────────────────────────────────────────')
  })

  await pool.end()
  await superPool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
