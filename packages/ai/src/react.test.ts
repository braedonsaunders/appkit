import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentApprovalRequestCard, AgentMessageQueue, AgentPanel, AgentSecretRequestCard, AgentTypingIndicator, __sameTranscriptForTests as sameTranscript, __withHostUserTurnsForTests as withHostUserTurns, type AgentMessage, type AgentPanelProps } from './react'

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
  assert.match(markup, /<textarea[^>]*class="[^"]*h-10[^"]*py-2[^"]*leading-6[^"]*"/)
  assert.doesNotMatch(markup, /aria-label="Send"[^>]*disabled/)
})

test('AgentPanel renders an injected assistant avatar in the existing message slot', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentPanel, {
    enabled: false,
    assistantAvatar: React.createElement('span', { 'data-employee-avatar': 'marla' }, 'M'),
    initialMessages: [{ id: 'assistant-avatar', role: 'assistant', parts: [{ type: 'text', text: 'Ready.' }] }],
  } satisfies AgentPanelProps))

  assert.match(markup, /size-7[^>]*><span data-employee-avatar="marla">M<\/span>/)
  assert.equal(markup.match(/lucide-sparkles/g)?.length, 1)
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
  assert.equal(markup.match(/>2 steps</g)?.length, 1)
  assert.doesNotMatch(markup, />4 steps</)
  assert.match(markup, />Run shell</)
  assert.doesNotMatch(markup, /Open desktop/)
  assert.doesNotMatch(markup, /exitCode/)
})

test('AgentPanel renders a transcript-safe pending secret request', () => {
  const props = {
    enabled: false,
    initialMessages: [{
      id: 'assistant-secret',
      role: 'assistant' as const,
      parts: [{
        type: 'secret-request',
        requestId: 'request-never-rendered',
        providerLabel: 'Acme Mail',
        credentialLabel: 'API key',
        purpose: 'Send the approved campaign from your connected account.',
        helpUrl: 'https://docs.example.com/keys',
        status: 'pending',
      }],
    }],
    onSubmitSecretRequest: async () => undefined,
    onCancelSecretRequest: async () => undefined,
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, props))

  assert.match(markup, /Acme Mail/)
  assert.match(markup, /API key/)
  assert.match(markup, /type="password"/)
  assert.match(markup, /autoComplete="new-password"|autocomplete="new-password"/)
  assert.match(markup, /Submit securely/)
  assert.match(markup, /relative space-y-2\.5 border-t/)
  assert.match(markup, /justify-end gap-2 pt-1/)
  assert.match(markup, /aria-label="Show credential"/)
  assert.match(markup, /href="https:\/\/docs\.example\.com\/keys"/)
  assert.doesNotMatch(markup, /request-never-rendered/)
  assert.doesNotMatch(markup, /value=/)
})

test('AgentSecretRequestCard renders stored and expired states without an input', () => {
  const baseRequest = {
    type: 'secret-request' as const,
    requestId: 'request-1',
    providerLabel: 'Acme Mail',
    credentialLabel: 'API key',
    purpose: 'Send approved messages.',
  }
  const stored = renderToStaticMarkup(React.createElement(AgentSecretRequestCard, { request: { ...baseRequest, status: 'stored' as const } }))
  const expired = renderToStaticMarkup(React.createElement(AgentSecretRequestCard, { request: { ...baseRequest, status: 'expired' as const } }))

  assert.match(stored, /Credential stored securely\./)
  assert.match(expired, /This credential request has expired\./)
  assert.doesNotMatch(stored, /<input/)
  assert.doesNotMatch(expired, /<input/)
})

test('AgentSecretRequestCard rejects unsafe help URLs', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentSecretRequestCard, {
    request: {
      type: 'secret-request',
      requestId: 'request-1',
      providerLabel: 'Acme Mail',
      credentialLabel: 'API key',
      purpose: 'Send approved messages.',
      helpUrl: 'javascript:alert(1)',
      status: 'pending',
    },
  }))

  assert.doesNotMatch(markup, /javascript:/)
  assert.doesNotMatch(markup, /Open setup instructions/)
})

test('AgentPanel renders a transcript-safe pending approval with inline decisions', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentPanel, {
    enabled: true,
    initialMessages: [{
      id: 'assistant-1',
      role: 'assistant',
      parts: [{
        type: 'approval-request',
        approvalId: 'approval-1',
        categoryLabel: 'Record change',
        description: 'Create the SocialData X/Twitter integration proposal.',
        details: [{ label: 'Provider', value: 'SocialData' }],
        status: 'pending',
      }],
    }],
    onDecideApprovalRequest: async () => undefined,
  } satisfies AgentPanelProps))

  assert.match(markup, /Approval needed/)
  assert.match(markup, /Create the SocialData X\/Twitter integration proposal\./)
  assert.match(markup, /Provider/)
  assert.match(markup, /SocialData/)
  assert.match(markup, />Approve</)
  assert.match(markup, />Decline</)
})

test('AgentApprovalRequestCard renders settled states without decision controls', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentApprovalRequestCard, {
    request: {
      type: 'approval-request',
      approvalId: 'approval-2',
      categoryLabel: 'External email',
      description: 'Send the prepared customer update.',
      status: 'approved',
      decisionNote: 'Send it this morning.',
    },
  }))

  assert.match(markup, /Approved\. The agent will continue automatically\./)
  assert.match(markup, /Send it this morning\./)
  assert.doesNotMatch(markup, />Decline</)
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

test('AgentPanel keeps the draft input outside the transcript render path', () => {
  // Typing lag on long threads came from the composer input living in panel
  // state: every keystroke re-rendered every transcript row. The composer is
  // a separate memoed component owning its own input state, and rows are
  // memoed so a turn streams into the tail row alone.
  const source = readFileSync(new URL('./react.tsx', import.meta.url), 'utf8')

  // The draft input lives in the memoed composer, not in AgentPanel state.
  assert.match(source, /const AgentComposer = React\.memo\(function AgentComposer/)
  const composerHead = source.slice(
    source.indexOf('const AgentComposer = React.memo('),
    source.indexOf('export function AgentPanel('),
  )
  assert.match(composerHead, /const \[input, setInput\] = React\.useState\(''\)/)
  const panelBody = source.slice(source.indexOf('export function AgentPanel('))
  assert.doesNotMatch(panelBody, /const \[input, setInput\]/)

  // Transcript rows skip re-render when their message object is unchanged.
  assert.match(source, /const MemoAgentMessageRow = React\.memo\(function AgentMessageRow/)

  // The composer receives a stable submit callback: an inline arrow here
  // would re-render the memoed composer (and its textarea) on every panel
  // render, including each streamed token.
  assert.match(panelBody, /const submitToComposer = React\.useCallback\(\(value: string\)/)
  assert.match(panelBody, /onSubmit=\{submitToComposer\}/)

  // Rendered markup is unchanged: queue above the composer row, textarea with
  // the same classes, send button enabled by the file-only draft fallback.
  const markup = renderToStaticMarkup(React.createElement(AgentPanel, {
    enabled: true,
    initialMessages: [{ id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Ready.' }] }],
    composerContent: React.createElement('span', { 'data-draft-file': true }, 'budget.xlsx'),
    composerDraft: {
      fallbackPrompt: 'Review the attached file.',
      parts: [{ type: 'file', filename: 'budget.xlsx', url: '/files/budget' }],
    },
    queuedMessages: [{
      id: 'queued-1',
      text: 'Queued follow-up',
      position: 1,
      status: 'queued' as const,
    }],
  } satisfies AgentPanelProps))

  assert.match(markup, /Ready\./)
  assert.match(markup, /data-draft-file="true"/)
  assert.match(markup, /Queued follow-up/)
  assert.match(markup, /<textarea[^>]*placeholder="Ask the assistant…"/)
})

test('AgentPanel takes a newer transcript from its host, except while it is streaming one', () => {
  const base = (): AgentMessage[] => [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'check the invoice' }] },
    {
      id: 'live:r1',
      role: 'assistant',
      parts: [{ type: 'dynamic-tool', toolName: 'run_shell', toolCallId: 'c1', state: 'input-available', input: { cmd: 'ls' } }],
    },
  ]

  assert.equal(sameTranscript(base(), base()), true, 'an unchanged transcript is not reapplied')

  // Every way a transcript moves forward has to be noticed, or a reader watching
  // work in progress sits on a stale snapshot.
  const returned = base()
  returned[1]!.parts = [
    { type: 'dynamic-tool', toolName: 'run_shell', toolCallId: 'c1', state: 'output-available', input: { cmd: 'ls' }, output: 'a b' },
  ]
  assert.equal(sameTranscript(base(), returned), false, 'a call that returned is a change')

  const extraPart = base()
  extraPart[1]!.parts = [...extraPart[1]!.parts, { type: 'text', text: 'Looking at it' }]
  assert.equal(sameTranscript(base(), extraPart), false, 'a new part is a change')

  const short = base()
  short[1]!.parts = [{ type: 'text', text: 'Looking' }]
  const longer = base()
  longer[1]!.parts = [{ type: 'text', text: 'Looking at the invoice' }]
  assert.equal(sameTranscript(short, longer), false, 'prose growing is a change')

  assert.equal(
    sameTranscript(base(), [...base(), { id: 'a2', role: 'assistant', parts: [] }]),
    false,
    'a new message is a change',
  )
  assert.equal(sameTranscript(base(), []), false, 'an emptied transcript is a change')

  // Deliberately NOT deep: these parts carry whole tool inputs and outputs, and
  // this runs on every render of the host.
  const sameShape = base()
  sameShape[1]!.parts = [{ type: 'dynamic-tool', toolName: 'run_shell', toolCallId: 'c1', state: 'input-available', input: { cmd: 'pwd' } }]
  assert.equal(sameTranscript(base(), sameShape), true, 'an unchanged shape is treated as unchanged')

  // A separator a value can carry: joining with a space let a value holding
  // whitespace absorb it, so two different parts could produce one signature
  // and a real change would be read as "nothing moved". Hosts mint their own
  // ids and statuses and are not obliged to trim them the same way twice, and
  // `ok ` + `c1` spaces-joins to exactly what `ok` + ` c1` does.
  const absorbedSeparator = base()
  absorbedSeparator[1]!.parts = [
    { type: 'dynamic-tool', toolName: 'run_shell', toolCallId: 'c1', state: 'input-available', status: 'ok ' },
  ]
  const splitAcrossFields = base()
  splitAcrossFields[1]!.parts = [
    { type: 'dynamic-tool', toolName: 'run_shell', toolCallId: ' c1', state: 'input-available', status: 'ok' },
  ]
  assert.equal(
    sameTranscript(absorbedSeparator, splitAcrossFields),
    false,
    'a value carrying the separator cannot impersonate two fields',
  )

  // The guard matters as much as the comparison: while this panel owns the turn,
  // its streamed parts are richer than anything the host has persisted.
  //
  // Asserted as intent rather than as one line of source, because the guard grew
  // a branch: a streaming panel still takes the person's OWN turns, which are
  // additive and cannot conflict with the answer. What it must never do is adopt
  // the host snapshot wholesale while streaming, which would replace a
  // part-written answer with whatever had been persisted.
  const source = readFileSync(new URL('./react.tsx', import.meta.url), 'utf8')
  const effect = source.slice(
    source.indexOf('Take a newer transcript from the host'),
  )
  const body = effect.slice(0, effect.indexOf('}, [initialMessages, streaming])'))
  const streamingBranch = body.slice(
    body.indexOf('if (streaming || abortRef.current !== null)'),
    body.indexOf('sameTranscript('),
  )
  assert.ok(streamingBranch.length > 0, 'the streaming case is still handled first')
  assert.equal(
    /setMessages\(\s*\(current\)\s*=>\s*\(?sameTranscript/.test(streamingBranch),
    false,
    'a streaming panel is never overwritten by the host snapshot',
  )
  assert.match(streamingBranch, /withHostUserTurns/, 'it takes the person’s turns and nothing else')
  assert.match(streamingBranch, /return/, 'and stops before the wholesale adoption')
})

test('a turn in flight shows the thinking indicator even when this panel is not streaming it', () => {
  // Work running in a worker, or a turn the reader reloaded into the middle of:
  // the host can see it, the panel is not producing it. Keyed off `streaming`
  // alone it had no sign of life in the transcript at all, which left the host
  // explaining in a banner beside the conversation that something was happening
  // elsewhere — not where anyone looks, and it reads as an apology.
  const inFlight = {
    enabled: true,
    working: true,
    initialMessages: [
      { id: 'u1', role: 'user' as const, parts: [{ type: 'text', text: 'make a new coin' }] },
      {
        id: 'live:r1',
        role: 'assistant' as const,
        parts: [{ type: 'dynamic-tool', toolName: 'run_shell', toolCallId: 'c1', state: 'input-available', input: {} }],
      },
    ],
  } satisfies AgentPanelProps

  const markup = renderToStaticMarkup(React.createElement(AgentPanel, inFlight))
  assert.match(markup, /aria-label="Assistant is responding"/, 'the indicator rides along with work in progress')
  assert.match(markup, /run_shell|run shell/, 'and the work itself is still rendered')

  // Same transcript, nothing in flight: no indicator, just the recorded work.
  const settled = renderToStaticMarkup(
    React.createElement(AgentPanel, { ...inFlight, working: false } satisfies AgentPanelProps),
  )
  assert.doesNotMatch(settled, /aria-label="Assistant is responding"/, 'a finished turn does not keep thinking')

  // An assistant turn with nothing yet is the indicator alone.
  const empty = renderToStaticMarkup(
    React.createElement(AgentPanel, {
      enabled: true,
      working: true,
      initialMessages: [{ id: 'a1', role: 'assistant' as const, parts: [] }],
    } satisfies AgentPanelProps),
  )
  assert.match(empty, /aria-label="Assistant is responding"/)
})

// --- a person can speak into a turn that is already streaming ----------------
//
// The reconciliation stands down during a stream, because the parts this panel is
// receiving are richer than anything the host has persisted. Right about the
// assistant, wrong about the person: a reader steering a running turn, or
// releasing a queued message into it, has their words appended to the transcript
// by the host immediately — and standing down meant those words appeared nowhere.
// The message was recorded, the agent was already acting on it, and the screen
// showed no trace of it.
test('a user turn appended by the host lands even while the panel is streaming', () => {
  const user = (id: string, text: string): AgentMessage =>
    ({ id, role: 'user', parts: [{ type: 'text', text }] }) as AgentMessage
  const assistant = (id: string, text: string): AgentMessage =>
    ({ id, role: 'assistant', parts: [{ type: 'text', text }] }) as AgentMessage
  const ids = (messages: AgentMessage[]) => messages.map((message) => message.id)

  // Mid-stream: the panel owns a partial answer, the host has the steered message.
  const current = [user('m1', 'look at stonk'), assistant('live', 'Checking…')]
  const host = [user('m1', 'look at stonk'), user('m2', 'so why did we sell stonk')]
  const merged = withHostUserTurns(current, host, new Set(['m1']))

  assert.deepEqual(ids(merged), ['m1', 'm2', 'live'], 'inserted before the streaming answer')
  // That is the order the finished transcript has, so nothing jumps when the run
  // ends and the whole thing is adopted.
  assert.equal((merged[2] as { parts: { text?: string }[] }).parts[0]?.text, 'Checking…', 'the stream is untouched')

  // Idempotent: a refresh bringing nothing new returns the same array, so this
  // cannot loop a render.
  assert.equal(withHostUserTurns(merged, host, new Set(['m1', 'm2'])), merged, 'no change, same reference')

  // The assistant is never taken from the host, so a host-side provisional answer
  // cannot duplicate the one being streamed.
  assert.deepEqual(
    ids(withHostUserTurns(current, [...host, assistant('live:run', 'partial')], new Set(['m1']))),
    ['m1', 'm2', 'live'],
    'no second assistant bubble',
  )

  // A provisional turn the host WITHDRAWS is dropped rather than left beside its
  // replacement. This is the queued-message case: shown from the queue as
  // `queued:d1`, then delivered as a real turn under a real id. Holding both would
  // print the same sentence twice.
  const holding = [user('m1', 'a'), user('queued:d1', 'send this now'), assistant('live', '…')]
  const delivered = withHostUserTurns(
    holding,
    [user('m1', 'a'), user('m9', 'send this now')],
    new Set(['m1', 'queued:d1']),
  )
  assert.deepEqual(ids(delivered), ['m1', 'm9', 'live'], 'the provisional turn gave way to the real one')

  // But a turn the PANEL owns is never dropped for being absent from the host: a
  // submit appends `user-<stamp>` optimistically and the host has not persisted it
  // yet. It was never a host id, so it is not a withdrawal.
  const optimistic = [user('m1', 'a'), user('user-1731', 'just typed'), assistant('live', '…')]
  assert.deepEqual(
    ids(withHostUserTurns(optimistic, [user('m1', 'a')], new Set(['m1']))),
    ['m1', 'user-1731', 'live'],
    'the optimistic turn survives',
  )

  // With no assistant in flight the new turns simply append.
  assert.deepEqual(
    ids(withHostUserTurns([user('m1', 'a')], [user('m1', 'a'), user('m2', 'b')], new Set(['m1']))),
    ['m1', 'm2'],
  )
})
