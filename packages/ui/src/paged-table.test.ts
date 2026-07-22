import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListNavProvider } from './list-nav'
import { PagedTable, type PagedColumn } from './paged-table'
import { SearchSelectFilter } from './filter-chips'
import { SubtabNav } from './subtab-nav'

type Row = { id: string; name: string; amount: number }

const columns: PagedColumn<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name, search: (row) => row.name },
  { key: 'amount', header: 'Amount', align: 'right', cell: (row) => `$${row.amount}` },
]

test('preserves the source paged-table call surface and first-page behavior', () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({
    id: String(index + 1),
    name: `Record ${index + 1}`,
    amount: index + 1,
  }))
  const markup = renderToStaticMarkup(React.createElement(PagedTable<Row>, {
    rows,
    columns,
    searchable: true,
    pageSize: 10,
    empty: 'Nothing here',
    rowKey: (row) => row.id,
  }))
  assert.match(markup, /aria-label="Search"/)
  assert.match(markup, /Record 10/)
  assert.doesNotMatch(markup, /Record 11/)
  assert.match(markup, /Showing/)
  assert.match(markup, /Page 1 of 2/)
})

test('renders the supplied empty state without table chrome', () => {
  const markup = renderToStaticMarkup(React.createElement(PagedTable<Row>, {
    rows: [],
    columns,
    empty: React.createElement('p', null, 'No rates'),
    rowKey: (row) => row.id,
  }))
  assert.equal(markup, '<p>No rates</p>')
})

test('retains source-shaped searchable URL filters through the router bridge', () => {
  const markup = renderToStaticMarkup(React.createElement(ListNavProvider, {
    value: {
      pathname: '/records',
      search: 'account=cash&page=3',
      replace() {},
      push() {},
    },
    children: React.createElement(SearchSelectFilter, {
      paramKey: 'account',
      label: 'Account',
      options: [{ value: 'cash', label: 'Cash account' }],
    }),
  }))
  assert.match(markup, /Cash account/)
})

test('renders the source subtab grammar with counts and selected state', () => {
  const markup = renderToStaticMarkup(React.createElement(SubtabNav, {
    tabs: [
      { key: 'details', label: 'Details', count: 3 },
      { key: 'activity', label: 'Activity' },
    ],
    active: 'details',
    onSelect() {},
  }))
  assert.match(markup, /role="tablist"/)
  assert.match(markup, /aria-selected="true"/)
  assert.match(markup, />3</)
})
