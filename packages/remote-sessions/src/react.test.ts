import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { shouldFollowTerminalOutput, TerminalSurface } from './react'

test('TerminalSurface follows output only while the viewer remains near the bottom', () => {
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 760, clientHeight: 200 }), true)
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 200 }), false)
})

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
