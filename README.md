![appkit](docs/assets/appkit-logo.svg)

The design + platform foundation for the ecosystem. `appkit` is the single source
of truth for how every app in the suite **looks, feels, and works** — extracted
from the two sibling apps that already share this DNA (openbooks, beaconhs), then
raised to a flagship standard so a new app can be world-class on day one.

> Goal: the most modern, clean, complete, beautiful, animated app starter we can
> build. Every app in the ecosystem imports from here; nothing is re-invented
> per app.

> **Agents & new engineers:** start at [`AGENTS.md`](AGENTS.md) and
> [`docs/for-agents/`](docs/for-agents/) — the design-system orientation, the full
> primitive index, and the generalized rules for building apps on this foundation.

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
| `@appkit/tokens` | Semantic color, shape, elevation, and motion tokens; Tailwind v4 utilities. | implemented |
| `@appkit/ui` | Tokenized primitives, app shell, page layouts, URL-driven list controls, and API reference. | implemented |
| `@appkit/db` | Postgres RLS engine, schema helpers, identity model, API keys, and idempotency. | implemented + live-tested |
| `@appkit/tenant` | Request context and wildcard RBAC over tenant-scoped database handles. | implemented + live-tested |
| `@appkit/auth` | Scrypt passwords and stateless HMAC sessions. | implemented + live-tested |
| `@appkit/events` | Audit trail and transactional outbox. | implemented + live-tested |
| `@appkit/api` | API-key auth, authorization, idempotent writes, typed errors, and OpenAPI descriptions. | implemented + live-tested |
| `@appkit/endpoints` | Governed QuickJS sandbox for user-defined endpoint handlers. | implemented |
| `@appkit/crypto` | AES-256-GCM sealed secrets with an HKDF-derived application key. | implemented |
| `@appkit/emails` | Resend, SendGrid, Mailgun, Postmark, and SMTP delivery with tenant policy. | implemented |
| `@appkit/sms` | Twilio, Vonage, MessageBird, Plivo, and Telnyx delivery with tenant policy. | implemented |
| `@appkit/jobs` | BullMQ + Redis queue and worker harness. | implemented |
| `@appkit/storage` | S3-compatible object storage and presigned URLs. | implemented |
| `@appkit/forms-core` | The form/Builder engine. | planned |
| `apps/playground` | The full-stack running reference app and component gallery. | implemented + browser-tested |

## The running reference

`apps/playground` composes the platform instead of merely displaying components:
real login and signed sessions, Postgres RLS tenant isolation, RBAC-gated audited
mutations, a key-authenticated API, and URL-driven database lists. It also keeps
the component gallery and admin reference surfaces in the same runnable app.

```bash
pnpm install
cp apps/playground/.env.example apps/playground/.env.local
# Point APPKIT_SUPER_URL at an existing Postgres database owner/superuser.
pnpm --filter @appkit/playground seed
pnpm --filter @appkit/playground dev
```

The seed command prints the live API key. The default local users are
`admin@appkit.dev` and `casey@appkit.dev`, both with password `appkit-demo`.

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
pnpm -r typecheck
pnpm -r test
pnpm build
```
