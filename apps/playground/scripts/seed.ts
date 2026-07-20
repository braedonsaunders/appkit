// Seed the playground against a real Postgres. Idempotent: re-running keeps the
// tenant/users and mints a fresh API key (printed once).
//
//   APPKIT_DB_URL=... APPKIT_SUPER_URL=... pnpm exec tsx scripts/seed.ts

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
import { hashPassword } from '@appkit/auth'
import { generateApiKey } from '@appkit/api'
import { and, eq } from 'drizzle-orm'

const APP_URL = process.env.APPKIT_DB_URL
const SUPER_URL = process.env.APPKIT_SUPER_URL
if (!APP_URL || !SUPER_URL) {
  console.error('Set APPKIT_DB_URL and APPKIT_SUPER_URL')
  process.exit(1)
}

const ADMIN_EMAIL = 'admin@appkit.dev'
const MEMBER_EMAIL = 'casey@appkit.dev'
const PASSWORD = 'appkit-demo'

async function main() {
  const { withSuperAdmin, superPool, pool } = createDb({ url: APP_URL!, superUrl: SUPER_URL!, schema })

  // 1. App role + grants + RLS policies (idempotent).
  await superPool.query(
    `do $$ begin if not exists (select 1 from pg_roles where rolname='appkit_app') then create role appkit_app login password 'appkit' nosuperuser nobypassrls; end if; end $$;`,
  )
  await superPool.query(`grant usage on schema public to appkit_app`)
  await superPool.query(`grant select, insert, update, delete on all tables in schema public to appkit_app`)
  const rls = installRlsSql([...IDENTITY_TENANT_TABLES, ...PLATFORM_TENANT_TABLES, ...API_TENANT_TABLES])
  for (const stmt of rls.split(';')) {
    const s = stmt.trim()
    if (s) await superPool.query(s)
  }
  console.log('✓ RLS installed on', [...IDENTITY_TENANT_TABLES, ...PLATFORM_TENANT_TABLES, ...API_TENANT_TABLES].length, 'tables')

  await withSuperAdmin(async (sdb) => {
    // 2. Tenant.
    const [existingTenant] = await sdb.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, 'acme')).limit(1)
    const tenantId = existingTenant?.id ?? (await createTenant(sdb as never, { name: 'Acme Inc', slug: 'acme' })).id
    console.log(`✓ tenant Acme Inc (${tenantId})`)

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
        (await createUser(sdb as never, { email, name, passwordHash: hashPassword(PASSWORD), isSuperAdmin })).id
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

    // 5. A fresh API key (read-only) for the API reference's Try-it.
    const { token, hash } = generateApiKey()
    await sdb.insert(apiKeys).values({
      tenantId,
      name: 'playground demo key',
      keyHash: hash,
      permissions: ['team.read'],
      createdBy: adminId,
    })
    console.log('✓ API key minted')
    console.log('')
    console.log('──────────────────────────────────────────────')
    console.log(`  login:    ${ADMIN_EMAIL} / ${PASSWORD}`)
    console.log(`  member:   ${MEMBER_EMAIL} / ${PASSWORD}`)
    console.log(`  api key:  ${token}`)
    console.log('──────────────────────────────────────────────')
  })

  await pool.end()
  await superPool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
