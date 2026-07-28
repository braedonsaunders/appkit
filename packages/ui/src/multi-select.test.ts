import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { MultiSelect } from './multi-select'

const options = [
  { value: 'estimating', label: 'Estimating' },
  { value: 'projects', label: 'Projects' },
  { value: 'reports', label: 'Reports' },
]

test('renders selected values in registry order', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MultiSelect, {
      value: ['reports', 'estimating'],
      onChange: () => {},
      options,
    }),
  )

  assert.ok(markup.indexOf('Estimating') < markup.indexOf('Reports'))
  assert.match(markup, /aria-expanded="false"/)
})

test('summarizes selected values beyond the configured visible limit', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MultiSelect, {
      value: options.map((option) => option.value),
      onChange: () => {},
      options,
      maxVisibleValues: 1,
    }),
  )

  assert.match(markup, />\+2</)
})
