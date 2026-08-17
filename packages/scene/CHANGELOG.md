# @braedonsaunders/appkit-scene

## 1.0.0

### Major Changes

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

- Updated dependencies [22e968a]
- Updated dependencies [9f04661]
  - @braedonsaunders/appkit-ui@0.2.0

## 0.3.4

### Patch Changes

- Updated dependencies [0c2dde7]
- Updated dependencies [0c2dde7]
- Updated dependencies [a1d5d50]
- Updated dependencies [8a17e9e]
  - @braedonsaunders/appkit-ui@0.1.10
