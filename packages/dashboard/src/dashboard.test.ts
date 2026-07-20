import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessDashboardItem, normalizeDashboardLayout, normalizeQuickActions, reorderQuickActions, resolveDashboardLayout, type DashboardLibraryItem } from './index'

const library: DashboardLibraryItem[] = [{ id: 'one', label: 'One', description: '', category: 'general', defaultSize: { w: 4, h: 2 }, minSize: { w: 3, h: 2 }, maxSize: { w: 6, h: 4 } }]

test('layout resolution follows user, role, default precedence and clamps geometry', () => {
  const role = { widgets: [{ id: 'one', x: 11, y: -2, w: 20, h: 1 }], quickActions: [] }
  const resolved = resolveDashboardLayout({ role, fallback: { widgets: [] }, library })
  assert.equal(resolved.source, 'role')
  assert.deepEqual(resolved.layout.widgets[0], { id: 'one', x: 6, y: 0, w: 6, h: 2 })
})

test('layout normalization removes unknown and duplicate widgets', () => {
  const result = normalizeDashboardLayout({ widgets: [{ id: 'one', x: 0, y: 0, w: 4, h: 2 }, { id: 'one', x: 1, y: 1, w: 4, h: 2 }, { id: 'missing', x: 0, y: 0, w: 4, h: 2 }] }, library)
  assert.deepEqual(result.widgets.map((widget) => widget.id), ['one'])
})

test('access policy supports exact, wildcard, and role-tier rules', () => {
  assert.equal(canAccessDashboardItem({ permissions: ['reports.*'], roleTier: 2 }, { permission: 'reports.read', minimumRoleTier: 2 }), true)
  assert.equal(canAccessDashboardItem({ permissions: ['reports.read'], roleTier: 1 }, { permission: 'reports.read', minimumRoleTier: 2 }), false)
})

test('quick actions reject unsafe links, dedupe, cap, and reorder', () => {
  const actions = normalizeQuickActions([{ id: 'new', label: ' New record ', href: '/records?new=1', iconKey: 'plus', tone: '' }, { id: 'new', label: 'Duplicate', href: '/duplicate', iconKey: 'copy', tone: 'info' }, { id: 'bad', label: 'Bad', href: 'javascript:alert(1)', iconKey: 'x', tone: 'danger' }])
  assert.deepEqual(actions, [{ id: 'new', label: 'New record', href: '/records?new=1', iconKey: 'plus', tone: 'primary' }])
  assert.deepEqual(reorderQuickActions([...actions, { id: 'two', label: 'Two', href: '/two', iconKey: 'two', tone: 'info' }], 1, 0).map((item) => item.id), ['two', 'new'])
})
