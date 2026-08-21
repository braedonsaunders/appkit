# @braedonsaunders/appkit-ui

## 0.2.1

### Patch Changes

- a923c9b: Keep report studio usable while a name is blank, add Save as, keep relation filters on the physical identifier, expose related-table columns, and stop SearchSelect menus from running off the page.

## 0.2.0

### Minor Changes

- 22e968a: Move `useElementSize` out of the scene package and into `@braedonsaunders/appkit-ui`.

  The hook is a bare `ResizeObserver` wrapper — it measures an element and
  re-renders on resize — but it lived beside the walking-character animation loop
  and was reachable only through the `@braedonsaunders/appkit-scene` root entry. Any consumer that
  wanted to measure a div had to import a module graph whose scene artwork is well
  over 150KB of drawn SVG, and `@braedonsaunders/appkit-scene` declared no `sideEffects`, so a
  bundler could not prove the unused stages were safe to drop. Call screens that
  just needed a viewport height were paying for a painted office.

  `useElementSize` now ships from `@braedonsaunders/appkit-ui`, which every app already installs,
  and additionally from the `@braedonsaunders/appkit-ui/use-element-size` entry point for
  consumers that want the hook without the component barrel. `@braedonsaunders/appkit-scene`
  imports it from there like any other primitive.

  `@braedonsaunders/appkit-scene` also declares `sideEffects: ["*.css"]` — its modules are pure
  declarations and the stages tree-shake, while `styles.css` stays listed because
  dropping it would strip the Tailwind `@source` registration that generates the
  arbitrary-value classes the painted props position themselves with.

  Breaking for `@braedonsaunders/appkit-scene`: `useElementSize` is no longer exported. Import it
  from `@braedonsaunders/appkit-ui` instead.

### Patch Changes

- 9f04661: Keep dialog and drawer focus stable while controlled form fields rerender.

  Inline close callbacks no longer restart overlay focus management on every
  keystroke, and explicit `autoFocus` fields take precedence over corner close
  buttons when an overlay first opens.

## 0.1.10

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

- a1d5d50: Add `@braedonsaunders/appkit-scheduling`: critical-path scheduling with working calendars,
  work-breakdown rollups, baselines, resource leveling, and the Gantt / list /
  board authoring surface under `@braedonsaunders/appkit-scheduling/react`.

  `@braedonsaunders/appkit-ui` gains a `calendar` navigation icon key.

- 8a17e9e: Keep URL-backed search input authoritative while overlapping route transitions
  settle. Previously, an older streamed response could restore its query value
  after the user had typed additional characters, visibly deleting newer input.

  `SearchInput` now tracks whether it owns an uncommitted local edit, ignores stale
  URL snapshots until all navigation settles with that exact value, and still
  adopts browser-history or link changes whenever no local edit is pending.

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
  - @braedonsaunders/appkit-tokens@0.1.1
