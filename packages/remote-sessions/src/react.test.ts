import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { shouldFollowTerminalOutput, terminalEntryText, TerminalSurface } from './react'

test('TerminalSurface follows output only while the viewer remains near the bottom', () => {
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 760, clientHeight: 200 }), true)
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 200 }), false)
})

test('terminal ledger entries preserve ANSI output and add semantic command styling', () => {
  assert.equal(terminalEntryText({ id: 'c', kind: 'command', prompt: '~/work $', text: 'git status' }), '\u001b[2m~/work $\u001b[0m \u001b[1mgit status\u001b[0m\r\n')
  assert.equal(terminalEntryText({ id: 'e', kind: 'stderr', text: 'failed' }), '\u001b[31mfailed\n\u001b[0m')
  assert.equal(terminalEntryText({ id: 'o', kind: 'stdout', text: '\u001b[32mok\u001b[0m\n' }), '\u001b[32mok\u001b[0m\n')
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

test('TerminalSurface hides a meaningless relative cwd and renders host controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(TerminalSurface, {
      title: 'Desk terminal',
      cwd: '.',
      entries: [],
      headerActions: React.createElement('button', { type: 'button' }, 'Full screen'),
    }),
  )

  assert.doesNotMatch(markup, /<code/)
  assert.match(markup, /Full screen/)
})
