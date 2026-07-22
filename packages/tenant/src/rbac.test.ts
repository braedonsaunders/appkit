import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session'
import {
  assertCan,
  assertNotImpersonating,
  can,
  canAccessTemplate,
  canEditResponsePayload,
  ForbiddenError,
  ImpersonationBlockedError,
  PermissionCatalogueRequiredError,
  createMembershipAccessResolver,
  resolveMembershipAccess,
  widestScope,
  canSeeSite,
  type AccessCtx,
} from './rbac'

type Assignment = {
  roleId: string
  permissions: string[]
  scope: AccessCtx['scopes'][number]
}

function accessDb(
  assignments: Assignment[],
  overrides: Array<{ permission: string; effect: 'grant' | 'deny' }>,
): PgDatabase<PgQueryResultHKT, Record<string, unknown>> {
  return {
    select() {
      return {
        from() {
          return {
            innerJoin() {
              return { where: async () => assignments }
            },
            where: async () => overrides,
          }
        },
      }
    },
  } as unknown as PgDatabase<PgQueryResultHKT, Record<string, unknown>>
}

function ctx(perms: string[], opts?: Partial<AccessCtx>): AccessCtx {
  return { isSuperAdmin: false, permissions: new Set(perms), scopes: [{ type: 'tenant' }], ...opts }
}

test('exact permission match', () => {
  assert.equal(can(ctx(['ap.read']), 'ap.read'), true)
  assert.equal(can(ctx(['ap.read']), 'ap.write'), false)
})

test('module.* wildcard grants any action in the module, not others', () => {
  assert.equal(can(ctx(['ap.*']), 'ap.write'), true)
  assert.equal(can(ctx(['ap.*']), 'ap.read.all'), true)
  assert.equal(can(ctx(['ap.*']), 'ar.write'), false)
})

test('super-admin holds everything', () => {
  assert.equal(can(ctx([], { isSuperAdmin: true }), 'literally.anything'), true)
})

test('read tiers cascade all > site > self', () => {
  assert.equal(can(ctx(['incidents.read.all']), 'incidents.read.site'), true)
  assert.equal(can(ctx(['incidents.read.all']), 'incidents.read.self'), true)
  assert.equal(can(ctx(['incidents.read.site']), 'incidents.read.self'), true)
  assert.equal(can(ctx(['incidents.read.site']), 'incidents.read.all'), false)
  assert.equal(can(ctx(['incidents.read.self']), 'incidents.read.all'), false)
})

test('assertCan throws a typed ForbiddenError naming the permission', () => {
  assert.throws(
    () => assertCan(ctx([]), 'billing.manage'),
    (e) => e instanceof ForbiddenError && e.permission === 'billing.manage',
  )
})

test('widestScope picks tenant over sites over self', () => {
  assert.equal(widestScope(ctx([], { scopes: [{ type: 'self' }, { type: 'tenant' }] })).type, 'tenant')
  assert.equal(
    widestScope(ctx([], { scopes: [{ type: 'self' }, { type: 'sites', siteIds: ['a'] }] })).type,
    'sites',
  )
  assert.equal(widestScope(ctx([], { scopes: [] })).type, 'self')
})

test('widestScope preserves the complete source scope ordering', () => {
  assert.equal(widestScope(ctx([], { scopes: [{ type: 'people', personIds: ['p'] }, { type: 'team', departmentIds: ['d'], groupIds: [] }] })).type, 'team')
  assert.equal(widestScope(ctx([], { scopes: [{ type: 'crews', crewIds: ['c'] }, { type: 'sites', siteIds: ['s'] }] })).type, 'sites')
})

test('canSeeSite honors tenant + site scopes', () => {
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'tenant' }] }), 'site1'), true)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'sites', siteIds: ['site1'] }] }), 'site1'), true)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'sites', siteIds: ['other'] }] }), 'site1'), false)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'self' }], isSuperAdmin: true }), 'site1'), true)
})

test('impersonation guard and form access helpers preserve source behavior', () => {
  assert.throws(
    () => assertNotImpersonating({ impersonation: { actor: 'admin' } }, 'rotate key'),
    (error) => error instanceof ImpersonationBlockedError && error.action === 'rotate key',
  )
  const builder = ctx(['forms.template.create'])
  assert.equal(canAccessTemplate(builder, { status: 'draft', allowedRoles: null }, new Set(), 'builder-edit'), true)
  assert.equal(canAccessTemplate(ctx([]), { status: 'published', allowedRoles: ['operator'] }, new Set(['operator']), 'operate'), true)
  assert.equal(canEditResponsePayload({ ...ctx(['forms.response.update.own']), membership: { id: 'm1' } }, { status: 'draft', locked: false, submittedBy: 'm1' }), true)
  assert.equal(canEditResponsePayload({ ...ctx(['forms.response.update.own']), membership: { id: 'm1' } }, { status: 'draft', locked: true, submittedBy: 'm1' }), false)
})

test('membership access retains the production active-role positional contract', async () => {
  const db = accessDb(
    [
      { roleId: 'operator', permissions: ['records.read.self'], scope: { type: 'self' } },
      { roleId: 'manager', permissions: ['records.*'], scope: { type: 'tenant' } },
    ],
    [{ permission: 'reports.export', effect: 'grant' }],
  )
  const access = await resolveMembershipAccess(db, 'member-1', 'operator')
  assert.equal(access.appliedRoleId, 'operator')
  assert.deepEqual([...access.permissions].sort(), ['records.read.self', 'reports.export'])
  assert.deepEqual(access.scopes, [{ type: 'self' }])
})

test('a bound permission catalogue preserves concrete deny-over-wildcard behavior', async () => {
  const db = accessDb(
    [{ roleId: 'manager', permissions: ['records.*'], scope: { type: 'tenant' } }],
    [{ permission: 'records.delete', effect: 'deny' }],
  )
  const resolveAccess = createMembershipAccessResolver({
    permissionCatalogue: ['records.read.all', 'records.create', 'records.delete'],
  })
  const access = await resolveAccess(db, 'member-1')
  assert.deepEqual([...access.permissions].sort(), ['records.create', 'records.read.all'])
})

test('wildcard carve-outs fail closed when the application omitted its catalogue', async () => {
  const db = accessDb(
    [{ roleId: 'manager', permissions: ['records.*'], scope: { type: 'tenant' } }],
    [{ permission: 'records.delete', effect: 'deny' }],
  )
  await assert.rejects(
    () => resolveMembershipAccess(db, 'member-1'),
    (error) => error instanceof PermissionCatalogueRequiredError,
  )
})
