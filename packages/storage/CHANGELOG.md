# @appkit/storage

## 0.2.0

### Minor Changes

- 1319bfb: Add tenant-owned object keys, multipart upload, byte ranges, streaming downloads,
  verified promotion, lifecycle tags, rich metadata, existence checks, safe
  existing-object presigning, and idempotent private-bucket readiness enforcement.
  The generic `@appkit/storage/env` entry supplies a strict portable environment
  contract without application-specific defaults or credentials.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @appkit/ui@0.1.1
