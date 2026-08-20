# @braedonsaunders/appkit-ai

## 1.1.5

### Patch Changes

- dea1537: Contain visually hidden credential labels within inline secret cards so long transcripts cannot expand the document scroll area, and add breathing room above the secure-submit actions.

## 1.1.4

### Patch Changes

- 8c15266: Render durable governed-action approval requests inline in agent conversations, with optional exact-action details, operator notes, and approve or decline callbacks.

## 1.1.3

### Patch Changes

- b8f7184: Add an inline, transcript-safe credential request card with accessible pending,
  stored, and expired states, caller-owned submission, and immediate input
  clearing. Harden tool activity counting against duplicated rendered steps.

## 1.1.2

### Patch Changes

- 303b940: Animate the AgentPanel streaming indicator with a subtle tokenized stagger and a static reduced-motion fallback.

## 1.1.1

### Patch Changes

- 857c73f: Let applications add attachment actions and draft content to AgentPanel, send
  file-only drafts, and render file parts on persisted and optimistic user turns.

## 1.1.0

### Minor Changes

- c557f47: Add an application-controlled durable message queue to `AgentPanel`, including ordered status presentation and edit, remove, and retry actions.

## 1.0.3

### Patch Changes

- cfe19a9: Move the DNS-pinned, SSRF-safe HTTPS transport into the shared egress package and remove AI's accidental runtime dependency on the data-sync package. Sync continues to re-export the transport for compatibility.
- Updated dependencies [cfe19a9]
  - @braedonsaunders/appkit-egress-proxy@0.1.1

## 1.0.2

### Patch Changes

- e9d9ad8: Allow applications to replace AgentPanel's stock empty card with a full-height branded stage while retaining the shared header, composer, streaming, and persistence behavior.
- 1db6afd: Allow applications to place contextual controls in `AgentPanel`'s fixed header through the optional `headerActions` prop. Existing conversations now open at their newest message, streaming scroll stays inside the message viewport instead of moving the surrounding page, and consecutive tool calls collapse to a subtle latest-step summary with expandable details.

## 1.0.1

### Patch Changes

- Add bounded visual-context pruning, durable fenced event execution and cursor following, and portable, provider-conformant desk state contracts.

## Unreleased

- Add `pruneVisualToolContext`, which keeps only the newest distinct tool-result
  images without changing tool-call structure or removing user-supplied images.

## 1.0.0

### Minor Changes

- 8342b35: Stop killing model requests that are merely slow.

  Outbound requests through `secureFetch` were capped at two minutes, and
  `@braedonsaunders/appkit-ai` asked for exactly that. Two minutes is a sensible ceiling for the
  webhooks and REST calls the egress guard was written for, and it is inside the
  normal range for the one thing that legitimately takes longer: a reasoning model
  working through a tool-using turn.

  Measured against several hosted models, single steps regularly ran past two
  minutes and the socket was destroyed mid-generation. The failure is worse than a
  slow answer. The provider had streamed nothing and billed nothing, so there was
  no partial result to keep; the caller saw only `Outbound request timed out after
119993 ms`; and for an agent loop the whole run died with it, discarding every
  step that had already completed and been paid for. Two consecutive runs of one
  scheduled task were lost this way with zero tokens spent.

  `MAX_TIMEOUT_MS` in the egress guard rises to fifteen minutes and
  `AI_REQUEST_TIMEOUT_MS` to ten. Neither is a budget — callers still state their
  own timeout and their own loop governs how much work is done — this only stops
  the guard refusing a wait that a caller has good reason to ask for. The ceiling
  remains, because an unbounded wait is how a worker wedges.

### Patch Changes

- Updated dependencies [22e968a]
- Updated dependencies [8342b35]
- Updated dependencies [9f04661]
  - @braedonsaunders/appkit-ui@0.2.0
  - @braedonsaunders/appkit-sync@1.1.0

## 0.2.0

### Minor Changes

- 3ae036d: Complete the production builder and runtime extraction pass: full form and print-design authoring, hardened form PDF rendering, dashboard lifecycle composition, report refinement/cadence/run claiming, AI production helpers, transactional event relay, notification digest/push policy, source connector and destination registries, and persisted-query validation.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @braedonsaunders/appkit-sync@1.0.0
  - @braedonsaunders/appkit-ui@0.1.1
