import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHeader } from './page-header'

test('PageHeader actions wrap below the title instead of overflowing narrow screens', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PageHeader, {
      title: 'Collections',
      actions: React.createElement(React.Fragment, null,
        React.createElement('button', null, 'Describe it'),
        React.createElement('button', null, 'New collection'),
      ),
    }),
  )
  const header = /<header class="([^"]+)"/.exec(markup)?.[1] ?? ''
  assert.match(header, /\bflex-wrap\b/, 'header row must wrap')
  const actions = /<div class="([^"]+)"><button>Describe it/.exec(markup)?.[1] ?? ''
  assert.match(actions, /\bflex-wrap\b/, 'actions must wrap their own items')
  assert.match(actions, /\bmin-w-0\b/, 'actions must be allowed to shrink')
  assert.doesNotMatch(actions, /\bshrink-0\b/, 'actions must not refuse to shrink')
})
