import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildExportHref,
  buildHref,
  isUuid,
  mergeHref,
  parseListParams,
  parsePrefixedListParams,
} from './list-params'

test('parseListParams accepts allowlisted state and applies safe defaults', () => {
  assert.deepEqual(
    parseListParams(
      { q: 'ada', sort: 'email', dir: 'asc', page: '2', perPage: '50' },
      { sort: 'name', allowedSorts: ['name', 'email'] as const },
    ),
    { q: 'ada', sort: 'email', dir: 'asc', page: 2, perPage: 50 },
  )
  assert.deepEqual(
    parseListParams(
      { sort: 'unsafe', dir: 'sideways', page: '-4', perPage: '1000' },
      { sort: 'name', perPage: 20, allowedSorts: ['name', 'email'] as const },
    ),
    { q: undefined, sort: 'name', dir: 'desc', page: 1, perPage: 100 },
  )
})

test('parsePrefixedListParams isolates independently paged lists', () => {
  assert.deepEqual(
    parsePrefixedListParams(
      {
        q: 'outer',
        page: '9',
        reviewQ: 'annual',
        reviewSort: 'oldest',
        reviewDir: 'asc',
        reviewPage: '3',
        reviewPerPage: '20',
      },
      'review',
      { sort: 'recent', allowedSorts: ['recent', 'oldest'] as const },
    ),
    { q: 'annual', sort: 'oldest', dir: 'asc', page: 3, perPage: 20 },
  )
})

test('href builders preserve filters, override state, and drop export pagination', () => {
  assert.equal(buildHref('/team', { q: 'Ada Lovelace', empty: '', page: 2 }), '/team?q=Ada+Lovelace&page=2')
  assert.equal(
    mergeHref('/team', { q: 'ada', role: ['admin', 'ignored'], page: '3' }, { role: 'member', page: 1 }),
    '/team?q=ada&role=member&page=1',
  )
  assert.equal(
    buildExportHref('/team.csv', { q: 'ada', role: 'admin', page: '3', perPage: '25' }),
    '/team.csv?q=ada&role=admin',
  )
})

test('isUuid accepts canonical UUIDs and rejects malformed identifiers', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true)
  assert.equal(isUuid('550E8400-E29B-41D4-A716-446655440000'), true)
  for (const value of ['', 'not-an-id', '550e8400e29b41d4a716446655440000', ' 550e8400-e29b-41d4-a716-446655440000']) {
    assert.equal(isUuid(value), false)
  }
})
