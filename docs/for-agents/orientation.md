# appkit orientation (for agents)

Read this once and you can build a suite-consistent screen. Everything below is
real and exported from `@appkit/ui` / `@appkit/tokens`. The runnable proof of all
of it is `apps/playground` — when in doubt, read how the playground uses a
primitive.

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

Import everything from `@appkit/ui`.

**Buttons & inputs** — `Button` (variants: default/secondary/outline/subtle/ghost/
destructive/link; sizes sm/md/lg/icon; `asChild`) · `Input` · `Textarea` ·
`Label` · `Select` (searchable combobox, options-based, backed by `SearchSelect`)
· `SearchSelect` (desktop dropdown + mobile bottom sheet, groups, hints,
clearable, keyboard nav) · `Checkbox` · `Switch`.

**Authoring & capture** — `RichTextEditor` (TipTap HTML authoring with a
host-injected link policy) · `FileUploader` (single/multipart direct-upload
protocol with progress and finalization) · `SignaturePad` (pointer/touch/stylus
PNG capture) · `TabContent` (foreground tab-panel handoff) · `UiTextProvider`
(host translation injection for UI primitives). Upload and signature surfaces
use dedicated semantic document tokens so exported content stays legible in
both themes.

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

**Dashboards & insights** — `DashboardGrid` (responsive 12-column grid, view/edit
modes, drag/resize, remove, save/reset, categorized widget/card drawer) ·
`DashboardMetricCard` · `DashboardPanel` · `InsightCard` · `InsightResultView`
(scalar/progress/table/bar/row/line/area/pie/donut/gauge) · `CardStudio` (source,
measures, parsed formulas, dimensions, filters, visualization settings, live
preview, autosave, publish/delete). These are the generalized OpenBooks/BeaconHS
dashboard system, not gallery mockups.

**App shell / admin** — `PageHeader` · `AdminHub` (the settings **landing/hub** —
grouped accent cards, with an optional detailed layout for capability inventories)
· `SettingsShell` (the **sidebar settings area** — fixed header + two-pane rail)
+ `SettingsNav` / `SettingsSection` / `SettingsRow`.
`AppShell` renders the same OpenBooks/BeaconHS-compatible navigation registry as
the OpenBooks workspace-dropdown topbar (default) or the shared collapsible
sidebar via `navigationMode="topbar" | "sidebar"`. The registry supports the
siblings' serializable `iconKey`, `id`, subgroup, exact-match, and mobile-pin
fields; mobile uses the same data in a drawer and bottom tab bar. `TopNav`,
`AppSidebar`, `SidebarNav`, and `MobileTabBar` are also exported directly.
`AccountMenu` is the bounded OpenBooks launcher with app-owned organization,
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
  registry from built-ins plus persisted cards, and pass both to `DashboardGrid`.
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

`runAgentTurn` is the BeaconHS multi-step tool loop generalized around an
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

## 5. Forms and localized authoring (`@appkit/forms-core`, `@appkit/forms`, `@appkit/i18n`)

`@appkit/forms-core` is the framework-neutral form contract shared by OpenBooks
and BeaconHS. It accepts both legacy plain-string authoring copy and locale-keyed
copy, with or without a workflow. Its field registry is the union of the source
products: finance fields (`currency`, `percentage`, `gl_account`, `party`) sit
beside the full safety/field-operations vocabulary. The package owns parsing,
cross-reference linting, conditional logic, formula evaluation, defaults,
response validation, normalization, scoring, participant extraction, document
styles, and PDF template helpers.
The live `/forms/core` reference executes the schema parser and response
validator, lists the field registry, and displays both automation vocabularies.

Automation is source-native rather than artificially flattened:
`@appkit/forms-core/safety-automation` preserves the BeaconHS workflow contract,
while `@appkit/forms-core/business-automation` preserves the OpenBooks ERP
lifecycle contract. Both retain their complete upstream automation tests. The
payloads intentionally remain separate where same-named actions mean different
things.

`@appkit/forms` is controlled UI over that contract. Its `LogicBuilder` is the
BeaconHS template-designer implementation with labels and theme values injected.
Its `FormDesigner` shell preserves BeaconHS's fixed, independently scrolling
builder rail, flex build surface, and drawer-based properties interaction rather
than introducing a permanent third column. `FormDesigner` receives a
schema and `onChange`; `FormRenderer` receives the same schema plus controlled or
uncontrolled response values. Common controls, repeating sections, visibility,
and submit validation work without host code. Files, signatures, entity/data
pickers, and specialized capture use explicit `fieldAdapters`, because their
storage and tenant queries must remain inside the consuming application's RLS
boundary. The live `/forms` reference supports design, validated fill preview,
JSON editing, import/export, and browser persistence.

`@appkit/i18n` resolves supported locales, Accept-Language, tenant defaults,
per-user overrides, and localized authored content. Plain-string records remain
valid during progressive adoption.

`@appkit/email-render` is the extracted BeaconHS rendering keystone used before
`@appkit/emails` transport. It compiles inline, saved-template, and design modes;
escapes merge values; supports bounded loops and conditionals; produces HTML and
plain text; sanitizes authored markup; and validates provider-neutral delivery
inputs without allocating decoded attachments.

## 6. Analytics and card queries (`@appkit/analytics`)

The analytics package deliberately knows no OpenBooks or BeaconHS domain tables.
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

```jsonc
// deps
"@appkit/ui": "workspace:*", "@appkit/tokens": "workspace:*"
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

`next.config.ts`: `transpilePackages: ['@appkit/ui', '@appkit/tokens']` (they ship
TSX source, not built output). For native page handoffs, also set
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

The same schema exports `userDashboardLayouts`, `insightCards`, and
`DASHBOARD_TENANT_TABLES`. Include the latter in the RLS installer. Layouts are
personal per tenant/user; cards persist their semantic query, visualization,
settings, owner, and draft/published state.

## 9. Secrets and outbound delivery (`@appkit/crypto`, `@appkit/emails`, `@appkit/sms`)

- Seal tenant provider credentials with `sealSecret` from `@appkit/crypto` before
  persistence and inject `unsealSecret` into email/SMS transport resolution.
  Production requires the same 32+ character `APPKIT_SECRET` in every service
  that seals or consumes credentials; local development has an explicit insecure
  fallback.
- Email and SMS resolve the same platform policy: `disabled` suppresses delivery,
  `global_only` uses the platform provider, and `tenant_optional` prefers a valid
  tenant provider. A corrupt explicitly enabled tenant override fails closed.
- SMS destinations are strict E.164. The five fetch-based providers are Twilio,
  Vonage, MessageBird, Plivo, and Telnyx; provider errors are bounded, sanitized,
  and stripped of credentials before they reach logs or users.

## 10. Reports and documents

`@appkit/reports` owns saved report definitions, grouped tabular documents,
page layouts, injected execution, and timezone-aware schedules. Its query is the
same `InsightQuery` used by `@appkit/analytics`; do not create a separate report
query language. An app supplies its tenant-scoped executor and domain catalogue.

`@appkit/pdf` is the OpenBooks PDF engine: pure-JS paginated tables and financial
statements, bounded template rendering, HTML sanitization, and a hardened
Chromium printer. `@appkit/forms-pdf` maps form summaries, repeating sections,
photos, authored templates, and design documents into that renderer.

`@appkit/design-studio` owns the bounded multi-artboard print document. Data
field keys and sample values come from an app-supplied catalogue; credentials,
equipment, projects, and other product entities are not hardcoded in the
package. The working references are `/reports` and `/design-studio`.

## 11. Workflows, notifications, and customization

`@appkit/workflows` provides the shared two-pane React Flow authoring shell,
node registry, graph conversion, branch handles, cycle detection, and linting.
The two source-native automation schemas remain in `@appkit/forms-core`; apps
adapt either schema structurally and inject the relevant inspector editors.

`@appkit/notifications` applies tenant category policy, per-user channel
preferences, digest/quiet-hour behavior, critical delivery rules, and stable
deduplication keys before invoking app-owned delivery adapters. Its server entry
provides the Drizzle store over `@appkit/db`'s RLS-protected notifications,
preferences, and web-push subscription tables. Its React entry provides the
full inbox and preference matrix.

`@appkit/customization` turns an app-supplied record catalogue into consistent
custom fields, form layouts, list views, filters, defaults, and lint output.
Product record types stay in the consuming app. The working references are
`/workflows`, `/notifications`, and `/customization`.

For the rules any app on this foundation must follow, see
[`building-applications.md`](building-applications.md).
