# @braedonsaunders/sync

## 1.1.0

### Minor Changes

- 8342b35: Stop killing model requests that are merely slow.

  Outbound requests through `secureFetch` were capped at two minutes, and
  `@braedonsaunders/ai` asked for exactly that. Two minutes is a sensible ceiling for the
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

## 1.0.0

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
  - @braedonsaunders/db@0.2.0
