import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findActiveNavHref,
  selectMobileTabs,
  toBlocks,
  type SidebarNavGroup,
} from './sidebar-nav'

const groups: SidebarNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    iconKey: 'gauge',
    items: [
      { href: '/dashboard', label: 'Dashboard', iconKey: 'gauge', exact: true, mobile: true },
      { href: '/dashboard/settings', label: 'Settings', iconKey: 'settings' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    iconKey: 'activity',
    items: [
      {
        href: '/customers',
        label: 'Customers',
        iconKey: 'users',
        subgroup: 'Records',
        subgroupHref: '/records',
        subgroupIconKey: 'folder',
      },
      { href: '/invoices', label: 'Invoices', iconKey: 'file', subgroup: 'Records', mobile: true },
      { href: '/dashboard', label: 'Duplicate dashboard', iconKey: 'gauge' },
    ],
  },
]

test('active matching is greedy, exact-aware, and includes subgroup landing pages', () => {
  assert.equal(findActiveNavHref('/dashboard', groups), '/dashboard')
  assert.equal(findActiveNavHref('/dashboard/settings/profile', groups), '/dashboard/settings')
  assert.equal(findActiveNavHref('/records/123', groups), '/records')
})

test('subgroup folding coalesces interleaved declarations', () => {
  const blocks = toBlocks(groups[1]!.items)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0]!.kind, 'subgroup')
  if (blocks[0]!.kind === 'subgroup') {
    assert.equal(blocks[0]!.href, '/records')
    assert.deepEqual(
      blocks[0]!.items.map((item) => item.href),
      ['/customers', '/invoices'],
    )
  }
})

test('mobile tabs prioritize pins, deduplicate destinations, and preserve registry order', () => {
  assert.deepEqual(
    selectMobileTabs(groups, 4).map((item) => item.href),
    ['/dashboard', '/invoices', '/dashboard/settings', '/customers'],
  )
})
