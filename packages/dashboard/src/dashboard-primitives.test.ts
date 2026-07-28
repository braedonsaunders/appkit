import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardMetricCard, DashboardPanel } from './dashboard-primitives'

test('fixed dashboard primitives render without builder state or controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(DashboardMetricCard, {
        label: 'Active value',
        value: '$1.2M',
        detail: '12 active quotes',
        tone: 'success',
      }),
      React.createElement(
        DashboardPanel,
        {
          title: 'Pipeline',
          actions: React.createElement('a', { href: '/quotes' }, 'Quotes'),
          children: React.createElement('p', null, 'Live pipeline data'),
        },
      ),
    ),
  )

  assert.match(markup, /Active value/)
  assert.match(markup, /\$1\.2M/)
  assert.match(markup, /Pipeline/)
  assert.match(markup, /Live pipeline data/)
  assert.doesNotMatch(markup, /Add widget|Customizing your dashboard|react-grid-layout/)
})
