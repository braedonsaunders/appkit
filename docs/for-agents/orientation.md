# appkit orientation (for agents)

Read this once and you can build a suite-consistent screen. Everything below is
real and exported from the package named for its responsibility. The runnable
proof is `apps/playground` — when in doubt, read how the playground composes the
packages. It runs database-free by default with deterministic server data,
in-memory analytics execution, and browser-local builder persistence. Supplying
both playground database URLs switches those same routes to Postgres/RLS and
the packages' durable adapters.

## 1. The design system is tokens

Never write a raw color. Every surface, text, and border resolves through a
**semantic token**, surfaced as a Tailwind v4 utility:

| Group | Utilities |
|---|---|
| Surfaces | `bg-bg` `bg-bg-subtle` `bg-surface` `bg-surface-hover` `bg-elevated` `bg-overlay` |
| Text | `text-fg` `text-fg-muted` `text-fg-subtle` |
| Borders | `border-border` `border-border-strong` `border-border-subtle` |
| Brand | `bg-primary` `bg-primary-hover` `bg-primary-active` `text-primary-fg` `bg-primary-subtle` |
| Semantic | `{bg,text,border}-{danger,warning,success,info}` + each `*-subtle` / `*-fg` |
| Focus | `ring-ring` |
| Shape | `rounded-{sm,md,lg,xl}` (off `--radius`) · shadows `shadow-{sm,md,lg}` |

Opacity works (`bg-primary/40`, `bg-overlay/50`). Light/dark is one `.dark` class
on `<html>`; tokens flip automatically. **Rebrand the whole suite by editing the
`--ch-*` channel values in `packages/tokens/src/tokens.css` — one file.**

Motion tokens: `--ease-out` `--ease-in-out` `--ease-spring`, `--duration-{fast,
base,slow}`. Reveal helpers: `.reveal` (CSS `@starting-style`, visible-by-default)
and `.appkit-row` (staggered table rows). Browser-native routed-page motion is
available through the optional `@appkit/ui/page-transition` entry point.

## 2. Primitive index

Import general primitives from `@appkit/ui`; install feature packages only when
the application uses them.

**Buttons & inputs** — `Button` (variants: default/secondary/outline/subtle/ghost/
destructive/link; sizes sm/md/lg/icon; `asChild`) · `Input` · `Textarea` ·
`Label` · `Select` (searchable combobox, options-based, backed by `SearchSelect`)
· `SearchSelect` (desktop dropdown + mobile bottom sheet, groups, hints,
clearable, keyboard nav) · `Checkbox` · `Switch`.

**Authoring & capture** — `FileUploader` (single/multipart direct-upload
protocol with progress and finalization) · `SignaturePad` (pointer/touch/stylus
PNG capture) · `TabContent` (foreground tab-panel handoff) · `UiTextProvider`
(host translation injection for UI primitives). Upload and signature surfaces
use dedicated semantic document tokens so exported content stays legible in
both themes. `RichTextEditor` lives in optional `@appkit/editor`, keeping TipTap
out of applications that do not author rich text.

**Feedback** — `Alert` + `AlertTitle` + `AlertDescription` (variants default/
destructive/warning/success/info) · `toast` + `Toaster` (**sonner-compatible**:
`toast.success/error/warning/info/loading/message/promise/custom/dismiss`) ·
`Dialog` (centered modal) · `Progress` (determinate + indeterminate) · `Skeleton`
(shimmer) · `Spinner`.

**Overlays & menus** — `Drawer` / `UrlDrawer` (the flyout: spring slide-in,
backdrop, focus trap, scroll-lock, **expand-to-fullscreen**, stacked/nested) ·
`Popover` (portal-positioned floating panel) · `ContextMenu` + `useContextMenu`
(kebab / right-click menu, items array) · `Tooltip`.

**Data display** — `Table` (+ `TableHeader/Body/Row/Head/Cell`, staggered rows) ·
`RecordList` (controlled in-memory search/sort/pagination with typed columns —
reference/amount/status/custom/actions) · URL list kit: `parseListParams` /
`parsePrefixedListParams`, `ListNavProvider`, `SearchInput`, `FilterChips`,
`SortableTh` / `SortTh`, `Pagination` (shareable server-list state) · `LineGrid`
(the **spreadsheet line editor**: Enter appends, Alt+↑/↓ moves, ⌘D/⌘⌫, data-driven
columns) · `Badge` · `Avatar` (image + initials fallback) · `EmptyState` · `Card`
(+ parts) · `Tabs` (animated indicator) · `AnimatedNumber` (token-timed KPI
counter) · `Sparkline` (tokenized SVG trend, optional area/min-max dots).

**Dashboards & insights (`@appkit/dashboard/react`)** — `DashboardGrid` (responsive 12-column grid, view/edit
modes, drag/resize, remove, save/reset, categorized widget/card drawer) ·
`DashboardMetricCard` · `DashboardPanel` · `InsightCard` · `InsightResultView`
(scalar/progress/table/bar/row/line/area/pie/donut/gauge) · `CardStudio` (source,
measures, parsed formulas, dimensions, filters, visualization settings, live
preview, autosave, publish/delete). These are generalized production
dashboard system, not gallery mockups. Framework-neutral types remain at
`@appkit/dashboard`; persistence is explicitly installed from
`@appkit/dashboard/schema`.

**App shell / admin** — `PageHeader` · `AdminHub` (the settings **landing/hub** —
grouped accent cards, with an optional detailed layout for capability inventories)
· `SettingsShell` (the **sidebar settings area** — fixed header + two-pane rail)
+ `SettingsNav` / `SettingsSection` / `SettingsRow`.
`AppShell` renders the same production-compatible navigation registry as the
workspace-dropdown topbar (default) or shared collapsible
sidebar via `navigationMode="topbar" | "sidebar"`. The registry supports the
siblings' serializable `iconKey`, `id`, subgroup, exact-match, and mobile-pin
fields; mobile uses the same data in a drawer and bottom tab bar. `TopNav`,
`AppSidebar`, `SidebarNav`, and `MobileTabBar` are also exported directly.
`AccountMenu` is a bounded launcher with app-owned organization,
language, theme, navigation-mode, elevated-access, and sign-out adapters.
`GlobalSearch` owns keyboard/debounce/result interaction while the app supplies
the tenant-scoped query and navigation. `NotificationsBell`, `ThemeProvider` /
`getThemeScript` / `ThemeToggle`, `NavigationModeProvider`, and `UiLinkProvider` /
`UiBackLinkProvider` complete the shared shell runtime.

## 3. Composition patterns

- **Records are flyout-first.** Create/view/edit a record in a `Drawer` /
  `UrlDrawer` over the list (`?<record>=<id>`), not a separate route. Every flyout
  has the expand-to-fullscreen toggle. Wire i18n via `DrawerTextProvider`, the
  close-navigation via `DrawerNavigateContext` (so `UrlDrawer` closes by routing).
- **Database list pages** use the URL list kit: parse the page's `searchParams`
  with `parseListParams`, apply search/filter/sort/limit/offset in the RLS-scoped
  server query, and render `SearchInput` + `FilterChips` + `SortableTh` +
  `Pagination`. Wire `ListNavProvider` once to the app router so controls soft-
  navigate without full reloads. Use prefixed keys when several lists share a
  route. `apps/playground/app/(demo)/admin/users/page.tsx` is the live
  reference. `RecordList` remains the controlled choice for bounded, already-
  loaded data. Never render an unbounded or unsearchable table.
- **Line-item editors** use `LineGrid` — columns are data (`text`/`amount`/
  `select`/`readonly`+`render`); it's controlled (rows in, rows out).
- **Menus** use `useContextMenu()` + `<ContextMenu>` (kebab button →
  `menu.openBelow(e.currentTarget)`, or right-click → `menu.onContextMenu`).
  `Popover` is for custom floating panels.
- **Toasts** are global + imperative (sonner-shaped): `toast.success('Saved', {
  description })`; mount one `<Toaster richColors closeButton />` at the app root.
- **Admin** = `AdminHub` (landing grid of category cards) → `SettingsShell` (the
  sidebar area) with content built from `SettingsSection` + `SettingsRow`.
- **Dashboard pages** load a user/role/default `DashboardLayout`, build a node
  registry from built-ins plus persisted cards, and pass both to
  `DashboardGrid` from `@appkit/dashboard/react`.
  The app owns node content; appkit owns responsive layout/editing. Saved insight
  cards use `CardStudio` in a `Drawer`, appear in the library, and become
  `DashboardLibraryItem`s. The working references are `/dashboard`,
  `/dashboard/customize`, and `/insights` in the playground.
- **Routed page transitions** keep `AppShell` outside the animated boundary and
  wrap only its changing page canvas in `PageTransition`, keyed by
  `usePathname()`. Enable Next's `experimental.viewTransition` flag and import
  the primitive from `@appkit/ui/page-transition`. The shared styles use the
  motion tokens, preserve chart and text sharpness, disable motion for
  `prefers-reduced-motion`, and leave unsupported browsers with normal instant
  navigation.
- **Shell providers** mount once around `AppShell`: inject the framework link
  through `UiLinkProvider`, the pre-paint/live theme through a framework script
  wrapper around `getThemeScript()` + `ThemeProvider`, the cookie-backed
  topbar/sidebar preference through
  `NavigationModeProvider`, and the router callback through
  `DrawerNavigateContext`. Search results, notification data/actions, account
  preferences, and sign-out remain app-owned adapters.

## 4. AI agents (`@appkit/ai`)

`runAgentTurn` is the production multi-step tool loop generalized around an
injected AI SDK `LanguageModel`. The app resolves provider credentials per
tenant, supplies the system prompt, and includes only tools already closed over
that request's `RequestContext` and RBAC checks. The runtime raises the SDK's
one-step default with a bounded `stepCountIs` stop condition, streams the
UI-message protocol, redacts provider errors, supports aborts, and reports final
parts/token usage through `onComplete`.

`@appkit/ai/react` exports `AgentPanel`, `ChatMarkdown`, and `AgentToolCard`.
`AgentPanel` owns the live/reloaded parts renderer, streaming decoder, composer,
cancellation, and disabled state; the app injects its persistence-backed send
transport. The playground documents this contract on `/dashboard/platform`
without inventing a credential, fake conversation, or provider-specific demo.

## 5. Forms and localized authoring

`@appkit/forms-core` is the framework-neutral form contract shared by the
production reference applications. It accepts both plain-string authoring copy and locale-keyed
copy, with or without a workflow. Its field registry is the union of the source
products: finance fields (`currency`, `percentage`, `gl_account`, `party`) sit
beside the full safety/field-operations vocabulary. The package owns parsing,
cross-reference linting, conditional logic, formula evaluation, defaults,
response validation, normalization, scoring, participant extraction, document
sanitization, and text extraction. It has no UI, localization, token, or email
rendering dependency.
The live `/forms/core` reference executes the schema parser and response
validator, lists the field registry, and displays both automation vocabularies.

Automation is source-native rather than artificially flattened:
`@appkit/forms-core/safety-automation` preserves the safety workflow contract,
while `@appkit/forms-core/business-automation` preserves the ERP
lifecycle contract. Both retain their complete upstream automation tests. The
payloads intentionally remain separate where same-named actions mean different
things.

`@appkit/forms` is controlled UI over that contract. Its `LogicBuilder` is the
production template-designer implementation with labels and theme values injected.
Its current `FormDesigner` preserves the source shell's independently scrolling
builder rail, flex build surface, and drawer-based properties interaction, but
it is not yet a drop-in replacement for the full production designer. It omits
source formula authoring, type-specific configuration, layout, behavior/list/
action, assignment, and permission panels. `FormDesigner` receives a
schema and `onChange`; `FormRenderer` receives the same schema plus controlled or
uncontrolled response values. Common controls, repeating sections, visibility,
and submit validation work without host code. Files, signatures, entity/data
pickers, and specialized capture use explicit `fieldAdapters`, because their
storage and tenant queries must remain inside the consuming application's RLS
boundary. The live `/forms` reference supports design, validated fill preview,
JSON editing, import/export, and browser persistence.

`@appkit/editor` owns the optional TipTap authoring control used by rich-text
fields. `@appkit/forms-documents` owns localized companion-field generation,
document styles, and generated bounded PDF templates. These remain separate so
schema validation can run in services that install neither an editor nor the
document pipeline.

`@appkit/i18n` resolves supported locales, Accept-Language, tenant defaults,
per-user overrides, and localized authored content. Plain-string records remain
valid during progressive adoption.

`@appkit/email-render` is the extracted production rendering keystone used before
`@appkit/emails` transport. It compiles inline, saved-template, and design modes;
escapes merge values; supports bounded loops and conditionals; produces HTML and
plain text; sanitizes authored markup; and validates provider-neutral delivery
inputs without allocating decoded attachments.

## 6. Analytics and card queries (`@appkit/analytics`)

The analytics package deliberately knows no host-application domain tables.
An app provides an `AnalyticsCatalog`: authored source `FROM` clauses, the tenant
column, and a whitelist of fields with authored SQL expressions and semantic
types. User input can only select these keys. `compileQuery` always adds the
tenant predicate as `$1`, parameter-binds every filter/literal, validates formula
AST functions, caps result limits, and never accepts raw user SQL.

```ts
import { compileQuery, type AnalyticsCatalog } from '@appkit/analytics/server'

const catalogue: AnalyticsCatalog = { sources: [{
  key: 'orders', label: 'Orders', from: 'orders o', tenantColumn: 'o.tenant_id',
  detailColumns: ['number', 'created_at'], fields: [
    { key: 'number', label: 'Number', expression: 'o.number', semanticType: 'text' },
    { key: 'total', label: 'Total', expression: 'o.total', semanticType: 'currency' },
    { key: 'created_at', label: 'Created at', expression: 'o.created_at', semanticType: 'date', canBin: true },
  ],
}] }
const compiled = compileQuery(card.query, tenantId, catalogue)
const result = await pool.query(compiled.sql, compiled.params)
```

Formula text such as `sum([Total]) / count()` is parsed into a safe typed AST;
store the AST in the card query, not the original string. Apps execute compiled
SQL inside `withTenantContext`/`withTenant` and return the shared `QueryResult`
contract to `InsightResultView`.

## 7. Scaffolding a new app

```bash
pnpm create appkit my-app
# Optional groups: ai, analytics, communications, customization, documents,
# forms, integrations, platform, tenancy, workflows
pnpm create appkit my-app --features forms,tenancy,workflows --yes
```

`create-appkit` writes a minimal Next.js application with the real `AppShell`,
semantic-token stylesheet, pre-paint theme script, `ThemeProvider`, framework
link adapter, `Toaster`, and browser-native `PageTransition` already composed.
It refuses to overwrite a non-empty directory and can install with pnpm, npm,
Yarn, or Bun. Feature groups add packages, not invented domain screens or data.

For an existing application, install only the foundation packages:

```bash
pnpm add @appkit/ui @appkit/tokens
```

```css
/* app globals.css — the whole system in one import (Tailwind v4 + tokens) */
@import '@appkit/ui/styles.css';
@source '../app';
```

```tsx
// root layout: class-based dark mode + one Toaster
<html lang="en" suppressHydrationWarning>
  <body className="min-h-screen bg-bg text-fg antialiased">
    {children}
    <Toaster richColors closeButton />
  </body>
</html>
```

Published packages ship compiled ESM and declarations, so consumers do not add
AppKit to Next.js `transpilePackages`. Local workspace development continues to
use source-linked `workspace:*` dependencies. For native page handoffs, set
`experimental: { viewTransition: true }`, then wrap the changing `AppShell`
children with `<PageTransition navigationKey={pathname}>`. This optional entry
point tracks the current Next/React View Transition API. Then compose screens
from the primitives above — every color a token, light + dark for free.

## 8. Multi-tenancy out of the box (`@appkit/db` + `@appkit/tenant`)

An app on appkit is multi-tenant with super-admin from day one — you don't build
RLS or RBAC yourself.

```ts
import { createDb, tenantRef, id, installRlsSql, IDENTITY_TENANT_TABLES } from '@appkit/db'
import * as schema from '@appkit/db/schema'

// One factory: a tenant-scoped `db` (Postgres RLS applied per request) + a
// BYPASSRLS `superDb` for system/super-admin work.
export const { db, superDb, withTenant, withTenantContext, withSuperAdmin } =
  createDb({ url: process.env.DATABASE_URL!, superUrl: process.env.DATABASE_SUPER_URL, schema })
```

- **Every tenant table** uses `tenantRef()` (a `tenant_id` column) and is listed
  for RLS. Install policies after migrations: `installRlsSql([...IDENTITY_TENANT_TABLES, 'your_table'])`.
- **Tenant queries** run scoped: `withTenantContext(tenantId, () => db.select()…)`
  (pooled) or `withTenant(tenantId, fn)` (one atomic transaction). Unscoped
  queries match **no rows** (deny-by-default). Cross-tenant/system work uses
  `withSuperAdmin(sdb => …)`.
- **RBAC** (`@appkit/tenant`): build a `RequestContext` (resolve the user's
  permission set via `resolveMembershipAccess`), then gate mutations with
  `assertCan(ctx, 'module.action')`. `module.*` wildcards and `.read.{all,site,
  self}` tiers work; super-admins pass everything.

The canonical identity schema (tenants, users, memberships, roles,
role_assignments, per-user permission overrides) ships in `@appkit/db/schema` —
extend it, don't reinvent it.

`@appkit/dashboard/schema` exports `userDashboardLayouts`, `insightCards`, and
`DASHBOARD_TENANT_TABLES`, and ships its own Drizzle migration. Include its table
list in the RLS installer when the feature is installed. Layouts are personal
per tenant/user; cards persist their semantic query, visualization, settings,
owner, and draft/published state. Notification tables and migrations follow the
same feature-owned pattern under `@appkit/notifications/schema`.

## 9. Secrets and outbound delivery (`@appkit/crypto`, `@appkit/emails`, `@appkit/sms`)

- Seal tenant provider credentials with `sealSecret` from `@appkit/crypto` before
  persistence and inject `unsealSecret` into email/SMS transport resolution.
  Production requires the same 32+ character `APPKIT_SECRET` in every service
  that seals or consumes credentials; local development has an explicit insecure
  fallback.
- Existing applications can reproduce their current ciphertext profile with
  `createSealer(secret, { hkdfInfo })`; email and SMS accept its `unsealSecret`
  function explicitly. AppKit does not ship application-named crypto or
  transport entry points.
- Email and SMS resolve the same platform policy: `disabled` suppresses delivery,
  `global_only` uses the platform provider, and `tenant_optional` prefers a valid
  tenant provider. A corrupt explicitly enabled tenant override fails closed.
- SMS destinations are strict E.164. The five fetch-based providers are Twilio,
  Vonage, MessageBird, Plivo, and Telnyx; provider errors are bounded, sanitized,
  and stripped of credentials before they reach logs or users.

## 10. Reports and documents

`@appkit/reports` currently owns fiscal periods and framework-neutral report
definition, result, layout, execution, and schedule contracts. It does not yet
contain the siblings' full built-in report catalogues, compiler/executor,
document body/CSS, exports, or schedule worker and must not be treated as a
drop-in replacement. Its current query is the same `InsightQuery` used by
`@appkit/analytics`; an app supplies its tenant-scoped executor and catalogue.

`@appkit/pdf` provides a pure-JS PDFKit report,
table, and financial-statement renderer. Bounded template rendering is under
`@appkit/pdf/template`; HTML sanitization and hardened Chromium printing are
under `@appkit/pdf/html`, so a report-only service does not install Chromium.
`@appkit/forms-pdf` provides safe form-summary HTML at its root, then opt-in
`/summary`, `/template`, and `/design` rendering adapters.

`@appkit/design-studio` owns the bounded multi-artboard print document. Its
current controlled editor is isolated at `@appkit/design-studio/react` and
supports Fabric selection, drag/resize/rotation, inline text editing,
zoom/fullscreen, artboards, insertion, layers, z-order, visibility/locking,
basic property inspectors, and print-provider settings. It is not yet source-
compatible with the full production editor: source DTOs, document factories,
presets/exports, and several inspector controls remain to be ported.
`@appkit/design-studio/fabric` remains the lazy
canvas-runtime boundary. Data field keys, sample values, persistence, and output
actions come from the application; product entities are not hardcoded in the
package. The working references are `/reports` and `/design-studio`.
Applications that render the editor import `@appkit/design-studio/styles.css`
in their Tailwind entry alongside `@appkit/ui/styles.css`.

`@appkit/storage` is the generalized S3/R2/MinIO runtime: tenant-owned object
keys, automatic multipart writes, client multipart completion/abort, byte
ranges, streaming reads, rich metadata, verified ETag promotion, lifecycle
tags, and existence-safe presigning live behind one injected configuration.
`@appkit/storage/env` exposes a strict, portable `APPKIT_STORAGE_*` environment
contract. Applications with another configuration system use `createStorage`.
`@appkit/jobs` supplies lazy BullMQ producer/worker connections, bounded Redis
readiness, source payload validators, and an atomic fixed-window rate limiter.
Its `/web-push` entry includes subscription validation, public-DNS
checks, bounded encrypted payloads, and terminal provider status handling.

## 11. Workflows, sync, integrations, notifications, and customization

`@appkit/workflows` provides dependency-free graph conversion, persistence
limits, cycle detection, linting, durable runs, replay-safe action claims, and
approval gates. Its `any`/`all` quorum behavior and pause/resume seam come from
the production reference implementations. Gate rows retain
their branch plans so a worker can resume after a process restart.
`@appkit/workflows/react` adds the shared two-pane React Flow authoring shell,
node registry, and branch handles. `/approval-tokens` signs one-click decisions;
`/schema` and `/drizzle` own definitions, runs, gates, and action executions.
The two source-native automation schemas remain in `@appkit/forms-core`; apps
adapt either schema through `WorkflowPlanner` and inject their action handlers.

`@appkit/sync` is the inbound connector spine: app-defined connectors emit a
generic `{entity, externalId, data}` envelope into an injected target adapter.
The runtime owns cursors, record caps, dry runs, error accounting, and
authoritative snapshots that refuse to archive when a pull is empty or any row
failed. `/egress` is the DNS-pinned SSRF-safe HTTPS implementation;
`/db-drivers` adds TLS-only PostgreSQL, MySQL, MariaDB, and SQL Server; `/schema`
and `/drizzle` own connections, runs, cursor state, and the crosswalk.

`@appkit/integrations` is the outbound trigger-to-destination spine. Product
modules emit already-authorized item namespaces; the dispatcher maps tokens,
unseals through an app adapter, consults the delivery ledger, and records refs.
A failed multi-item delivery resumes known successes, while send-once suppresses
only a completely pushed delivery. HTTP, Slack/Teams, Google Sheets, email, and
SQL are optional entries. Email receives the app's transport, SQL requires an
identity column for reversible retries, and HTTP/chat/Sheets use sync's hardened
egress entry. The working settings-shell reference is `/admin/integrations`.

`@appkit/notifications` applies tenant category policy, per-user channel
preferences, digest/quiet-hour behavior, critical delivery rules, and stable
deduplication keys before invoking app-owned delivery adapters. Its root has no
dependencies. `@appkit/notifications/schema` owns its feature tables,
`@appkit/notifications/drizzle` provides the RLS-aware store, and
`@appkit/notifications/react` provides the inbox and preference matrix.

Package boundaries are executable architecture. `pnpm check:boundaries` rejects
runtime cycles and forbidden foundation dependencies; `pnpm test:isolation`
walks each package root's complete source import graph and fails if an optional
adapter peer leaks into it. Both run as part of `pnpm lint`.

`@appkit/customization` turns an app-supplied record catalogue into consistent
custom fields, form layouts, list views, filters, defaults, and lint output.
Product record types stay in the consuming app. The working references are
`/workflows`, `/admin/integrations`, `/notifications`, and `/customization`.

For the rules any app on this foundation must follow, see
[`building-applications.md`](building-applications.md).
