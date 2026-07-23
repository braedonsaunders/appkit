# @appkit/emails

## 0.2.0

### Minor Changes

- 1319bfb: Add configurable HKDF contexts for application-owned encryption profiles and
  restore hardened development-loopback SMTP behavior without introducing
  application-specific package entries or environment contracts.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [1319bfb]
- Updated dependencies [3ab6056]
  - @appkit/crypto@0.2.0
