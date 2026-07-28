import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Table } from './table'

test('Table keeps its standalone card treatment by default', () => {
  const markup = renderToStaticMarkup(React.createElement(Table))

  assert.match(markup, /rounded-lg/)
  assert.match(markup, /border-border/)
  assert.match(markup, /shadow-sm/)
})

test('Table containerClassName supports embedded workspace tables', () => {
  const markup = renderToStaticMarkup(
    React.createElement(Table, {
      containerClassName: 'h-full rounded-none border-0 shadow-none',
    }),
  )

  assert.match(markup, /h-full/)
  assert.match(markup, /rounded-none/)
  assert.match(markup, /border-0/)
  assert.match(markup, /shadow-none/)
})
