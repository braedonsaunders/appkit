# @braedonsaunders/appkit-ai

The shared multi-step agent layer for bounded, tenant-aware assistant surfaces.

The server entry point accepts an AI SDK `LanguageModel`, system prompt, prior
model messages, and a tenant-bound `ToolSet`. It deliberately imports no app
schema, tenant package, provider credential store, or domain prompt. A consuming
app resolves those at the request boundary and exposes only tools whose execute
functions already enforce its `RequestContext` and RBAC policy.

`@braedonsaunders/appkit-ai/react` supplies the streaming assistant thread, UI-message decoder,
markdown renderer, generic tool-use cards, abort control, composer, welcome and
disabled states. Conversation persistence and the HTTP transport stay app-owned.
Hosts can place contextual controls in the panel's fixed header with the optional
`headerActions` prop and replace the stock first-message card with a full-height
application stage through `emptyContent`. Consecutive tool calls collapse into
one quiet activity line showing the newest action and total step count; operators can expand it to
inspect every input and result without letting a long run overwhelm the thread.

The composer remains extensible without being replaced. `composerActions` adds
controls beside the text input, `composerContent` renders application-owned
draft state above it, and `composerDraft` supplies a file-only fallback prompt
plus parts for the optimistic user turn. Persisted user messages can include
`{ type: 'file', filename, url? }` parts, which render as compact attachment
links.

While the first assistant parts are streaming, `AgentPanel` renders a subtle
three-dot typing cadence through the exported `AgentTypingIndicator`. Its pure
CSS motion uses AppKit duration/easing tokens, is independent of an app's
Tailwind content scan, and becomes a static ellipsis under reduced motion.

Applications with durable session dispatch can pass `dispatchState` and an
ordered `queuedMessages` collection. While work is running, recovering, or
already queued, new composer submissions go through the app-owned `enqueue`
callback instead of bypassing the queue. AppKit presents queue position and
lifecycle state and exposes optional edit, remove, and retry actions; the host
continues to own persistence, authorization, FIFO claiming, idempotency, and
recovery.

```tsx
<AgentPanel
  enabled
  dispatchState="running"
  queuedMessages={queue.map((entry) => ({
    id: entry.id,
    text: entry.prompt,
    position: entry.position,
    status: entry.status,
    editable: entry.status === 'queued',
    removable: entry.status === 'queued',
    retryable: entry.status === 'failed',
  }))}
  enqueue={persistQueuedTurn}
  onEditQueuedMessage={openQueueEditor}
  onRemoveQueuedMessage={removeQueuedTurn}
  onRetryQueuedMessage={retryQueuedTurn}
  send={startTurn}
/>
```

```ts
import { runAgentTurn } from '@braedonsaunders/appkit-ai'

return runAgentTurn({
  model,
  system,
  messages,
  tools: tenantBoundTools,
  onComplete: persistAssistantTurn,
})
```

For visual tool loops, call `pruneVisualToolContext` from the AI SDK
`prepareStep` hook. It removes historical and exact-duplicate tool-result
images while leaving the newest distinct frames, tool structure, text, and
user-supplied images intact. Persist the complete screenshot record separately.
