# @appkit/ui

## 0.1.7

### Patch Changes

- 0c2dde7: Make the navigation primitives honor `UiLinkProvider`. `TopNav`, `SidebarNav`,
  and `MobileTabBar` each carried their own `defaultLink` that rendered a raw
  `<a href>`, so an app that injected a router link at the root still full-reloaded
  the document on every nav click — tearing down the router, discarding client
  state, and skipping the `PageTransition` route animation entirely. Only
  `SettingsLayout` resolved through `UiLink`.

  The four copies are replaced by a single `defaultLinkRender` exported from
  `link-context`, which resolves through `UiLink` and still falls back to a plain
  `<a>` when no provider is present. `LinkRender` now lives beside it and is
  re-exported from `settings-layout`, so the public type path is unchanged. Apps
  passing an explicit `linkRender` are unaffected.

- 0c2dde7: Give the native page transition a real presence. The route handoff was tuned so
  quietly (opacity 0.9 → 1 over a 1px lift) that navigation read as an instant
  swap. It is now a lift-and-settle crossfade: the outgoing canvas clears on the
  fast duration token while the incoming one rises 12px and settles from a 0.99
  scale on `--duration-slow` / `--ease-out`. Exit stays shorter than entrance so
  the snapshots overlap only briefly and text never ghosts against itself.

  Durations and easings remain tokens, `prefers-reduced-motion` is still honored,
  and the `PageTransition` contract is unchanged — consuming apps pick this up
  with no code edits.

- a1d5d50: Add `@appkit/scheduling`: critical-path scheduling with working calendars,
  work-breakdown rollups, baselines, resource leveling, and the Gantt / list /
  board authoring surface under `@appkit/scheduling/react`.

  `@appkit/ui` gains a `calendar` navigation icon key.

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
