import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultFormLayout,
  lintFormLayout,
  mergeRegisteredFieldsIntoLayout,
  refreshDefaultFormLayout,
} from './schema'
import { createCustomizationRegistry } from './registry'
import type { RecordTypeMeta } from './types'
import { createCustomizationEngine } from './engine'

const project: RecordTypeMeta = {
  key: 'project',
  labelKey: 'records.project',
  category: 'entity',
  headerFields: [
    { key: 'name', labelKey: 'fields.name', level: 'header', kind: 'text', locked: true, defaultColSpan: 3 },
    { key: 'code', labelKey: 'fields.code', level: 'header', kind: 'text' },
    { key: 'project_type_id', labelKey: 'fields.type', level: 'header', kind: 'entity_ref', defaultColSpan: 2 },
    { key: 'customer_id', labelKey: 'fields.customer', level: 'header', kind: 'entity_ref', defaultColSpan: 2 },
    { key: 'status', labelKey: 'fields.status', level: 'header', kind: 'status' },
    { key: 'billing_method', labelKey: 'fields.billing', level: 'header', kind: 'select' },
    { key: 'contract_value', labelKey: 'fields.value', level: 'header', kind: 'currency' },
    { key: 'customer_po_number', labelKey: 'fields.po', level: 'header', kind: 'text' },
    { key: 'foreman_id', labelKey: 'fields.foreman', level: 'header', kind: 'entity_ref', defaultColSpan: 2 },
    { key: 'manager_id', labelKey: 'fields.manager', level: 'header', kind: 'entity_ref', defaultColSpan: 2 },
    { key: 'starts_on', labelKey: 'fields.starts', level: 'header', kind: 'date', defaultColSpan: 2 },
    { key: 'ends_on', labelKey: 'fields.ends', level: 'header', kind: 'date', defaultColSpan: 2 },
    { key: 'subsidiary_id', labelKey: 'fields.subsidiary', level: 'header', kind: 'entity_ref', defaultColSpan: 4 },
    { key: 'notes', labelKey: 'fields.notes', level: 'header', kind: 'long_text', defaultColSpan: 4 },
  ],
  lineFields: [],
  listColumns: [{ key: 'name', labelKey: 'fields.name', kind: 'reference', sortable: true, locked: true }],
  listFilters: [],
  formActions: [{ key: 'edit', labelKey: 'actions.edit' }],
}
const registry = createCustomizationRegistry([project])

test('the default project form composes complete four-column rows', () => {
  const layout = defaultFormLayout(project)
  const fields = layout.header.groups[0]!.fields

  assert.deepEqual(fields.map((field) => field.key), [
    'name',
    'code',
    'project_type_id',
    'customer_id',
    'status',
    'billing_method',
    'contract_value',
    'customer_po_number',
    'foreman_id',
    'manager_id',
    'starts_on',
    'ends_on',
    'subsidiary_id',
    'notes',
  ])

  const rowWidths: number[] = []
  let currentWidth = 0
  for (const field of fields) {
    const width = field.colSpan ?? 1
    if (currentWidth + width > 4) {
      rowWidths.push(currentWidth)
      currentWidth = 0
    }
    currentWidth += width
    if (currentWidth === 4) {
      rowWidths.push(currentWidth)
      currentWidth = 0
    }
  }
  if (currentWidth > 0) rowWidths.push(currentWidth)

  assert.deepEqual(rowWidths, [4, 4, 4, 4, 4, 4, 4])
  assert.deepEqual(lintFormLayout(layout, registry), [])
})

test('saved forms gain newly registered built-in fields in registry order', () => {
  const legacy = defaultFormLayout(project)
  legacy.header.groups[0]!.fields = legacy.header.groups[0]!.fields.filter((field) => field.key !== 'project_type_id')

  mergeRegisteredFieldsIntoLayout(legacy, project)

  const fields = legacy.header.groups[0]!.fields
  const projectTypeIndex = fields.findIndex((field) => field.key === 'project_type_id')
  assert.equal(projectTypeIndex, fields.findIndex((field) => field.key === 'code') + 1)
  assert.equal(fields[projectTypeIndex]!.colSpan, 2)
  assert.deepEqual(lintFormLayout(legacy, registry), [])
})

test('the baseline form upgrade refreshes built-in placement without losing field choices', () => {
  const legacy = defaultFormLayout(project)
  delete legacy.defaultLayoutVersion
  const primary = legacy.header.groups[0]!
  primary.fields = primary.fields.filter((field) => field.key !== 'project_type_id')
  const name = primary.fields.find((field) => field.key === 'name')!
  name.colSpan = 2
  const billing = primary.fields.find((field) => field.key === 'billing_method')!
  billing.visible = false
  billing.labelOverride = 'Billing basis'
  primary.fields.push({ key: 'cf_permit_number', visible: true, colSpan: 2 })

  refreshDefaultFormLayout(legacy, project)

  const fields = legacy.header.groups[0]!.fields
  assert.equal(legacy.defaultLayoutVersion, 1)
  assert.deepEqual(fields.slice(0, 4).map((field) => field.key), [
    'name',
    'code',
    'project_type_id',
    'customer_id',
  ])
  assert.equal(fields.find((field) => field.key === 'name')!.colSpan, 3)
  assert.equal(fields.find((field) => field.key === 'billing_method')!.visible, false)
  assert.equal(fields.find((field) => field.key === 'billing_method')!.labelOverride, 'Billing basis')
  assert.equal(fields.at(-1)!.key, 'cf_permit_number')
  assert.deepEqual(lintFormLayout(legacy, registry), [])
})

test('the registry rejects ambiguous application catalogues', () => {
  assert.throws(() => createCustomizationRegistry([project, project]), /duplicate record type key/)
  assert.throws(() => createCustomizationRegistry([{ ...project, headerFields: [project.headerFields[0]!, project.headerFields[0]!] }]), /duplicate project header field key/)
})

test('a bound engine preserves record-type-key calls for application cutovers', () => {
  const engine = createCustomizationEngine([project])
  const layout = engine.defaultFormLayout('project')
  assert.equal(engine.defaultListView('project').recordType, 'project')
  assert.deepEqual(engine.lintFormLayout(layout), [])
  assert.equal(engine.parseFormLayout(layout).success, true)
  assert.throws(() => engine.defaultListView('missing'), /unknown record type/)
})
