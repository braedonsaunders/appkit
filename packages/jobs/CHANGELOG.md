# @appkit/jobs

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
  - @appkit/sync@1.0.0
  - @appkit/email-render@0.1.1
