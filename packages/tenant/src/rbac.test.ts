import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCan, can, ForbiddenError, widestScope, canSeeSite, type AccessCtx } from './rbac'

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

test('canSeeSite honors tenant + site scopes', () => {
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'tenant' }] }), 'site1'), true)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'sites', siteIds: ['site1'] }] }), 'site1'), true)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'sites', siteIds: ['other'] }] }), 'site1'), false)
  assert.equal(canSeeSite(ctx([], { scopes: [{ type: 'self' }], isSuperAdmin: true }), 'site1'), true)
})
