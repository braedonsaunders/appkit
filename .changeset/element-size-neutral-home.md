---
'@appkitjs/ui': minor
'@appkitjs/scene': major
---

Move `useElementSize` out of the scene package and into `@appkitjs/ui`.

The hook is a bare `ResizeObserver` wrapper — it measures an element and
re-renders on resize — but it lived beside the walking-character animation loop
and was reachable only through the `@appkitjs/scene` root entry. Any consumer that
wanted to measure a div had to import a module graph whose scene artwork is well
over 150KB of drawn SVG, and `@appkitjs/scene` declared no `sideEffects`, so a
bundler could not prove the unused stages were safe to drop. Call screens that
just needed a viewport height were paying for a painted office.

`useElementSize` now ships from `@appkitjs/ui`, which every app already installs,
and additionally from the `@appkitjs/ui/use-element-size` entry point for
consumers that want the hook without the component barrel. `@appkitjs/scene`
imports it from there like any other primitive.

`@appkitjs/scene` also declares `sideEffects: ["*.css"]` — its modules are pure
declarations and the stages tree-shake, while `styles.css` stays listed because
dropping it would strip the Tailwind `@source` registration that generates the
arbitrary-value classes the painted props position themselves with.

Breaking for `@appkitjs/scene`: `useElementSize` is no longer exported. Import it
from `@appkitjs/ui` instead.
