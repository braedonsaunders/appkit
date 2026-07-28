import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDefaultNavigationConfig,
  isTenantNavigationConfig,
  reconcileNavigationConfig,
  resolveNavigationItems,
  stampKnownNavigationItems,
  type NavigationRegistryItem,
} from './navigation-config'

const registry: NavigationRegistryItem[] = [
  { key: 'home', label: 'Home', required: true },
  { key: 'quotes', label: 'Quotes' },
  { key: 'settings', label: 'Settings', required: true },
]

test('saved order and visibility resolve against registry metadata', () => {
  const resolved = resolveNavigationItems(registry, {
    version: 1,
    items: [
      { key: 'quotes', hidden: true },
      { key: 'home', hidden: true },
      { key: 'settings' },
    ],
  })

  assert.deepEqual(
    resolved.map((item) => [item.key, item.hidden]),
    [
      ['quotes', true],
      ['home', false],
      ['settings', false],
    ],
  )
})

test('newly shipped items append but intentionally omitted known items stay omitted', () => {
  const reconciled = reconcileNavigationConfig(
    {
      version: 1,
      items: [{ key: 'home' }],
      knownItemKeys: ['home', 'quotes'],
    },
    registry,
  )

  assert.deepEqual(
    reconciled.items.map((item) => item.key),
    ['home', 'settings'],
  )
})

test('required items are restored and cannot remain hidden', () => {
  const reconciled = reconcileNavigationConfig(
    {
      version: 1,
      items: [{ key: 'home', hidden: true }],
      knownItemKeys: registry.map((item) => item.key),
    },
    registry,
  )

  assert.deepEqual(reconciled.items, [{ key: 'home' }, { key: 'settings' }])
})

test('stamping records the complete current registry', () => {
  const stamped = stampKnownNavigationItems(buildDefaultNavigationConfig(registry), registry)
  assert.deepEqual(stamped.knownItemKeys, ['home', 'quotes', 'settings'])
})

test('runtime validation rejects malformed persisted state', () => {
  assert.equal(
    isTenantNavigationConfig({ version: 1, items: [{ key: 'quotes', hidden: true }] }),
    true,
  )
  assert.equal(isTenantNavigationConfig({ version: 1, items: [{ key: 4 }] }), false)
  assert.equal(isTenantNavigationConfig({ version: 2, items: [] }), false)
})
