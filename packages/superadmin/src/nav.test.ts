import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlatformNav,
  isPlatformPath,
  selectPlatformNav,
} from './nav'

test('createPlatformNav builds the Beacon module set by default', () => {
  const nav = createPlatformNav()
  assert.equal(nav.basePath, '/platform')
  assert.equal(nav.groups.length, 1)
  assert.equal(nav.groups[0]?.label, 'Platform')
  assert.deepEqual(
    nav.groups[0]?.items.map((item) => item.href),
    [
      '/platform',
      '/platform/tenants',
      '/platform/tenants/new',
      '/platform/users',
      '/platform/email',
      '/platform/sms',
      '/platform/ai',
      '/platform/feedback',
      '/platform/email-log',
      '/platform/sms-log',
      '/platform/database',
    ],
  )
  assert.equal(nav.groups[0]?.items[0]?.exact, true)
  assert.ok(nav.tiles.some((tile) => tile.id === 'tenants'))
  assert.ok(!nav.tiles.some((tile) => tile.id === 'overview'))
})

test('createPlatformNav honours a subset, extras, labels, and a workspace return', () => {
  const nav = createPlatformNav({
    modules: ['overview', 'tenants', 'users', 'emailLog'],
    extras: [
      {
        id: 'access',
        href: '/platform/access',
        label: 'Cross-org access',
        description: 'Acting-user grants',
        iconKey: 'key',
      },
    ],
    labels: { tenants: 'Organizations', workspace: 'Organization workspace' },
    workspaceHref: '/',
  })
  assert.deepEqual(
    nav.groups[0]?.items.map((item) => item.label),
    ['Overview', 'Organizations', 'Users', 'Email log', 'Cross-org access', 'Organization workspace'],
  )
  assert.equal(nav.tiles.find((tile) => tile.id === 'tenants')?.title, 'Organizations')
  assert.ok(nav.tiles.some((tile) => tile.id === 'access'))
})

test('isPlatformPath and selectPlatformNav swap only under the console root', () => {
  const tenant = [{ id: 'tenant' }]
  const platform = [{ id: 'platform' }]
  assert.equal(isPlatformPath('/platform'), true)
  assert.equal(isPlatformPath('/platform/users'), true)
  assert.equal(isPlatformPath('/admin'), false)
  assert.equal(isPlatformPath('/platforms'), false)
  assert.deepEqual(selectPlatformNav('/platform/users', tenant, platform), platform)
  assert.deepEqual(selectPlatformNav('/dashboard', tenant, platform), tenant)
})
