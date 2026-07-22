import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyNotificationInboxDelta,
  buildNotificationInboxFolders,
  filterNotificationInboxItems,
  type NotificationInboxItem,
} from './inbox'

const items: NotificationInboxItem[] = [
  {
    id: 'one',
    title: 'Inspection assigned',
    body: 'Complete the weekly inspection',
    category: 'inspections',
    linkPath: '/inspections/one',
    isCritical: true,
    occurredAt: '2026-07-20T14:00:00.000Z',
    read: false,
  },
  {
    id: 'two',
    title: 'Report ready',
    body: null,
    category: 'reports',
    linkPath: '/reports/two',
    isCritical: false,
    occurredAt: '2026-07-19T14:00:00.000Z',
    read: true,
  },
]

test('builds smart-folder and category counts', () => {
  assert.deepEqual(buildNotificationInboxFolders(items, 3), {
    total: 2,
    unread: 1,
    criticalTotal: 1,
    criticalUnread: 1,
    todos: 3,
    categories: [
      { category: 'inspections', total: 1, unread: 1 },
      { category: 'reports', total: 1, unread: 0 },
    ],
  })
})

test('filters smart folders, categories, and search text', () => {
  assert.deepEqual(filterNotificationInboxItems(items, { kind: 'unread' }).map((item) => item.id), ['one'])
  assert.deepEqual(filterNotificationInboxItems(items, { kind: 'critical' }).map((item) => item.id), ['one'])
  assert.deepEqual(filterNotificationInboxItems(items, { kind: 'category', category: 'reports' }).map((item) => item.id), ['two'])
  assert.deepEqual(filterNotificationInboxItems(items, { kind: 'all', q: 'weekly' }).map((item) => item.id), ['one'])
})

test('applies exact optimistic deltas without mutating the previous folders', () => {
  const folders = buildNotificationInboxFolders(items)
  const read = applyNotificationInboxDelta(folders, items[0]!, 'read')
  assert.equal(read.unread, 0)
  assert.equal(read.criticalUnread, 0)
  assert.equal(read.categories[0]?.unread, 0)
  assert.equal(folders.unread, 1)

  const removed = applyNotificationInboxDelta(folders, items[0]!, 'delete')
  assert.equal(removed.total, 1)
  assert.equal(removed.criticalTotal, 0)
  assert.deepEqual(removed.categories, [{ category: 'reports', total: 1, unread: 0 }])
})
