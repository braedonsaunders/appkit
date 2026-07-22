<p align="center">
  <img src="docs/assets/appkit-hero.svg" alt="AppKit — build the product" width="100%" />
</p>

<p align="center">
  <strong>A production application foundation you can adopt one package at a time.</strong><br />
  Design system, app shell, multi-tenancy, forms, analytics, workflows, integrations, documents, communications, and more—composable without becoming inseparable.
</p>

<p align="center">
  <a href="https://appkit-demo-braedonsaunders-projects.vercel.app/dashboard/platform"><strong>See what you can build</strong></a> ·
  <a href="#start-small-or-take-the-whole-stack">Quick start</a> ·
  <a href="https://appkit-demo-braedonsaunders-projects.vercel.app/packages">Packages</a> ·
  <a href="#modular-by-construction">Architecture</a> ·
  <a href="#running-reference-app">Demo app</a> ·
  <a href="docs/for-agents/orientation.md">Documentation</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/License-AGPL--3.0-0d9488" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000?logo=next.js&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="PostgreSQL RLS" src="https://img.shields.io/badge/PostgreSQL-RLS-4169E1?logo=postgresql&logoColor=white" />
</p>

---

## Build your app, not its foundation

AppKit is the reusable product layer between a framework and your application.
It gives you the pieces teams usually spend their first year rebuilding: a
coherent interface, responsive navigation, tenant isolation, permissions,
auditing, dashboard and report builders, forms, workflows, notifications,
external data sync, outbound integrations, documents, background work, and
provider-neutral delivery.

Use `@appkit/ui` for a polished shell and component system. Add
`@appkit/db` and `@appkit/tenant` when you need multi-tenant Postgres with RLS.
Install forms, analytics, workflows, sync, or PDF only when your product needs
them. The package boundaries are deliberate: adopting one capability does not
pull the whole platform into your process or browser bundle.

AppKit is especially useful for SaaS products, internal tools, operations
platforms, admin consoles, vertical software, and app builders that need more
than a component gallery but do not want a rigid all-or-nothing framework.

## Why AppKit

- **A real application system.** Navigation, settings, data lists, builders,
  drawers, dashboards, audit history, jobs, storage, and delivery paths are
  designed to work together—not presented as disconnected examples.
- **Modular without integration tax.** Every feature has a dependency-light
  core and explicit optional adapters for React, Drizzle, providers, browser
  automation, editors, canvas engines, and database drivers.
- **Secure defaults.** PostgreSQL RLS, wildcard RBAC, sealed secrets,
  idempotent mutations, transactional outbox, isolated user code, sandboxed
  installable apps, SSRF-safe
  egress, and fail-closed sync snapshots are available as first-class packages.
- **One design language.** Semantic tokens drive light and dark themes,
  Tailwind v4 utilities, radius, elevation, and motion. Rebrand the entire
  system by replacing channel values in one CSS file.
- **Application-owned domains.** AppKit supplies engines and contracts; your app
  supplies record catalogues, analytics sources, workflow actions, connectors,
  authorization context, and persistence policy. Product concepts never leak
  into reusable packages.
- **Proven in production.** The foundation generalizes production application
  patterns, preserves reusable behavior, and keeps domain coupling behind
  injected adapters.

## Start small or take the whole stack

Start a new Next.js application with the shell, tokens, theme runtime, and page
transitions already connected:

```bash
pnpm create appkit my-app
```

Add optional capability groups at creation time:

```bash
pnpm create appkit operations --features forms,tenancy,workflows --yes
```

The scaffold is deliberately small: it gives you a production-shaped AppKit
application without generating product-specific routes, records, or fake data.

Install only the interface foundation:

```bash
pnpm add @appkit/ui @appkit/tokens
```

```css
/* app/globals.css */
@import "@appkit/ui/styles.css";
@source '../app';
```

```tsx
import { AppShell, Toaster } from "@appkit/ui";

export default function Application({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  return (
    <>
      <AppShell groups={navigation} pathname={pathname}>{children}</AppShell>
      <Toaster richColors closeButton />
    </>
  );
}
```

Add a tenant-safe backend when you need it:

```bash
pnpm add @appkit/db @appkit/tenant drizzle-orm postgres
```

```ts
import { assertCan } from "@appkit/tenant";

assertCan(requestContext, "projects.write");
await requestContext.db(async (db) => {
  await db.insert(projects).values(input);
});
```

Published packages contain compiled ESM, TypeScript declarations, source maps,
styles, and required migrations—not monorepo source or tests. Every package is
independently installable; internal AppKit dependencies use normal semver ranges
in npm artifacts while this repository keeps fast `workspace:*` links locally.

## What you can build with

### Interface and product builders

| Package                 | What it gives your app                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@appkit/tokens`        | Semantic light/dark brand, shape, elevation, and motion tokens surfaced through Tailwind v4.                                                                                  |
| `@appkit/ui`            | Accessible primitives, topbar/sidebar app shell, account launcher, search, notifications, settings, record and paged tables, subtabs, drawers, uploads, signatures, page layouts, and route transitions. |
| `@appkit/dashboard`     | Responsive drag/resize dashboards, reusable insight cards, a card library, query studio, visualizations, lifecycle controls, and optional Drizzle persistence.                 |
| `@appkit/forms-core`    | Versioned schemas, field registry, formulas, conditional logic, validation, scoring, and source-compatible business and safety automation contracts.                          |
| `@appkit/forms`         | Production form authoring and fill UI: field/section inspectors, tables, matrices, formulas, data binding, pages, guided workflows, record configuration, and typed host adapters. |
| `@appkit/editor`        | Optional controlled TipTap rich-text authoring.                                                                                                                               |
| `@appkit/customization` | Versioned form layouts, custom fields, and the production record-list system: saved views, subtabs, search, filters, sorting, paging, drill-through, designers, plus optional memory and tenant-scoped Drizzle persistence. Your app supplies its record catalogue once; AppKit keeps every editor, validator, and store on that contract. |
| `@appkit/design-studio` | Bounded multi-artboard print design, safe HTML/print output, and an interactive Fabric workspace with transforms, layers, zoom, and full property editing.                     |
| `@appkit/i18n`          | Tenant locale policy, request negotiation, user overrides, and localized authored content.                                                                                    |

Bind customization to your records once and retain key-based calls throughout
the application:

```ts
import { createCustomizationEngine } from '@appkit/customization'
import { createMemoryListViewStore } from '@appkit/customization/memory'

const customization = createCustomizationEngine(recordTypes)
const listStore = createMemoryListViewStore({ registry: customization.registry })
const systemView = customization.defaultListView('work_order')
```

The same catalogue drives the form designer, list-view designer, runtime record
table, API validation, and memory or Postgres persistence—without putting your
product’s record names, routes, queries, or permissions inside AppKit.

### Data, access, and extension

| Package             | What it gives your app                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@appkit/db`        | Tenant-scoped Postgres execution, BYPASSRLS system access, identity schema, API keys, schema helpers, and RLS installation. |
| `@appkit/tenant`    | Request context, wildcard RBAC, read tiers, visibility scopes, grant/deny overrides, and super-admin behavior.              |
| `@appkit/iam`       | Optional roles, memberships, scoped assignments, permission exceptions, audit, full administration UI, and memory/HTTP/Drizzle adapters. |
| `@appkit/auth`      | Durable sessions, passwords and resets, magic links, invitation grants, OAuth accounts, React forms, and memory/Drizzle/Next adapters. |
| `@appkit/events`    | Structured audit records, transactional outbox, recipient resolution, leased relay, durable retries, and effects ledger.      |
| `@appkit/api`       | API-key authorization, idempotent writes, typed public errors, and OpenAPI descriptions.                                    |
| `@appkit/sandbox`   | Shared QuickJS isolation with memory, stack, deadline, governance, frozen-input, host-function, log, and structured-fault contracts. |
| `@appkit/endpoints` | Resource-bounded `handler(request)` programs with storage, records, and application-governed host capabilities.             |
| `@appkit/scripts`   | Event, scheduled, endpoint, bulk, and opaque-origin client scripts with a production CodeMirror editor, run/log inspection, vetoes, allowed mutations, cron, jobs, auditing, Drizzle storage, and a bound cutover runtime. |
| `@appkit/apps`      | Installable app manifests and ZIPs, a nested file browser and syntax editors, immutable versions, storage, capabilities, QuickJS backends, opaque-origin preview, bridge SDK, run inspection, marketplace, memory, Drizzle, and bound lifecycle adapters. |
| `@appkit/ai`        | Provider-neutral bounded agents, streaming React UI, and production analysis, extraction, document, vision, writing, digest, and model helpers. |

### Analytics, workflows, and connectivity

| Package                 | What it gives your app                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@appkit/analytics`     | App-owned semantic catalogues, parsed formulas, tenant-bound parameterized SQL, result contracts, and a visualization registry.                                       |
| `@appkit/reports`       | Governed SQL, recursive filters, fiscal/grouped results, a 1/3–2/3 report studio, paper and statement viewers, drilldown drawers, print/export, schedules, and durable run claims. |
| `@appkit/workflows`     | Multi-flow visual studio, compatible templates, typed inspectors, bounded graphs, durable replay-safe actions, pause/resume approval gates, record approve/reject controls and history, any/all quorum, HMAC email decisions, and optional Drizzle storage. |
| `@appkit/sync`          | Connector registry, cursors, record caps, dry runs, crosswalks, fail-closed authoritative snapshots, CSV/transforms, hardened egress, and optional SQL drivers.       |
| `@appkit/integrations`  | Trigger/destination registry, token mapping, send-once policy, partial retry ledgers, and optional HTTP, Slack/Teams, Sheets, email, SQL, and Drizzle adapters.       |
| `@appkit/notifications` | Responsive three-pane inbox, smart folders, search, to-dos, optimistic actions, preferences, digest/quiet-hour policy, push lifecycle, dispatch, and React/Drizzle entries. |

### Documents, communications, and infrastructure

| Package                   | What it gives your app                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@appkit/email-render`    | Bounded templates, loops, conditions, sanitization, escaped merge values, subjects, recipients, attachments, HTML, and plain text. |
| `@appkit/emails`          | Resend, SendGrid, Mailgun, Postmark, secure SMTP, and development-only loopback SMTP behind one tenant-aware contract.            |
| `@appkit/sms`             | Twilio, Vonage, MessageBird, Plivo, and Telnyx with strict addressing and credential-safe failures.                                |
| `@appkit/pdf`             | Pure-JS PDFKit reports/statements plus optional authored-template and hardened Chromium rendering entries.                         |
| `@appkit/forms-documents` | Localized form companion fields, print styles, and bounded authored PDF templates.                                                 |
| `@appkit/forms-pdf`       | Form summaries, repeating tables, photos, hardened browser/resource rendering, record/report templates, and full-bleed design documents. |
| `@appkit/crypto`          | AES-256-GCM sealed secrets with configurable HKDF-derived application keys.                                                        |
| `@appkit/jobs`            | BullMQ/Redis producers and workers, lazy connections, bounded readiness, payload guards, rate limits, and hardened Web Push.      |
| `@appkit/storage`         | Tenant-owned S3 objects plus the optional production attachment workspace: upload, search, type filters, paging, preview, download, expansion, removal, HTTP adapters, and database-free memory adapters. |

## Modular by construction

The core of each feature remains usable without its heaviest dependencies:

```text
@appkit/workflows          graph + durable runtime
  ├─ /react                React Flow authoring
  ├─ /approval-tokens      Node HMAC email actions
  ├─ /schema               feature-owned Drizzle tables
  └─ /drizzle              durable Postgres store

@appkit/sync               connector + orchestration contracts
  ├─ /egress               DNS-pinned, SSRF-safe HTTPS
  ├─ /db-drivers           optional PostgreSQL/MySQL/MSSQL clients
  ├─ /schema               connections, runs, crosswalk
  └─ /drizzle              run and cursor persistence

@appkit/integrations       dispatch + delivery ledger
  ├─ /http /chat /sheets   hardened outbound adapters
  ├─ /email /sql           optional render and database adapters
  ├─ /schema               definitions and delivery ledger
  └─ /drizzle              tenant-scoped persistence

@appkit/apps               installable application platform
  ├─ /manifest /bundle     validated manifests and ZIP packages
  ├─ /runtime /bridge      governed QuickJS backend + opaque iframe SDK
  ├─ /service              source-shaped lifecycle bound to host adapters
  ├─ /react                app builder, runtime frame, and library
  ├─ /memory               database-free complete adapter
  └─ /schema /drizzle      tenant-scoped durable lifecycle

@appkit/scripts            governed automation code
  ├─ /bound                positional cutover runtime + context mapping
  ├─ /client               opaque-origin browser validation gate
  ├─ /jobs                 queue-neutral scheduled/bulk worker handler
  ├─ /react                searchable list and full-screen authoring drawer
  └─ /schema /drizzle      definitions, schedules, and run history
```

The repository enforces this architecture. Boundary checks reject runtime
cycles, forbidden foundation dependencies, missing feature migrations, and an
optional peer imported by a package root. Server-only adapters cannot silently
inflate a client bundle.

## Running reference app

`apps/playground` is a real Next.js 16 application, not a static component
catalogue. Authentication is intentionally disabled throughout the public demo;
one built-in identity exercises tenant context and permissions without a login.
The [hosted demo](https://appkit-demo-braedonsaunders-projects.vercel.app/dashboard/platform) and its
[manifest-backed package catalogue](https://appkit-demo-braedonsaunders-projects.vercel.app/packages) run
without a database. Its sample tenant data is deterministic, analytics queries
execute in memory, and editable dashboard and insight-card state persists in the
browser.

It includes the topbar/sidebar shell, admin hub and settings shell, configurable
dashboard, insight-card studio, form designer and runtime, workflow canvas,
reports, notifications, design studio, customization, integrations, API
reference, searchable/paginated tenant data, activity inbox, and one detail
page for every publishable package manifest.

```bash
pnpm install
pnpm --filter @appkit/playground dev
```

Open `http://localhost:4310/dashboard`. Use the account launcher to switch
between the topbar (default) and sidebar navigation. No database or provider
credentials are required.

To exercise the real tenant-scoped Postgres/RLS path, copy
`apps/playground/.env.example` to `apps/playground/.env.local`, set both database
URLs to your Postgres or Supabase connections, and run
`pnpm --filter @appkit/playground seed` before starting the app. With those
variables present, the same routes use durable package-owned persistence.

## Quality guarantees

- Every color in reusable UI resolves through a semantic token; light and dark
  themes are part of the same contract.
- Entrance content is visible by default. CSS starting styles provide motion
  without hiding server-rendered content, and reduced-motion is honored.
- React is optional unless a surface is interactive; framework-neutral cores
  remain safe to use in services and workers.
- Persistence-owning packages ship their own schema and SQL migrations.
- External network access validates HTTPS, DNS answers, redirects, request
  metadata, response sizes, timeouts, and public IP ranges.
- Package tests, monorepo typecheck, architecture checks, build, and browser
  verification are required before changes land.
- Every npm artifact is packed and inspected, then installed from its tarball in
  fresh Node, React, and Next.js consumers before release.

## Develop AppKit

Agents and contributors should start with [`AGENTS.md`](AGENTS.md), then read
the [design and package orientation](docs/for-agents/orientation.md) and
[application-building rules](docs/for-agents/building-applications.md).

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm lint
pnpm build
pnpm test:packages
pnpm test:consumers
```

AppKit is AGPL-3.0-or-later. Changesets owns package versioning and the release
PR; successful merges publish provenance-enabled artifacts to npm. See the
[publishing guide](docs/publishing.md) for the exact artifact and release
contracts.
