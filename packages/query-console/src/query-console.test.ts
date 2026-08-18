import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHttpQueryConsoleAdapter,
  createLocalQueryConsoleStorage,
  createMemoryQueryConsoleStorage,
  createSelectTemplate,
  parseQueryResult,
  parseQuerySchema,
  queryResponseError,
  queryResultToCsv,
  quoteSqlIdentifier,
  readQueryResponse,
  validateReadOnlySql,
  type QueryResult,
} from './index'

test('preserves safe SELECT and WITH statements while trimming one trailing semicolon', () => {
  const query = 'with totals as (select 1 as value) select * from totals'
  assert.equal(validateReadOnlySql(query), query)
  assert.equal(validateReadOnlySql(" select 'expense_report'; "), "select 'expense_report'")
})

test('rejects multiple statements, mutations, and session changes', () => {
  assert.throws(() => validateReadOnlySql('select 1; select 2'), /one statement/)
  assert.throws(() => validateReadOnlySql("update documents set memo = 'nope'"), /read-only/)
  assert.throws(() => validateReadOnlySql("select set_config('app.current_org', 'other', true)"), /set_config/)
  assert.throws(() => validateReadOnlySql('explain select 1'), /must start/)
})

test('quotes identifiers and creates bounded browse templates', () => {
  assert.equal(quoteSqlIdentifier('odd"table'), '"odd""table"')
  assert.equal(createSelectTemplate('journal lines', 25), 'select *\n  from "journal lines"\n limit 25')
  assert.match(createSelectTemplate('journal_lines', 0), /limit 1$/)
  assert.match(createSelectTemplate('journal_lines', Number.POSITIVE_INFINITY), /limit 100$/)
})

test('serializes result CSV with quoting and spreadsheet-formula hardening', () => {
  const result: QueryResult = {
    columns: ['name', 'amount', 'note'],
    rows: [
      { name: '=HYPERLINK("https://example.invalid")', amount: '-12.50', note: 'line one\nline two' },
      { name: 'Normal', amount: 8, note: null },
    ],
    rowCount: 2,
    truncated: false,
    durationMs: 4,
  }
  assert.equal(
    queryResultToCsv(result),
    'name,amount,note\n"\'=HYPERLINK(""https://example.invalid"")",-12.50,"line one\nline two"\nNormal,8,',
  )
})

test('validates result and schema contracts fail closed', () => {
  assert.deepEqual(parseQueryResult({
    columns: ['value'],
    rows: [{ value: 1 }],
    rowCount: 1,
    truncated: false,
    durationMs: 2,
  }).columns, ['value'])
  assert.throws(() => parseQueryResult({ columns: [], rows: [{}], rowCount: 0, truncated: false, durationMs: 1 }), /invalid result/)
  assert.deepEqual(parseQuerySchema([{
    name: 'accounts',
    kind: 'view',
    columns: [{ name: 'id', type: 'uuid', nullable: false }],
  }])[0]?.name, 'accounts')
  assert.throws(() => parseQuerySchema([{ name: 'accounts', kind: 'relation', columns: [] }]), /invalid schema/)
})

test('decodes structured responses and reports invalid proxy/compiler output', async () => {
  const response = new Response(JSON.stringify({ tables: [] }), { status: 200 })
  assert.deepEqual(await readQueryResponse(response), { tables: [] })
  await assert.rejects(readQueryResponse(new Response(null, { status: 500 })), /empty response \(HTTP 500\)/)
  await assert.rejects(
    readQueryResponse(new Response('<!doctype html><h1>Internal Server Error</h1>', { status: 500 })),
    /invalid response \(HTTP 500\)/,
  )
  assert.equal(queryResponseError({ error: 'not found' }, 404), 'not found')
  assert.equal(queryResponseError({}, 503), 'Query request failed (HTTP 503)')
})

test('HTTP adapter validates both API boundaries and carries request controls', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const adapter = createHttpQueryConsoleAdapter({
    executeUrl: '/query',
    schemaUrl: '/query/schema',
    headers: () => ({ Authorization: 'Bearer test' }),
    fetch: async (input, init) => {
      requests.push({ url: String(input), init })
      if (String(input).endsWith('/schema')) {
        return Response.json({ tables: [{ name: 'accounts', kind: 'view', columns: [] }] })
      }
      return Response.json({ columns: ['value'], rows: [{ value: 1 }], rowCount: 1, truncated: false, durationMs: 3 })
    },
  })

  assert.equal((await adapter.listSchema())[0]?.name, 'accounts')
  assert.equal((await adapter.execute({ sql: 'select 1', maxRows: 100 })).rows[0]?.value, 1)
  assert.equal(requests[1]?.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), { sql: 'select 1', maxRows: 100 })
  assert.equal(new Headers(requests[1]?.init?.headers).get('authorization'), 'Bearer test')
})

test('local storage ignores corrupt entries and keeps source-compatible keys', () => {
  const values = new Map<string, string>([
    ['suite.query.history.v1', '{bad json'],
    ['suite.query.snippets.v1', JSON.stringify([{ id: '1', name: 'One', sql: 'select 1', at: 5 }, { id: 2 }])],
  ])
  const storage = createLocalQueryConsoleStorage('suite.query', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  })
  assert.deepEqual(storage.load(), {
    draft: undefined,
    history: [],
    snippets: [{ id: '1', name: 'One', sql: 'select 1', at: 5 }],
  })
  storage.saveDraft('select 2')
  assert.equal(values.get('suite.query.draft.v1'), 'select 2')
})

test('memory storage snapshots without sharing mutable references', () => {
  const storage = createMemoryQueryConsoleStorage()
  const history = [{ sql: 'select 1', at: 1, durationMs: 2, rowCount: 1, ok: true }]
  storage.saveHistory(history)
  history[0]!.sql = 'changed'
  assert.equal(storage.snapshot().history[0]?.sql, 'select 1')
})
