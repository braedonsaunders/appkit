import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { shouldFollowTerminalOutput, terminalEntryText, TerminalSurface } from './react'

test('TerminalSurface follows output only while the viewer remains near the bottom', () => {
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 760, clientHeight: 200 }), true)
  assert.equal(shouldFollowTerminalOutput({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 200 }), false)
})

test('terminal ledger commands receive deterministic semantic ANSI token styling', () => {
  const command = terminalEntryText({
    id: 'c',
    kind: 'command',
    prompt: '/srv/claims $',
    text: 'env MODE=check git status --short | grep "$USER" && printf \'%s\\n\' $HOME',
  })

  assert.equal(command, [
    '\u001b[1;36m/srv/claims\u001b[0m \u001b[1;32m$\u001b[0m ',
    '\u001b[1;32menv\u001b[0m \u001b[36mMODE=check\u001b[0m \u001b[1;32mgit\u001b[0m status ',
    '\u001b[33m--short\u001b[0m \u001b[1;94m|\u001b[0m \u001b[1;32mgrep\u001b[0m ',
    '\u001b[35m"$USER"\u001b[0m \u001b[1;94m&&\u001b[0m \u001b[1;32mprintf\u001b[0m ',
    '\u001b[35m\'%s\\n\'\u001b[0m \u001b[36m$HOME\u001b[0m\r\n',
  ].join(''))
})

test('terminal ledger streams are distinct while source ANSI remains byte-for-byte intact', () => {
  assert.equal(terminalEntryText({ id: 'e', kind: 'stderr', text: 'failed' }), '\u001b[1;31m[stderr]\u001b[0m \u001b[31mfailed\n\u001b[0m')
  assert.equal(terminalEntryText({ id: 's', kind: 'system', text: 'connected' }), '\u001b[2;36m[system]\u001b[0m \u001b[36mconnected\n\u001b[0m')
  assert.equal(terminalEntryText({ id: 't', kind: 'status', text: 'completed' }), '\u001b[1;32m[status]\u001b[0m \u001b[32mcompleted\n\u001b[0m')
  assert.equal(terminalEntryText({ id: 'p', kind: 'stdout', text: 'plain' }), '\u001b[2;90m│\u001b[0m \u001b[37mplain\n\u001b[0m')
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
        { id: 'status', kind: 'status', text: 'Command completed successfully' },
      ],
    }),
  )

  assert.match(markup, /Claims workstation/)
  assert.match(markup, /git status/)
  assert.match(markup, /working tree clean/)
  assert.match(markup, /Command completed successfully/)
  assert.match(markup, /completed/)
  assert.match(markup, /bg-success-subtle/)
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
