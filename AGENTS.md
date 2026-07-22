# AGENTS.md — appkit

You are working in **appkit**, the shared design + platform foundation for the
application ecosystem. Everything an app needs to *look, feel, and work* like
the rest of the suite lives here, so it is never re-invented per app.

**Read this first, then skim [`docs/for-agents/`](docs/for-agents/):**
- [`orientation.md`](docs/for-agents/orientation.md) — the design system, the full
  primitive index, and the composition patterns. Read it and you can build a
  suite-consistent screen immediately.
- [`building-applications.md`](docs/for-agents/building-applications.md) — the
  **generalized, app-agnostic rules** for building any application on this
  foundation (distilled from the production reference applications). Apps built
  on appkit should adopt these verbatim.
- [`provenance.md`](docs/for-agents/provenance.md) — the audited distinction
  between faithful extraction, generalized production pattern, and
  appkit-original code. Never claim parity without a named sibling source.

## Mission

appkit is a pre-launch, production-bound foundation, not a prototype. Leave it
more coherent than you found it. The production reference applications already
share this DNA so closely that primitives were byte-identical between them —
appkit ends that duplication. When you improve a primitive here, every app that
imports it improves.

## Repo map

- `packages/tokens` — the design foundation. Semantic color/radius/elevation/
  motion tokens as CSS custom properties, surfaced as Tailwind v4 utilities via
  `@theme inline`. Light/dark from one `.dark` class. **The one place brand
  values live.**
- `packages/ui` — the component library. Tokenized, motion-aware, accessible,
  Server-Component-safe primitives (see the index in `orientation.md`).
- `packages/analytics` — the app-agnostic dashboard query core: semantic
  catalogues, safe formula AST/parser, parameter-bound Postgres compiler, result
  contract, and visualization registry. Apps provide domain sources/fields.
- `packages/dashboard` — the optional dashboard feature: dependency-light
  layouts/card types at the root, React Grid/Card Studio under `/react`, and
  feature-owned Drizzle persistence under `/schema`.
- `packages/ai` — the app-agnostic multi-step tool-agent runtime plus the
  streamed assistant thread/tool-use UI. Apps inject the resolved model,
  system prompt, tenant/RBAC-bound tools, persistence, and HTTP transport.
- `packages/sandbox` — the shared governed QuickJS kernel: fresh WASM runtimes,
  frozen input, async host capabilities, logs, structured faults, and bounded
  memory, stack, time, and units.
- `packages/scripts` — optional event, scheduled, endpoint, bulk, and
  opaque-origin client scripting over the sandbox, with jobs, React authoring,
  Drizzle persistence, and complete run auditing.
- `packages/apps` — optional installable application platform: manifests/ZIPs,
  versions/files, capability grants, storage, QuickJS backends, opaque-origin
  iframe frontends, bridge SDK, app authoring, marketplace, and memory/Drizzle
  adapters.
- `packages/db` — the **multi-tenant data layer**: a Postgres RLS engine
  (`createDb` → tenant-scoped `db` + BYPASSRLS `superDb`, `withTenant` /
  `withSuperAdmin`), schema helpers, the RLS policy installer, and the canonical
  identity schema (tenants / users / memberships / roles). An app gets tenant
  isolation + super-admin out of the box.
- `packages/tenant` — request context + RBAC on top of `@appkit/db`:
  `RequestContext`, `can` / `assertCan` (wildcards, read-tiers, per-user
  grant/deny overrides), `resolveMembershipAccess`, super-admin.
- `packages/iam` — optional full identity administration over those primitives:
  roles, memberships, scoped assignments, per-user overrides, invitation
  lifecycle, audit, production React screens, and memory/Drizzle adapters.
- `packages/editor`, `packages/forms-documents`, `packages/reports`,
  `packages/pdf`, `packages/forms-pdf`, and `packages/design-studio` — optional
  rich-text and document/print layers over their dependency-light contracts.
- `packages/workflows` — dependency-free workflow graphs at the root, with the
  shared React Flow authoring shell under `/react`.
- `packages/notifications` — dependency-free notification policy at the root,
  with React, Drizzle store, and feature-owned schema adapter entry points.
- `packages/customization` — app-supplied record catalogues, custom fields,
  configurable form layouts, and list views.
- `packages/create-appkit` — the public scaffold CLI. It composes the real shell,
  theme, navigation, page transition, and selected optional package groups into
  a minimal Next.js application without inventing product domain screens.
- `apps/playground` — the **living reference**: a runnable Next 16 app with the
  complete dashboard/card-building system, every primitive, and an `/admin`
  area (hub + settings shell). It is database-free by default and switches to
  the real Postgres/RLS adapters when both database URLs are configured. Read it
  to see any primitive in real use; keep it up to date when you add/change one.

pnpm + Turborepo. Internal packages link via `workspace:*`; the shared package
compiler emits clean `dist` artifacts with compiled ESM, declarations, semver
dependencies, styles, migrations, README, and license for npm publication.

## Working in appkit

- **Extract, don't invent.** These primitives are extracted from the real
  production reference sources and tokenized. When adding one, locate the real
  source in the adjacent reference repositories and port it faithfully
  (decouple app coupling — i18n, app-specific offsets — into props). Do **not**
  approximate from memory. If no source exists, say so and build it to the same
  quality bar.
- **Parity before generalization.** Extract the complete reusable source surface
  and its behavior before calling a package complete. A schema, loader,
  read-only preview, partial shell, or demo-specific imitation is not parity
  when the source application also has an editor, inspector, runtime, adapter,
  or persistence seam. Generalize product coupling through typed inputs; do not
  omit working source capabilities.
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
pnpm lint             # package boundaries + isolated roots + workspace lint
pnpm build            # turbo build
pnpm test:packages    # inspect real packed npm artifacts
pnpm test:consumers   # install tarballs in fresh Node/React/Next consumers
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
