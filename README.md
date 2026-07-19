# appkit

The design + platform foundation for the ecosystem. `appkit` is the single source
of truth for how every app in the suite **looks, feels, and works** — extracted
from the two sibling apps that already share this DNA (openbooks, beaconhs), then
raised to a flagship standard so a new app can be world-class on day one.

> Goal: the most modern, clean, complete, beautiful, animated app starter we can
> build. Every app in the ecosystem imports from here; nothing is re-invented
> per app.

## Why this exists

openbooks and beaconhs already share a design system so closely that
`button.tsx` is **byte-identical** between them — kept in sync by hand. beaconhs
has independently extracted a clean platform layer (`auth`, `db`, `tenant`,
`events`, `audit`). appkit ends the duplication: one repo, versioned packages,
imported by every app.

## Non-negotiable quality bar

1. **Fully tokenized.** No hardcoded colors in any component — ever. Everything
   resolves through the semantic token layer (`@appkit/tokens`), so an app
   rebrands by swapping channel values in one place, and dark mode is free.
2. **CSS-first Tailwind v4.** No legacy JS color config. Tokens are CSS custom
   properties surfaced as utilities via `@theme inline`.
3. **One motion system.** Durations and easings are tokens; every transition and
   animation references them. Motion is coherent, and `prefers-reduced-motion`
   is honored everywhere.
4. **Accessible by construction.** Focus-visible rings, keyboard semantics, ARIA,
   touch-target sizing, and reduced-motion are built into the primitives, not
   bolted on.
5. **Server-Component-safe.** Primitives render in RSC by default; `'use client'`
   only where interaction demands it.

## Package map

| Package | Role | Status |
|---|---|---|
| `@appkit/tokens` | Design tokens — color, radius, elevation, motion. Light/dark. The look. | **building** |
| `@appkit/ui` | Tokenized, animated primitives (button, card, input, badge, …). The feel. | **building** |
| `@appkit/shell` | App chrome — nav, sidebar, top bar, command palette, app switcher. | planned |
| `@appkit/tenant` | Postgres-RLS org scoping (`withOrg`), request context, RBAC. | planned |
| `@appkit/db` | Drizzle conventions — id/orgRef/money helpers, RLS policy SQL, migrate. | planned |
| `@appkit/auth` | Identity / session client (OIDC relying-party). | planned |
| `@appkit/events` | Event bus + transactional outbox + audit. | planned |
| `@appkit/forms-core` | The form/Builder engine. | planned |
| `@appkit/ledger-client` | Typed, idempotent client for the openbooks financial hub. | planned |
| `apps/starter` | The runnable starter — shell + showcase. Clone this to begin an app. | planned |

## Conventions

- **pnpm + Turborepo.** Internal packages link via `workspace:*`; nothing needs
  publishing to build locally.
- **Public scope `@appkit/*`** (placeholder — set your owned npm scope in
  `.changeset/config.json` before first publish).
- **License:** AGPL-3.0, matching the ecosystem. (Add the full license text to
  `LICENSE` before publishing.)

## Getting started

```bash
pnpm install
pnpm build      # turbo build across packages
pnpm typecheck
```
