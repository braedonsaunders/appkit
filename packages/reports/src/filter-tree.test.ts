import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultOperatorForColumn } from './filter-tree'

test('catalog-backed dimensions start as searchable multi-select filters', () => {
  assert.equal(
    defaultOperatorForColumn({
      key: 'course_name',
      label: 'Course',
      kind: 'text',
      filterOptions: [
        { value: 'Confined Space', label: 'CS-100 — Confined Space' },
        { value: 'WHMIS', label: 'WHMIS — WHMIS' },
      ],
    }),
    'in',
  )
})

test('free-form columns retain scalar filtering', () => {
  assert.equal(
    defaultOperatorForColumn({ key: 'reference', label: 'Reference', kind: 'text' }),
    'eq',
  )
})
