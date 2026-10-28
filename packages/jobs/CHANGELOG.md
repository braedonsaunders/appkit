# @braedonsaunders/appkit-jobs

## 0.3.0

### Minor Changes

- a8f7b6a: Add the pure `/recurrence` entry for anchored intervals, one-time instants,
  IANA-zone daily/weekly/monthly calendars, active weekdays and overnight windows,
  explicit DST handling, strict validation, and skip/coalesce cursor advancement.
  Timezone calculations use Temporal without importing the Redis or BullMQ runtime.

## 0.2.4

### Patch Changes

- Updated dependencies [e67bb83]
  - @braedonsaunders/appkit-egress-proxy@0.2.1

## 0.2.3

### Patch Changes

- Updated dependencies [52ac979]
  - @braedonsaunders/appkit-egress-proxy@0.2.0

## 0.2.2

### Patch Changes

- c085d3b: Route Web Push validation and delivery through AppKit's dedicated secure egress transport instead of pulling the full synchronization package into queue consumers.

## 0.2.1

### Patch Changes

- Updated dependencies [8342b35]
  - @braedonsaunders/appkit-sync@1.1.0

## 0.2.0

### Minor Changes

- 1319bfb: Add isolated Redis readiness probes, source-grade queue payload validation, and an atomic fixed-window rate limiter with explicit lifecycle management.
  The optional Web Push entry validates subscriptions, rechecks public DNS at
  persistence and delivery boundaries, bounds encrypted payloads, and preserves
  terminal provider status for subscription cleanup.

### Patch Changes

- 3ae036d: Complete the production builder and runtime extraction pass: full form and print-design authoring, hardened form PDF rendering, dashboard lifecycle composition, report refinement/cadence/run claiming, AI production helpers, transactional event relay, notification digest/push policy, source connector and destination registries, and persisted-query validation.
- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
  - @braedonsaunders/appkit-sync@1.0.0
  - @braedonsaunders/appkit-email-render@0.1.1
