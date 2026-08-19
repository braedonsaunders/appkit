import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentMessageQueue, AgentPanel, AgentTypingIndicator, type AgentPanelProps } from './react'

test('AgentTypingIndicator renders a tokenized stagger and a reduced-motion fallback', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentTypingIndicator))

  assert.match(markup, /role="status"/)
  assert.match(markup, /aria-label="Assistant is responding"/)
  assert.match(markup, /@keyframes appkit-agent-typing-dot/)
  assert.match(markup, /var\(--duration-slow\)/)
  assert.match(markup, /var\(--ease-out\)/)
  assert.match(markup, /prefers-reduced-motion: reduce/)
  assert.match(markup, /animation-delay:var\(--duration-fast\)/)
  assert.equal(markup.match(/appkit-agent-typing-dot size-1\.5/g)?.length, 3)
  assert.doesNotMatch(markup, /animate-bounce/)
})

test('AgentPanel renders optional actions in its main header', () => {
  const props = {
    enabled: false,
    headerActions: React.createElement('button', { type: 'button' }, 'Hide work'),
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /<header[^>]*h-12[^>]*>/)
  assert.match(markup, /<div class="ml-auto flex items-center gap-2"><button type="button">Hide work<\/button><\/div>/)
})

test('AgentPanel accepts an application-owned full empty stage', () => {
  const props = {
    enabled: false,
    emptyContent: React.createElement('div', { 'data-call-stage': true }, 'Employee stage'),
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /data-call-stage="true"/)
  assert.match(markup, /min-h-full/)
  assert.doesNotMatch(markup, /How can I help\?/)
})

test('AgentPanel renders application-owned attachment composer content', () => {
  const props = {
    enabled: true,
    composerContent: React.createElement('span', { 'data-draft-file': true }, 'budget.xlsx'),
    composerActions: React.createElement('button', { type: 'button' }, 'Attach files'),
    composerDraft: {
      fallbackPrompt: 'Review the attached file.',
      parts: [{ type: 'file', filename: 'budget.xlsx', url: '/files/budget' }],
    },
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /data-draft-file="true"/)
  assert.match(markup, />Attach files</)
  assert.doesNotMatch(markup, /aria-label="Send"[^>]*disabled/)
})

test('AgentPanel renders file parts on a user turn', () => {
  const props = {
    enabled: false,
    initialMessages: [{
      id: 'user-file',
      role: 'user' as const,
      parts: [
        { type: 'text', text: 'Please review this.' },
        { type: 'file', filename: 'forecast.xlsx', url: '/api/files/file-1' },
      ],
    }],
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /Please review this\./)
  assert.match(markup, /href="\/api\/files\/file-1"/)
  assert.match(markup, />forecast\.xlsx</)
})

test('AgentPanel collapses a multi-step tool run to its latest action', () => {
  const props = {
    enabled: false,
    initialMessages: [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: [
          { type: 'dynamic-tool', toolName: 'open_desktop', state: 'output-available', output: { opened: true } },
          { type: 'step-start' },
          { type: 'dynamic-tool', toolName: 'run_shell', state: 'output-available', output: { exitCode: 0 } },
        ],
      },
    ],
    toolLabels: { open_desktop: 'Open desktop', run_shell: 'Run shell' },
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /aria-expanded="false"/)
  assert.match(markup, />2 steps</)
  assert.match(markup, />Run shell</)
  assert.doesNotMatch(markup, /Open desktop/)
  assert.doesNotMatch(markup, /exitCode/)
})

test('AgentMessageQueue renders durable position, state, and available recovery actions', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentMessageQueue, {
    messages: [
      {
        id: 'queued-1',
        text: 'Prepare the customer follow-up',
        position: 2,
        status: 'failed' as const,
        editable: true,
        removable: true,
        retryable: true,
      },
    ],
    onEdit: () => undefined,
    onRemove: () => undefined,
    onRetry: () => undefined,
  }))

  assert.match(markup, /aria-label="Up next"/)
  assert.match(markup, /aria-label="Position 2"/)
  assert.match(markup, /Prepare the customer follow-up/)
  assert.match(markup, /This queued message needs attention\./)
  assert.match(markup, /aria-label="Retry queued message"/)
  assert.match(markup, /aria-label="Edit queued message"/)
  assert.match(markup, /aria-label="Remove queued message"/)
})
