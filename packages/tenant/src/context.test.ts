import test from 'node:test'
import assert from 'node:assert/strict'
import { createTenantContextFactory, type RequestContextArgs } from './context'

type Database = { name: string }
type ApplicationContext = { personId: string | null }

const args: RequestContextArgs<ApplicationContext> = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  isSuperAdmin: false,
  timezone: 'America/Toronto',
  locale: 'fr',
  defaultLocale: 'en',
  enabledLocales: ['en', 'fr'],
  localeOverride: 'fr',
  membership: { id: 'membership-1', displayName: 'Ada' },
  personId: 'person-1',
  permissions: new Set(['records.read.all']),
  scopes: [{ type: 'tenant' }],
}

test('portable context factory preserves the production call shape and app extension', async () => {
  const calls: string[] = []
  const factory = createTenantContextFactory<Database>({
    async withTenant(baseDb, tenantId, fn) {
      calls.push(`tenant:${tenantId}`)
      return fn(baseDb)
    },
    async withSuperAdmin(baseDb, fn) {
      calls.push('super-admin')
      return fn(baseDb)
    },
  })
  const baseDb = { name: 'primary' }
  const context = factory.makeTenantContext(baseDb, args)
  assert.equal(context.personId, 'person-1')
  assert.equal(context.locale, 'fr')
  assert.equal(await context.db(async (db) => db.name), 'primary')

  const superAdmin = factory.makeSuperAdminContext(baseDb, 'admin-1')
  assert.equal(await superAdmin.db(async (db) => db.name), 'primary')
  assert.deepEqual(calls, ['tenant:tenant-1', 'super-admin'])
})
