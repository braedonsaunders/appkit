# @appkit/design-studio

## 0.2.0

### Minor Changes

- 3ae036d: Complete the production builder and runtime extraction pass: full form and print-design authoring, hardened form PDF rendering, dashboard lifecycle composition, report refinement/cadence/run claiming, AI production helpers, transactional event relay, notification digest/push policy, source connector and destination registries, and persisted-query validation.
- 9260ff0: Add a controlled, application-agnostic Fabric workspace to the
  optional React entry, including artboards, insertion, layer ordering, selection,
  drag/resize, inline text editing, basic inspectors, zoom/fullscreen, and print
  provider controls. This does not yet claim source API or full inspector parity.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- 374beb4: Keep the design workspace header and empty inspector at stable heights when the
  canvas selection changes, and prevent long selection copy from reflowing the
  editor.
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @appkit/tokens@0.1.1
  - @appkit/ui@0.1.1
