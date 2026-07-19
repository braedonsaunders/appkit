# AGENTS.md — appkit

You are working in **appkit**, the shared design + platform foundation for the
ecosystem (openbooks, beaconhs, and apps built on top of them). Everything an app
needs to *look, feel, and work* like the rest of the suite lives here, so it is
never re-invented per app.

**Read this first, then skim [`docs/for-agents/`](docs/for-agents/):**
- [`orientation.md`](docs/for-agents/orientation.md) — the design system, the full
  primitive index, and the composition patterns. Read it and you can build a
  suite-consistent screen immediately.
- [`building-applications.md`](docs/for-agents/building-applications.md) — the
  **generalized, app-agnostic rules** for building any application on this
  foundation (distilled from the openbooks + beaconhs AGENTS.md). Apps built on
  appkit should adopt these verbatim.

## Mission

appkit is a pre-launch, production-bound foundation, not a prototype. Leave it
more coherent than you found it. The two sibling apps (openbooks, beaconhs)
already share this DNA so closely that primitives were byte-identical between
them — appkit ends that duplication. When you improve a primitive here, every
app that imports it improves.

## Repo map

- `packages/tokens` — the design foundation. Semantic color/radius/elevation/
  motion tokens as CSS custom properties, surfaced as Tailwind v4 utilities via
  `@theme inline`. Light/dark from one `.dark` class. **The one place brand
  values live.**
- `packages/ui` — the component library. Tokenized, motion-aware, accessible,
  Server-Component-safe primitives (see the index in `orientation.md`).
- `apps/playground` — the **living reference**: a runnable Next 16 app that
  showcases every primitive + an `/admin` area (hub + settings shell). Read it to
  see any primitive in real use; keep it up to date when you add/​change a primitive.

pnpm + Turborepo. Internal packages link via `workspace:*` — nothing needs
publishing to build locally.

## Working in appkit

- **Extract, don't invent.** These primitives are extracted from the real
  openbooks/beaconhs source and tokenized. When adding one, find the real source
  in `~/Documents/openbooks/packages/ui` or
  `~/Documents/Code/beaconhs-platform/packages/ui` and port it faithfully
  (decouple app coupling — i18n, app-specific offsets — into props). Do **not**
  approximate from memory. If no source exists, say so and build it to the same
  quality bar.
- **Fully tokenized — no hardcoded colors, ever.** Every color resolves through a
  semantic token (`bg-surface`, `text-fg`, `border-border`, `text-primary`,
  `bg-danger-subtle`, …). A raw `slate`/`teal`/`#hex` in a component is a bug.
  Preserve light **and** dark in every change.
- **One motion system, and it never hides content.** Durations/easings are
  tokens. **Entrance/reveal animations must be visible-by-default** — use CSS
  `@starting-style` transitions (see `.reveal` and `.appkit-row` in
  `tokens.css`), never a JS/rAF-gated `motion.div` with `opacity:0` initial for
  content. rAF pauses in backgrounded/prerendered tabs (stranding content) and an
  SSR/client `initial` mismatch causes hydration errors. Reserve framer-motion
  for **interaction-driven, foreground-only** motion (drawers, dialogs, toasts,
  the tabs indicator, popovers). Honor `prefers-reduced-motion` everywhere.
- **Server-Component-safe.** Primitives render in RSC by default; add
  `'use client'` only where interaction demands it.

## Validation gates (green before "done")

```bash
pnpm install
pnpm -r typecheck     # tsc --noEmit across every workspace
pnpm build            # turbo build
```

Never commit on red. Never `ts-ignore` / `eslint-disable` / `--no-verify` around
a gate — fix the underlying issue.

## Verify in the real browser

UI changes are verified by driving the playground, not by typecheck alone —
that's how the motion-stranding and hydration bugs above were caught.

1. `preview_start` the playground, load the route.
2. Check `read_console_messages` for errors, then screenshot.
3. **Console buffer is per-tab and accumulates across reloads** — after a fix,
   open a *fresh tab* for a clean read (stale errors otherwise look live).
4. Framer/CSS entrance animations idle in hidden headless tabs — inject a CSS
   override (`el.style.opacity='1'`) to screenshot; that's a headless artifact,
   not a real-browser bug. (The visible-by-default rule above means content still
   renders even when the animation is paused.)

## Non-negotiable rules (summary)

The full, generalized set is in
[`building-applications.md`](docs/for-agents/building-applications.md). The core:

1. **Clean cutover** — no legacy code, shims, deprecated paths, or duplicate
   flows. Pre-launch: delete, don't deprecate.
2. **Complete, production-grade code** — no stubs, placeholders, mocks,
   TODO-driven behavior, fake data paths, or "wire it later."
3. **See a bug, fix it** (or flag clearly if too large for the current pass).
4. **Search before building** — no duplicates; reuse the existing primitive.
5. **Unify & abstract** shared behavior that reduces real duplication.
6. **No dead code** — no abandoned files, unused exports, stale routes, shadow
   systems. Flag and clean up in the same change.
7. **Docs are part of the feature** — keep the playground and these docs truthful
   in the same change that alters a primitive.
8. **Commit atomically to local `main`.** Stage only files you intentionally
   touched (concurrent worktrees exist — never revert files you didn't edit). End
   commit messages with the Claude co-author trailer.

## Agent handoff

End completed work with a condensed checklist: what you changed, what you
verified (and how), and what remains risky. Name any bug you found and fixed.
Keep the docs honest — if a primitive and its doc disagree, fix it in the same
change.
