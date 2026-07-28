import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RecordList, type RecordColumn } from './record-list'

type Row = { id: string; name: string }

const columns: RecordColumn<Row>[] = [{ key: 'name', label: 'Name' }]
const rows: Row[] = [{ id: 'row-1', name: 'Embedded record' }]

test('RecordList supports full-height embedded table layouts', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RecordList<Row>, {
      columns,
      rows,
      getRowId: (row) => row.id,
      className: 'flex h-full min-h-0 flex-col',
      tableContainerClassName: 'min-h-0 flex-1 rounded-none border-0 shadow-none',
      tableClassName: 'table-fixed',
    }),
  )

  assert.match(markup, /flex h-full min-h-0 flex-col/)
  assert.match(markup, /min-h-0 flex-1 rounded-none border-0 shadow-none/)
  assert.match(markup, /table-fixed/)
  assert.match(markup, /Embedded record/)
})
