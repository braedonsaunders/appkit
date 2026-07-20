# @appkit/ai

The shared multi-step agent layer for bounded, tenant-aware assistant surfaces.

The server entry point accepts an AI SDK `LanguageModel`, system prompt, prior
model messages, and a tenant-bound `ToolSet`. It deliberately imports no app
schema, tenant package, provider credential store, or domain prompt. A consuming
app resolves those at the request boundary and exposes only tools whose execute
functions already enforce its `RequestContext` and RBAC policy.

`@appkit/ai/react` supplies the streaming assistant thread, UI-message decoder,
markdown renderer, generic tool-use cards, abort control, composer, welcome and
disabled states. Conversation persistence and the HTTP transport stay app-owned.

```ts
import { runAgentTurn } from '@appkit/ai'

return runAgentTurn({
  model,
  system,
  messages,
  tools: tenantBoundTools,
  onComplete: persistAssistantTurn,
})
```
