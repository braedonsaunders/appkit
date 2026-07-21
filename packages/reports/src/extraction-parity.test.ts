import assert from 'node:assert/strict'
import test from 'node:test'
import { augmentReportEntityWithCustomFields, buildCustomReportColumns, refineReportEntitiesForDocuments, type ReportEntity } from './index'

const records: ReportEntity = {
  key: 'records', label: 'Records', category: 'Operations', from: 'records', tenantColumn: 'records.tenant_id', defaultColumns: ['name'],
  columns: [
    { key: 'name', label: 'Name', kind: 'text', expression: 'records.name' },
    { key: 'owner_id', label: 'Owner ID', kind: 'uuid', expression: 'records.owner_id' },
    { key: 'metadata_dump', label: 'Metadata', kind: 'text', expression: 'records.metadata', arrayUnnest: 'jsonb' },
  ],
  relations: [{ via: 'owner_id', target: 'people', foreignColumn: 'id', label: 'Owner' }],
}
const people: ReportEntity = {
  key: 'people', label: 'People', category: 'Directory', from: 'people', tenantColumn: 'people.tenant_id', defaultColumns: ['first_name', 'last_name'],
  columns: [
    { key: 'first_name', label: 'First name', kind: 'text', expression: 'people.first_name' },
    { key: 'last_name', label: 'Last name', kind: 'text', expression: 'people.last_name' },
  ],
}

test('document refinement drops JSON and resolves related UUIDs to readable labels', () => {
  const [refined] = refineReportEntitiesForDocuments([records, people])
  assert.equal(refined?.columns.some((column) => column.key === 'metadata_dump'), false)
  const owner = refined?.columns.find((column) => column.key === 'owner_id')
  assert.equal(owner?.label, 'Owner')
  assert.match(owner?.expression ?? '', /last_name/)
})

test('custom fields compile to typed, allowlisted metadata columns and augment without duplicates', async () => {
  const columns = buildCustomReportColumns('records', [
    { key: 'score', label: 'Score', fieldType: 'number' },
    { key: 'bad-key', label: 'Bad', fieldType: 'text' },
  ])
  assert.equal(columns.length, 1)
  assert.match(columns[0]?.expression ?? '', /::numeric/)
  const augmented = await augmentReportEntityWithCustomFields(records, { async list() { return [{ key: 'score', label: 'Score', fieldType: 'number' }] } })
  assert.equal(augmented.columns.at(-1)?.key, 'cf_score')
})
