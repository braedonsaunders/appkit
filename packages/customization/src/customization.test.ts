import assert from 'node:assert/strict'
import test from 'node:test'
import { createCustomizationRegistry, defaultFormLayout, defaultListView, extendRecordType, lintFormLayout, lintListView, validateCustomField, type RecordTypeMeta } from './index'

const records: RecordTypeMeta[] = [{ key: 'project', label: 'Project', pluralLabel: 'Projects', headerFields: [{ key: 'name', label: 'Name', kind: 'text', level: 'header', required: true }], lineFields: [{ key: 'description', label: 'Description', kind: 'text', level: 'line' }], columns: [{ key: 'name', label: 'Name', kind: 'text', defaultVisible: true }], filters: [{ key: 'name', label: 'Name', kind: 'text', operators: ['contains'] }], defaultSort: { key: 'name', direction: 'asc' } }]

test('app-supplied registry drives valid default form and list layouts', () => {
  const registry = createCustomizationRegistry(records)
  assert.deepEqual(lintFormLayout(defaultFormLayout('project', registry), registry), [])
  assert.deepEqual(lintListView(defaultListView('project', registry), registry), [])
})

test('custom fields extend forms, lists, and filters without mutating app metadata', () => {
  const registry = createCustomizationRegistry(records)
  const field = { key: 'bid_status', label: 'Bid status', recordType: 'project', level: 'header' as const, kind: 'select' as const, options: [{ value: 'open', label: 'Open' }] }
  assert.deepEqual(validateCustomField(field, registry), [])
  const extended = extendRecordType(records[0]!, [field])
  assert.equal(extended.headerFields.at(-1)?.key, 'custom.bid_status')
  assert.equal(records[0]!.headerFields.length, 1)
})
