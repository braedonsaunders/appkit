import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SubtabNav } from './subtab-nav'

test('marks exactly the active tab and carries its sliding indicator', () => {
  const markup = renderToStaticMarkup(React.createElement(SubtabNav, {
    ariaLabel: 'Sections',
    active: 'activity',
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'activity', label: 'Activity', count: 4 },
      { key: 'settings', label: 'Settings', disabled: true },
    ],
  }))
  assert.match(markup, /role="tablist"/)
  assert.match(markup, /aria-label="Sections"/)
  // One tab selected, and it is the activity one.
  const selected = markup.match(/aria-selected="true"/g) ?? []
  assert.equal(selected.length, 1)
  assert.ok(markup.indexOf('aria-selected="true"') < markup.indexOf('Activity'))
  // The sliding indicator renders in the static markup on the active tab, so
  // the selection is visible before hydration, not after it.
  const indicators = markup.match(/bg-primary/g) ?? []
  assert.equal(indicators.length, 1)
  assert.ok(markup.indexOf('bg-primary') < markup.indexOf('Activity'))
  // Counts still render beside their label, and disabled still disables.
  assert.match(markup, />4</)
  assert.match(markup, /disabled/)
})

test('renders without an indicator when nothing is active', () => {
  const markup = renderToStaticMarkup(React.createElement(SubtabNav, {
    active: 'missing',
    tabs: [{ key: 'overview', label: 'Overview' }],
  }))
  assert.doesNotMatch(markup, /aria-selected="true"/)
  assert.doesNotMatch(markup, /bg-primary/)
})
