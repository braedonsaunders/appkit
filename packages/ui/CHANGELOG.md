# @appkit/ui

## 0.1.1

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- 1319bfb: Restore the source `DocumentTitle`, `DetailHeader`, and `BackLinkLike` contracts,
  replace raw settings-card palette classes with semantic AppKit tokens, and make
  hover pause and resume toast dismissal instead of toggling an unused flag.
- Updated dependencies [3ab6056]
  - @appkit/tokens@0.1.1
