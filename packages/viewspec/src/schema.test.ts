import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BLOCK_KINDS,
  CELL_KINDS,
  SPEC_VERSION,
  validateSpec,
} from './index'

/**
 * The schema is the only thing standing between an untrusted spec and a
 * renderer, and in the first application to adopt this language it drifted:
 * `heading` was renderable, typed, listed in `BLOCK_KINDS` and used by a dozen
 * specs, yet `blockSchema` had no member for it — so `validateSpec` rejected
 * every spec that carried one. Nothing caught it, because a compiled spec
 * renders `trusted` and skips validation entirely. It surfaced only when
 * something ran the validator directly.
 *
 * These tests exist so that gap cannot reopen: every kind the language
 * ADVERTISES must be a kind the validator ACCEPTS, and the closed unions must
 * stay closed.
 */

/** A minimal, valid instance of every block kind the language advertises. */
const BLOCK_SAMPLES: Record<(typeof BLOCK_KINDS)[number], unknown> = {
  'page-header': { kind: 'page-header', title: 'x' },
  'filter-bar': { kind: 'filter-bar', controls: { period: true } },
  'summary-line': { kind: 'summary-line', label: 'x', value: { kind: 'text', field: { $: 'a' } } },
  paper: { kind: 'paper', title: 'x', blocks: [] },
  table: {
    kind: 'table',
    rows: { $: 'rows' },
    rowKey: { $: 'id' },
    columns: [{ header: 'x', cell: { kind: 'text', field: { $: 'a' } } }],
  },
  pagination: {
    kind: 'pagination',
    basePath: '/x',
    total: { $: 't' },
    page: { $: 'p' },
    perPage: { $: 'n' },
  },
  text: { kind: 'text', content: 'x' },
  widget: { kind: 'widget', widget: 'some-widget' },
  grid: { kind: 'grid', blocks: [] },
  heading: { kind: 'heading', level: 2, content: 'x' },
  panel: { kind: 'panel', title: 'x', blocks: [] },
  'stat-tile': { kind: 'stat-tile', iconKey: 'x', accent: 'teal', label: 'x', value: 'x' },
  repeat: { kind: 'repeat', items: { $: 'rows' }, itemKey: { $: 'id' }, blocks: [] },
  frame: { kind: 'frame', frame: 'card', blocks: [] },
}

const CELL_SAMPLES: Record<(typeof CELL_KINDS)[number], unknown> = {
  text: { kind: 'text', field: { $: 'a' } },
  money: { kind: 'money', field: { $: 'a' } },
  number: { kind: 'number', field: { $: 'a' } },
  date: { kind: 'date', field: { $: 'a' } },
  badge: { kind: 'badge', field: { $: 'a' } },
  link: { kind: 'link', field: { $: 'a' }, href: { $: 'h' } },
  'record-link': { kind: 'record-link', field: { $: 'a' }, recordType: 'party', id: { $: 'i' } },
  drill: { kind: 'drill', target: { $: 'd' }, inner: { kind: 'text', field: { $: 'a' } } },
  txn: { kind: 'txn', target: { $: 'd' }, inner: { kind: 'text', field: { $: 'a' } } },
  widget: { kind: 'widget', widget: 'some-cell' },
}

function specWith(block: unknown) {
  return { specVersion: SPEC_VERSION, layout: 'list', header: [], body: [block] }
}

test('every advertised block kind validates', () => {
  for (const kind of BLOCK_KINDS) {
    const sample = BLOCK_SAMPLES[kind]
    assert.ok(sample, `BLOCK_KINDS lists "${kind}" but this test has no sample for it`)
    const result = validateSpec(specWith(sample))
    assert.equal(result.ok, true, `block kind "${kind}" was rejected: ${result.errors.join('; ')}`)
  }
})

test('every advertised cell kind validates inside a table', () => {
  for (const kind of CELL_KINDS) {
    const cell = CELL_SAMPLES[kind]
    assert.ok(cell, `CELL_KINDS lists "${kind}" but this test has no sample for it`)
    const result = validateSpec(
      specWith({
        kind: 'table',
        rows: { $: 'rows' },
        rowKey: { $: 'id' },
        columns: [{ header: 'x', cell }],
      }),
    )
    assert.equal(result.ok, true, `cell kind "${kind}" was rejected: ${result.errors.join('; ')}`)
  }
})

test('the block union stays closed', () => {
  const result = validateSpec(specWith({ kind: 'script', src: 'evil.js' }))
  assert.equal(result.ok, false)
})

test('a stray property is a rejection, not a best-effort render', () => {
  const result = validateSpec(specWith({ kind: 'heading', level: 2, content: 'x', onClick: 'x' }))
  assert.equal(result.ok, false)
})

test('a wrong spec version is a rejection', () => {
  const result = validateSpec({ specVersion: 99, layout: 'list', header: [], body: [] })
  assert.equal(result.ok, false)
})

test('nesting deeper than the cap is a rejection', () => {
  let block: unknown = { kind: 'grid', blocks: [] }
  for (let depth = 0; depth < 12; depth++) block = { kind: 'grid', blocks: [block] }
  const result = validateSpec(specWith(block))
  assert.equal(result.ok, false)
})

test('a field path may not reach the prototype chain', () => {
  // `resolvePath` guards these too, and that guard is the one that must never
  // be removed: it holds for callers that skip validation. This checks the
  // other end — a poisoned path is refused before it can be STORED, so it
  // never becomes a page that throws for every reader.
  for (const path of ['__proto__', 'a.__proto__.b', 'constructor', 'x.prototype']) {
    const result = validateSpec({
      specVersion: SPEC_VERSION,
      layout: 'list',
      header: [],
      body: [{ kind: 'text', content: { $: path } }],
    })
    assert.equal(result.ok, false, `${path} must be refused`)
  }

  // An ordinary nested path still works; the guard is on the segment names.
  const fine = validateSpec({
    specVersion: SPEC_VERSION,
    layout: 'list',
    header: [],
    body: [{ kind: 'text', content: { $: 'invoice.customer.name' } }],
  })
  assert.equal(fine.ok, true)
})
