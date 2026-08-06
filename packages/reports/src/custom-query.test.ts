import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertScheduleFilters,
  compileCustomReport,
  createReportDefinitionRegistry,
  customReportResult,
  defaultColumnsFor,
  formatExactReportNumber,
  resolveReportLayout,
  validateScheduleRecipients,
  type ReportEntityCatalog,
} from './index'

const catalog: ReportEntityCatalog = { entities: [{
  key: 'records', label: 'Records', category: 'Operations', from: 'records r', tenantColumn: 'r.tenant_id',
  columns: [
    { key: 'created_at', label: 'Created at', kind: 'timestamp', expression: 'r.created_at' },
    { key: 'status', label: 'Status', kind: 'enum', expression: 'r.status' },
    { key: 'amount', label: 'Amount', kind: 'number', expression: 'r.amount' },
  ],
  defaultColumns: ['created_at', 'status', 'amount'], defaultSort: { column: 'created_at', direction: 'desc' },
}] }

test('row report compiler scopes the tenant and binds every authored value', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'rows', columns: ['created_at', 'status'], filters: { combinator: 'and', rules: [{ field: 'status', op: 'contains', value: 'open' }] }, sort: { column: 'created_at', direction: 'desc' } }, 'tenant-1', catalog)
  assert.deepEqual(compiled.params, ['tenant-1', '%open%'])
  assert.match(compiled.sql, /r\.tenant_id = \$1/)
  assert.match(compiled.sql, /r\.status::text ILIKE \$2/)
  assert.doesNotMatch(compiled.sql, /open/)
})

test('internal columns support authored scope filters but never custom report output', () => {
  const entity = {
    ...catalog.entities[0]!,
    columns: [
      ...catalog.entities[0]!.columns,
      {
        key: 'template_id',
        label: 'Template ID',
        kind: 'uuid' as const,
        expression: 'r.template_id',
        hidden: true,
      },
    ],
    defaultColumns: ['created_at', 'template_id', 'status'],
    baseFilter: {
      combinator: 'and' as const,
      rules: [{ field: 'template_id', op: 'eq' as const, value: 'template-1' }],
    },
  }
  assert.deepEqual(defaultColumnsFor(entity), ['created_at', 'status'])
  const compiled = compileCustomReport(
    { entity: 'records', mode: 'rows', columns: ['status'] },
    'tenant-1',
    { entities: [entity] },
  )
  assert.match(compiled.sql, /r\.template_id = \$2/)
  assert.throws(
    () =>
      compileCustomReport(
        { entity: 'records', mode: 'rows', columns: ['template_id'] },
        'tenant-1',
        { entities: [entity] },
      ),
    /internal column: template_id/,
  )
})

test('flat multi-value dimensions compile set membership instead of whole-string equality', () => {
  const catalog: ReportEntityCatalog = {
    entities: [
      {
        key: 'people',
        label: 'People',
        category: 'directory',
        table: 'report_people',
        columns: [
          {
            key: 'group_ids',
            label: 'Person group',
            kind: 'text',
            filterValueMode: 'csv-set',
            filterOptions: [
              { value: 'group-a', label: 'Crew A' },
              { value: 'group-b', label: 'Crew B' },
            ],
          },
        ],
      },
    ],
  }
  const compiled = compileCustomReport(
    {
      entity: 'people',
      mode: 'rows',
      columns: ['group_ids'],
      filters: {
        combinator: 'and',
        rules: [{ field: 'group_ids', op: 'in', value: ['group-a', 'group-b'] }],
      },
    },
    'tenant-1',
    catalog,
  )
  assert.match(compiled.sql, /string_to_array\(COALESCE\("report_people"\."group_ids"::text, ''\), ','\) && ARRAY\[\$2, \$3\]/)
  assert.deepEqual(compiled.params, ['tenant-1', 'group-a', 'group-b'])
})

test('summary compiler supports fiscal bins and validates numeric aggregates', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'summarize', columns: [], breakouts: [{ column: 'created_at', bin: 'fiscal_year' }], measures: [{ fn: 'sum', column: 'amount' }] }, 'tenant-1', catalog, { fiscalStartMonth: 4 })
  assert.match(compiled.sql, /make_interval\(months => 9\)/)
  assert.match(compiled.sql, /sum\(r\.amount\)/)
  assert.throws(() => compileCustomReport({ entity: 'records', mode: 'summarize', columns: [], measures: [{ fn: 'sum', column: 'status' }] }, 'tenant-1', catalog), /numeric/)
})

test('compiled rows become grouped document results and preserve truncation', () => {
  const compiled = compileCustomReport({ entity: 'records', mode: 'rows', columns: ['amount'], groupBy: 'status', limit: 2 }, 'tenant-1', catalog)
  const result = customReportResult(compiled, [{ status: 'open', amount: 10 }, { status: 'open', amount: 20 }, { status: 'closed', amount: 30 }])
  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0]?.title, 'open')
  assert.equal(result.rowCount, 2)
  assert.equal(result.truncated, true)
})

const payCatalog: ReportEntityCatalog = { entities: [{
  key: 'stub_lines', label: 'Pay stub lines', category: 'Payroll', from: 'stub_lines l', tenantColumn: 'l.tenant_id',
  latestOrderExpr: 'l.pay_date DESC, l.id DESC',
  columns: [
    { key: 'employee', label: 'Employee', kind: 'text', expression: 'l.employee' },
    { key: 'pay_date', label: 'Pay date', kind: 'date', expression: 'l.pay_date' },
    { key: 'amount', label: 'Amount', kind: 'money', expression: 'l.amount' },
    { key: 'ytd_amount', label: 'YTD amount', kind: 'money', expression: 'l.ytd_amount' },
    { key: 'tax_year', label: 'Tax year', kind: 'number', expression: 'l.tax_year' },
  ],
}] }

test('money columns aggregate, filter, and surface as currency semantics', () => {
  const rows = compileCustomReport({ entity: 'stub_lines', mode: 'rows', columns: ['employee', 'amount'] }, 'tenant-1', payCatalog)
  assert.deepEqual(rows.columns[1], { key: 'amount', label: 'Amount', semanticType: 'currency', align: 'right' })
  const summary = compileCustomReport({ entity: 'stub_lines', mode: 'summarize', columns: [], breakouts: [{ column: 'employee' }], measures: [{ fn: 'sum', column: 'amount' }, { fn: 'count_distinct', column: 'amount' }] }, 'tenant-1', payCatalog)
  assert.match(summary.sql, /sum\(l\.amount\)/)
  assert.equal(summary.columns[1]?.semanticType, 'currency')
  assert.equal(summary.columns[2]?.semanticType, 'number')
})

test("the 'latest' aggregate compiles the entity's chronological order and fails loudly without one", () => {
  const compiled = compileCustomReport({ entity: 'stub_lines', mode: 'summarize', columns: [], breakouts: [{ column: 'employee' }], measures: [{ fn: 'latest', column: 'ytd_amount' }] }, 'tenant-1', payCatalog)
  assert.match(compiled.sql, /\(ARRAY_AGG\(l\.ytd_amount ORDER BY l\.pay_date DESC, l\.id DESC\)\)\[1\]/)
  const bare = { entities: [{ ...payCatalog.entities[0]!, latestOrderExpr: undefined }] }
  assert.throws(() => compileCustomReport({ entity: 'stub_lines', mode: 'summarize', columns: [], measures: [{ fn: 'latest', column: 'ytd_amount' }] }, 'tenant-1', bare), /latest/)
})

test('summarize groupBy over an un-binned breakout shapes titled sections with the column lifted out', () => {
  const compiled = compileCustomReport({ entity: 'stub_lines', mode: 'summarize', columns: [], groupBy: 'employee', breakouts: [{ column: 'employee' }, { column: 'pay_date', bin: 'month' }], measures: [{ fn: 'sum', column: 'amount' }] }, 'tenant-1', payCatalog)
  assert.equal(compiled.groupBy, 'd0')
  const result = customReportResult(compiled, [
    { d0: 'Ada', d1: new Date(2026, 6, 1), m0: '3115.375' },
    { d0: 'Grace', d1: null, m0: '10.00' },
  ])
  assert.equal(result.groups.length, 2)
  assert.equal(result.groups[0]?.kind, 'summary')
  assert.equal(result.groups[0]?.title, 'Employee: Ada')
  assert.deepEqual(result.groups[0]?.columns.map((column) => column.key), ['d1', 'm0'])
  // Scope keys stay COMPLETE (section + binned month range) so drills hit the exact bucket.
  assert.deepEqual(result.groups[0]?.rowKeys, [[
    { field: 'employee', value: 'Ada' },
    { field: 'pay_date', from: '2026-07-01', to: '2026-07-31' },
  ]])
  assert.deepEqual(result.groups[1]?.rowKeys, [[
    { field: 'employee', value: 'Grace' },
    { field: 'pay_date', empty: true },
  ]])
})

test('aggregate rows that cannot be scoped exactly carry a null scope, never a wrong one', () => {
  const compiled = compileCustomReport({ entity: 'stub_lines', mode: 'summarize', columns: [], breakouts: [{ column: 'pay_date', bin: 'fiscal_year' }], measures: [{ fn: 'sum', column: 'amount' }] }, 'tenant-1', payCatalog)
  const result = customReportResult(compiled, [{ d0: 2026, m0: '99.00' }])
  assert.deepEqual(result.groups[0]?.rowKeys, [null])
})

test('sectioned totals sum additive and latest measures exactly; avg/min/max stay blank', () => {
  const compiled = compileCustomReport({
    entity: 'stub_lines', mode: 'summarize', columns: [], groupBy: 'employee',
    breakouts: [{ column: 'employee' }, { column: 'pay_date', bin: 'month' }],
    measures: [{ fn: 'sum', column: 'amount' }, { fn: 'latest', column: 'ytd_amount' }, { fn: 'max', column: 'amount' }],
    totals: { sections: true, grand: true },
  }, 'tenant-1', payCatalog)
  assert.deepEqual(compiled.totals, { sections: true, grand: true })
  // Engine-driven alignment: breakouts left, measures right — a text breakout
  // in a sectioned summary must never right-align by position.
  assert.deepEqual(compiled.columns.map((column) => column.align), ['left', 'left', 'right', 'right', 'right'])
  const july = new Date(2026, 6, 1)
  const result = customReportResult(compiled, [
    { d0: 'Ada', d1: july, m0: '100.10', m1: '500.00', m2: '100.10' },
    { d0: 'Grace', d1: july, m0: '0.02', m1: '90.00', m2: '0.02' },
  ])
  // Each section gains one subtotal row at the month level; sums are exact decimals.
  const ada = result.groups[0]!
  assert.deepEqual(ada.totalRows, [1])
  assert.equal(ada.rows.length, 2)
  assert.equal(ada.subtitle, '1 row')
  // 'latest' totals too: each row is the END of a disjoint per-bucket running
  // series, so the sum of endings is the combined ending. max stays blank.
  assert.deepEqual(ada.rows[1], { d1: '2026-07-01 — total', m0: '100.10', m1: '500.00', m2: null })
  // Grand totals: one row per remaining-breakout combo, company-wide scope,
  // additive + latest measures summed exactly (0.1 + 0.02 floats would drift).
  const grand = result.groups.at(-1)!
  assert.equal(grand.title, 'Grand totals')
  assert.deepEqual(grand.rows, [{ d1: july, m0: '100.12', m1: '590.00', m2: null }])
  assert.deepEqual(grand.rowKeys, [[{ field: 'pay_date', from: '2026-07-01', to: '2026-07-31' }]])
})

test('exact number display keeps true integers intact and normalizes decimal strings to two places', () => {
  assert.equal(formatExactReportNumber('2026'), '2026')
  assert.equal(formatExactReportNumber('2938.0000'), '2938.00')
  assert.equal(formatExactReportNumber('-15.5'), '-15.50')
  assert.equal(formatExactReportNumber('0.0625'), '0.0625')
  assert.equal(formatExactReportNumber('n/a'), null)
  const compiled = compileCustomReport({ entity: 'stub_lines', mode: 'rows', columns: ['tax_year', 'amount'] }, 'tenant-1', payCatalog)
  const result = customReportResult(compiled, [{ tax_year: '2026', amount: '3115.3800' }])
  assert.deepEqual(result.groups[0]?.rows, [{ tax_year: '2026', amount: '3115.38' }])
})

test('definition registry rejects duplicates and filters published reports', () => {
  const definition = { schemaVersion: 1 as const, id: 'one', slug: 'report-one', name: 'Report one', query: { entity: 'records', mode: 'rows' as const, columns: ['status'] }, layout: resolveReportLayout(), state: 'published' as const, tags: ['operations'] }
  const registry = createReportDefinitionRegistry([definition])
  assert.equal(registry.get('report-one')?.id, 'one')
  assert.equal(registry.list({ state: 'published', tags: ['operations'] }).length, 1)
  assert.throws(() => createReportDefinitionRegistry([definition, definition]), /Duplicate/)
})

test('schedule policy normalizes recipients and rejects hostile filter objects', () => {
  assert.deepEqual(validateScheduleRecipients([' Team@Example.com ', 'team@example.com']), ['team@example.com'])
  const hostile = Object.create(null) as Record<string, unknown>
  Object.defineProperty(hostile, '__proto__', { value: 'bad', enumerable: true })
  assert.throws(() => assertScheduleFilters(hostile), /invalid key/)
})
