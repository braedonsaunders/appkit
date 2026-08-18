import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TerminalSurface } from './react'

test('TerminalSurface renders durable command and output entries', () => {
  const markup = renderToStaticMarkup(
    React.createElement(TerminalSurface, {
      title: 'Claims workstation',
      subtitle: 'SSH · observable',
      cwd: '/srv/claims',
      status: 'completed',
      entries: [
        { id: 'command', kind: 'command', prompt: '/srv/claims $', text: 'git status' },
        { id: 'stdout', kind: 'stdout', text: 'working tree clean' },
      ],
    }),
  )

  assert.match(markup, /Claims workstation/)
  assert.match(markup, /git status/)
  assert.match(markup, /working tree clean/)
  assert.match(markup, /completed/)
})
