# @appkit/reports

## 0.2.1

### Patch Changes

- 1e69bf8: Replace schedule-time rolling-days and raw JSON controls with the same compiler-native filter tree used by report definitions. Hosts provide the authorized report entity with each schedule definition.

## 0.2.0

### Minor Changes

- 6502bed: Make the shared paper preview honor the canonical report layout's margin and
  summary visibility, carry layouts through result views, and remove
  migration-only React aliases from the public package boundary.
- 3ae036d: Complete the production builder and runtime extraction pass: full form and print-design authoring, hardened form PDF rendering, dashboard lifecycle composition, report refinement/cadence/run claiming, AI production helpers, transactional event relay, notification digest/push policy, source connector and destination registries, and persisted-query validation.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @appkit/analytics@0.2.0
  - @appkit/ui@0.1.1
