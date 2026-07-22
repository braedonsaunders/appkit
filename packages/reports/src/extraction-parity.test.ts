import assert from 'node:assert/strict'
import test from 'node:test'
import { augmentReportEntityWithCustomFields, buildCustomReportColumns, compileCustomReport, defaultColumnsFor, refineReportEntitiesForDocuments, reportColumnOptions, type ReportEntity } from './index'

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

test('the compiler consumes the production expression/org-scope catalogue shape directly', () => {
  const entity: ReportEntity = {
    key: 'entries', label: 'Entries', category: 'ledger', description: 'Ledger entries',
    from: 'entries e', orgColumn: 'e.org_id', defaultSort: { column: 'posted_on', direction: 'desc' },
    columns: [
      { key: 'posted_on', label: 'Posted on', kind: 'date', expr: 'e.posted_on' },
      { key: 'status', label: 'Status', kind: 'enum', expr: 'e.status', options: ['draft', 'posted'] },
    ],
  }
  const compiled = compileCustomReport({ entity: 'entries', columns: ['posted_on', 'status'], filters: { combinator: 'and', rules: [{ field: 'status', op: 'eq', value: 'posted' }] } }, 'org-1', { entities: [entity] })
  assert.match(compiled.sql, /e\.org_id = \$1/)
  assert.match(compiled.sql, /e\.status = \$2/)
  assert.deepEqual(defaultColumnsFor(entity), ['posted_on', 'status'])
  assert.deepEqual(reportColumnOptions(entity.columns[1]!), [{ value: 'draft', label: 'draft' }, { value: 'posted', label: 'posted' }])
})

test('the compiler consumes the production table/RLS catalogue shape directly', () => {
  const entity: ReportEntity = {
    key: 'incidents', label: 'Incidents', category: 'operations', description: 'Incidents', table: 'incidents', softDelete: true,
    columns: [
      { key: 'reference', label: 'Reference', kind: 'text' },
      { key: 'severity', label: 'Severity', kind: 'number', sql: 'actual_severity' },
    ],
  }
  const compiled = compileCustomReport({ entity: 'incidents', mode: 'summarize', columns: [], measures: [{ fn: 'avg', column: 'severity' }] }, 'tenant-1', { entities: [entity] })
  assert.match(compiled.sql, /FROM "incidents"/)
  assert.match(compiled.sql, /"incidents"\."tenant_id" = \$1/)
  assert.match(compiled.sql, /"incidents"\."deleted_at" IS NULL/)
  assert.match(compiled.sql, /avg\("incidents"\."actual_severity"\)/)
})
