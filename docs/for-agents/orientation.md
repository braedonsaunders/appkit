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
available through the optional `@braedonsaunders/appkit-ui/page-transition` entry point.

## 2. Primitive index

Import general primitives from `@braedonsaunders/appkit-ui`; install feature packages only when
the application uses them.

**Buttons & inputs** — `Button` (variants: default/secondary/outline/subtle/ghost/
destructive/link; sizes sm/md/lg/icon; `asChild`) · `Input` · `Textarea` ·
`Label` · `Select` (searchable combobox, options-based, backed by `SearchSelect`)
· `SearchSelect` (desktop dropdown + mobile bottom sheet, groups, hints,
clearable, keyboard nav) · `MultiSelect` (searchable multi-value picker with
selected-value chips, grouped options, select-all, and clear actions) ·
`Checkbox` · `Switch`.

**Authoring & capture** — `FileUploader` (single/multipart direct-upload
protocol with progress and finalization) · `SignaturePad` (pointer/touch/stylus
PNG capture) · `TabContent` (foreground tab-panel handoff) · `UiTextProvider`
(host translation injection for UI primitives). Upload and signature surfaces
use dedicated semantic document tokens so exported content stays legible in
both themes. `RichTextEditor` lives in optional `@braedonsaunders/appkit-editor`, keeping TipTap
out of applications that do not author rich text.

**Feedback** — `Alert` + `AlertTitle` + `AlertDescription` (variants default/
destructive/warning/success/info) · `toast` + `Toaster` (**sonner-compatible**:
`toast.success/error/warning/info/loading/message/promise/custom/dismiss`) ·
`Dialog` (centered modal) · `confirmDialog` + `ConfirmRoot` (one imperative,
promise-based source confirmation flow for destructive actions) · `promptDialog`
+ `PromptRoot` (one imperative, promise-based text prompt for rename/reason
flows) · `Progress` (determinate + indeterminate) · `Skeleton`
(shimmer) · `Spinner`.

**Overlays & menus** — `Drawer` / `UrlDrawer` (the flyout: spring slide-in,
backdrop, focus trap, scroll-lock, **expand-to-fullscreen**, stacked/nested) ·
`Popover` (portal-positioned floating panel) · `ContextMenu` + `useContextMenu`
(kebab / right-click menu, items array) · `Tooltip`.

**Data display** — `Table` (+ `TableHeader/Body/Row/Head/Cell`, staggered rows;
use `containerClassName` to adapt its default card shell when embedded) ·
`RecordList` (`className`, `tableContainerClassName`, and `tableClassName`
support full-height embedded workspaces; controlled in-memory
search/sort/pagination with typed reference/amount/status/custom/actions
columns) · URL list kit: `parseListParams` /
`parsePrefixedListParams`, `ListNavProvider`, `SearchInput`, `FilterChips`,
`SortableTh` / `SortTh`, `Pagination` (shareable server-list state) · `LineGrid`
(the **spreadsheet line editor**: Enter appends, Alt+↑/↓ moves, ⌘D/⌘⌫, data-driven
columns) · `OrgChart` (parent-pointer hierarchies: server-rendered border
connectors, collapsible branches, zoom, optional drag-to-reparent; the pure
`buildOrgTree` / `canReparent` / `orgChartDescendantIds` helpers survive
dangling parents and cycles) · `Badge` · `Avatar` (image + initials fallback) ·
`EmptyState` · `Card`
(+ parts) · `Tabs` (animated indicator) · `AnimatedNumber` (token-timed KPI
counter) · `Sparkline` (tokenized SVG trend, optional area/min-max dots).

**Layout measurement** — `useElementSize()` returns `[ref, { width, height }]`
from a `ResizeObserver`, for the layouts that have to do their own arithmetic
(depth scaling, fit-the-viewport stages). Attach the ref and the size follows
every resize. Available from `@braedonsaunders/appkit-ui` and, for consumers that want the hook
without the component barrel, from `@braedonsaunders/appkit-ui/use-element-size`.

**Dashboards & insights** — fixed product dashboards can import
`DashboardMetricCard` and `DashboardPanel` from the dependency-light
`@braedonsaunders/appkit-dashboard/primitives` entry (plus `primitives.css`) without installing
the builder stack. `@braedonsaunders/appkit-dashboard/react` adds `DashboardGrid` (responsive 12-column grid, view/edit
modes, drag/resize, remove, save/reset, categorized widget/card drawer) ·
`InsightCard` · `InsightResultView` ·
`AdvancedInsightResultView` (flat results plus typed pivots/heatmaps and fifteen
visualization contracts) · `CardStudio` (source,
measures, parsed formulas, dimensions, filters, visualization settings, live
preview, autosave, publish/delete) · `DashboardStudio` (controlled metadata,
autosave, publish, pin, delete, and grid composition). These are generalized production
dashboard system, not gallery mockups. Framework-neutral types remain at
`@braedonsaunders/appkit-dashboard`; persistence is explicitly installed from
`@braedonsaunders/appkit-dashboard/schema`.

**App shell / admin** — `PageHeader` · `AdminHub` (the settings **landing/hub** —
grouped accent cards, with an optional detailed layout for capability inventories)
· `SettingsShell` (the **sidebar settings area** — fixed header + two-pane rail)
+ `SettingsNav` / `SettingsSection` / `SettingsRow`.
`SettingsShell` keeps form-heavy settings panes narrow by default; use
`contentWidth="wide"` or `contentWidth="full"` for record-heavy platform
administration lists without rebuilding the shell.
`AppShell` renders the same production-compatible navigation registry as the
workspace-dropdown topbar (default) or shared collapsible
sidebar via `navigationMode="topbar" | "sidebar"`. The registry supports the
siblings' serializable `iconKey`, `id`, subgroup, exact-match, and mobile-pin
fields; mobile uses the same data in a drawer and bottom tab bar. `TopNav`,
`AppSidebar`, `SidebarNav`, and `MobileTabBar` are also exported directly.
Hosts can tune top-level topbar typography and active/inactive emphasis through
`topNavigationItemClassName`, `topNavigationActiveItemClassName`, and
`topNavigationInactiveItemClassName` without changing sidebar or mobile
navigation; the equivalent direct `TopNav` props omit the `topNavigation`
prefix.
`NavigationConfigEditor` provides the tenant-facing visibility and reordering
surface. Its framework-neutral helpers reconcile saved stable keys with the
current application registry, append newly shipped destinations, preserve
intentional tenant choices, and protect required recovery destinations. Apps
own authorization and persist the resulting `TenantNavigationConfig`.
`AccountMenu` is a bounded launcher with app-owned organization,
language, theme, navigation-mode, elevated-access, and sign-out adapters.
`GlobalSearch` owns keyboard/debounce/result interaction while the app supplies
the tenant-scoped query and navigation. `NotificationsBell`, `ThemeProvider` /
`getThemeScript` / `ThemeToggle`, `NavigationModeProvider`, and `UiLinkProvider` /
`UiBackLinkProvider` complete the shared shell runtime.

**Identity administration (`@braedonsaunders/appkit-iam/react`)** — `RolesAdmin` provides the
production paged/searchable/sortable role register with full-dataset type
facets, keys and descriptions, complete create/edit/duplicate/delete drawer,
grouped permission matrix, activity, member assignment, record-data scopes,
and the source bulk add/replace/remove flow. `UsersAdmin` adds full-dataset
status facets, independent name/email sorting, responsive cards, invitation
and resend lifecycle, locale override, multi-role assignment, per-assignment
scope, protected-member behavior, activity, and per-user grant/deny exceptions.
`AuditAdmin` provides stable action/record facets, actor/action/record search,
paging and sorting, before/after field diffs, structured snapshots, request
metadata, and a fullscreen detail drawer. Actor-aware capabilities are enforced
again in every adapter. The application injects its permission catalogue,
hierarchy options, invitation delivery, and optional member actions/detail
tabs; `@braedonsaunders/appkit-iam/drizzle` supports both Drizzle Postgres drivers and runs
application projection hooks inside IAM transactions. `@braedonsaunders/appkit-iam/http`
carries the full contract across an application-owned auth gate and
`@braedonsaunders/appkit-iam/memory` supports browser-only, local-first, and test consumers.

**Authentication (`@braedonsaunders/appkit-auth`)** — `createAppkitAuth` owns persisted Better
Auth sessions, password accounts and resets, hashed magic links, provider
accounts, and session revocation. `createInviteService` binds a successfully
consumed one-time link to one membership generation; `/drizzle` activates and
audits it atomically, while `/memory` preserves the same state machine for
tests. `/client`, `/next`, and `/react` provide optional framework and UI layers.
Applications inject email delivery, brand rendering, route authorization,
tenant selection, and any post-acceptance domain effect.

**Raw SQL workbench (`@braedonsaunders/appkit-query-console/react`)** — `QueryConsole`
is the extracted governed-query workspace: resizable SQL editor, selection
execution, live searchable schema tree, insert/browse actions, saved snippets,
deduplicated history, row limits, sortable/filterable results, and hardened CSV
copy/download. The root supplies the result/schema contracts, response
validation, source-compatible read-only statement precheck, browser/memory
persistence, and an HTTP adapter. Applications must keep authentication,
permission and scope checks, governed views, tenant-bound database execution,
SELECT-only role, read-only transaction, timeout, cap, and audit inside their
adapter. `validateReadOnlySql` is defense in depth and is never the security
boundary. Import `@braedonsaunders/appkit-query-console/styles.css` with the UI
stylesheet. The runnable `/query-console` proof uses a real read-only in-memory
SQL database without privileged mutations.

## 3. Composition patterns

- **Records are flyout-first.** Create/view/edit a record in a `Drawer` /
  `UrlDrawer` over the list (`?<record>=<id>`), not a separate route. Every flyout
  has the expand-to-fullscreen toggle. Wire i18n via `DrawerTextProvider`, the
  close-navigation via `DrawerNavigateContext` (so `UrlDrawer` closes by routing).
- **Database list pages** use the URL list kit: parse the page's `searchParams`
  with `parseListParams`, apply search/filter/sort/limit/offset in the RLS-scoped
  server query, and render `SearchInput`, `FilterChips` or
  `SearchSelectFilter`, `SortableTh`, and `Pagination`. Wire `ListNavProvider`
  once to the app router so controls soft-
  navigate without full reloads. `SearchInput` keeps the latest local edit
  authoritative while overlapping route transitions settle, so a stale server
  response cannot delete newer keystrokes. Use prefixed keys when several lists
  share a route. `RecordList` remains the controlled choice for bounded,
  already-loaded data; the IAM React package uses its paginated service boundary
  instead of owning framework routes. Never render an unbounded or unsearchable
  table.
- **Bounded detail/setup tables** use `PagedTable` for rows already loaded into
  a drawer, detail tab, or setup page. It owns client search, ordering, and
  pagination but does not imitate a server-backed list. A column becomes
  sortable by supplying `sortValue`; `defaultSort` seeds the ordering and
  `onRowClick` makes rows activatable (open the record's `Drawer`). Use
  `SubtabNav` in `Drawer.subtabs` and `DetailPageLayout.subtabs` so those
  surfaces retain the source navigation grammar.
- **Reporting hierarchies** use `OrgChart`. Feed it the flat records with a
  `parentId`; it resolves the forest itself and never drops a record, so
  dangling managers and edit-race cycles surface as extra top-level cards
  instead of a hang. Supply `onReparent` to allow drag-to-reassign and re-check
  `canReparent` in the server action — the chart's guard is the fast path, not
  the rule. Keep a form-based "reports to" control on the record as well: HTML5
  drag has no touch equivalent.
- **Line-item editors** use `LineGrid` — columns are data (`text`/`amount`/
  `select`/`readonly`+`render`); it's controlled (rows in, rows out).
- **Menus** use `useContextMenu()` + `<ContextMenu>` (kebab button →
  `menu.openBelow(e.currentTarget)`, or right-click → `menu.onContextMenu`).
  `Popover` is for custom floating panels.
- **Toasts** are global + imperative (sonner-shaped): `toast.success('Saved', {
  description })`; mount one `<Toaster richColors closeButton />` at the app root.
- **Admin** = `AdminHub` (landing grid of category cards) → `SettingsShell` (the
  sidebar area). Settings forms use `SettingsSection` + `SettingsRow`; platform
  record pages use `contentWidth="full"` with `RecordList`, and rows open
  `Drawer` details. Mode-specific administration shells must supply
  `SettingsShell.back` so administrators can return to the normal product
  without relying on browser history.
- **Dashboard pages** load a user/role/default `DashboardLayout`, build a node
  registry from built-ins plus persisted cards, and pass both to
  `DashboardGrid` from `@braedonsaunders/appkit-dashboard/react`.
  The app owns node content; appkit owns responsive layout/editing. Saved insight
  cards use `CardStudio` in a `Drawer`, appear in the library, and become
  `DashboardLibraryItem`s. The working references are `/dashboard`,
  `/dashboard/customize`, and `/insights` in the playground.
- **Routed page transitions** keep `AppShell` outside the animated boundary and
  wrap only its changing page canvas in `PageTransition`, keyed by
  `usePathname()`. Enable Next's `experimental.viewTransition` flag and import
  the primitive from `@braedonsaunders/appkit-ui/page-transition`. The shared styles use the
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

## 4. AI agents (`@braedonsaunders/appkit-ai`)

`runAgentTurn` is the production multi-step tool loop generalized around an
injected AI SDK `LanguageModel`. The app resolves provider credentials per
tenant, supplies the system prompt, and includes only tools already closed over
that request's `RequestContext` and RBAC checks. The runtime raises the SDK's
one-step default with a bounded `stepCountIs` stop condition, streams the
UI-message protocol, redacts provider errors, supports aborts, and reports final
parts/token usage through `onComplete`.

`@braedonsaunders/appkit-ai/react` exports `AgentPanel`, `ChatMarkdown`, and `AgentToolCard`.
`AgentPanel` owns the live/reloaded parts renderer, streaming decoder, composer,
cancellation, and disabled state; the app injects its persistence-backed send
transport, may supply contextual controls through `headerActions` for the
panel's fixed header, and may replace the stock first-message card through
`emptyContent` when the application has a richer full-height stage. Consecutive
tool calls render as one subtle activity line showing the newest step and total count; the complete inputs and results expand
in place, so long agent runs do not overwhelm the conversation. The playground documents this contract on `/dashboard/platform`
without inventing a credential, fake conversation, or provider-specific demo.
The empty streaming turn uses `AgentTypingIndicator`: a token-timed, staggered
three-dot cadence with a static reduced-motion fallback that does not depend on
the consuming application's Tailwind content scan.
Typed `secret-request` message parts render through `AgentSecretRequestCard` as
an inline, accessible credential handoff with pending, stored, and expired
states. The part contains only request metadata; the uncontrolled password
field is cleared before the app-owned submit handler runs and the credential is
never placed in transcript or React state. Applications own authorization,
sealing, durable storage, audit, and the status transition.
The root also exports the production provider catalogue and model policy,
writing, extraction, dataset analysis, activity digest, document-agent, bounded
vision, and structured builder helpers. Applications still supply credentials,
domain prompts, persistence, and authorized tools.

Long visual runs call `pruneVisualToolContext` during step preparation. It
keeps only the newest distinct tool-result frames while preserving every tool
call, result, and text field; user-supplied images are never touched. This is a
context and cost control, not an audit policy — applications persist their
full screenshot ledger separately.

`@braedonsaunders/appkit-events` supplies the durable worker mechanics beneath those
runs. `runWithFencedLease` claims a per-attempt owner/fence, renews it, aborts
in-flight work when ownership is lost, and requires the terminal application
commit to compare the same fence. `executeExternalEffect` records an immutable
intent before acting, replays known completions, blocks uncertain retries by
default, and appends completion/failure/ambiguity/reconciliation evidence.
Applications provide the RLS-bound stores and sanitize persisted requests and
results. `followDurableCursor` always backfills ordered database rows after its
cursor; an injected LISTEN/NOTIFY or equivalent wake port only reduces latency,
so missed notifications and reconnects cannot lose events.

`@braedonsaunders/appkit-remote-sessions` is the boundary for work on an existing external
computer. It deliberately does not extend Desk: a Desk belongs to the agent, while a remote
target belongs to the customer and has separate credentials, policies, leases, and lifecycle.
The root exports provider-neutral RDP/VNC and SSH/WinRM/PowerShell-SSH/Telnet contracts,
fenced immutable leases, append-only events, one-time signed viewer grants, cancellation,
terminal streaming, and executable provider conformance. `/memory` supplies the deterministic
store, `/react` supplies the browser viewer plus the durable read-only terminal, and `/guacamole`
supplies the encrypted Apache Guacamole bridge contract. Applications inject tenant/RLS storage,
feature gates, credential resolution, policy, routes, and audit projection.
The terminal treats the append-only ledger as authoritative while applying deterministic semantic
ANSI to otherwise plain non-PTY entries: prompts and shell tokens remain scannable, stream kinds
are distinct, provider ANSI passes through unchanged, and polling follows output only while the
viewer stays at the bottom.

## 5. Forms and localized authoring

`@braedonsaunders/appkit-forms-core` is the framework-neutral form contract shared by the
production reference applications. It accepts both plain-string authoring copy and locale-keyed
copy, with or without a workflow. Its field registry is the union of the source
products: finance fields (`currency`, `percentage`, `gl_account`, `party`) sit
beside the full safety/field-operations vocabulary. The dependency-light root
owns parsing, cross-reference linting, conditional logic, formula evaluation,
defaults, response validation, scoring, participant extraction, attachment URL
policy, companion-value conventions, and DOM-free text extraction. Rich document sanitization and response
normalization are explicit `@braedonsaunders/appkit-forms-core/sanitize` and
`@braedonsaunders/appkit-forms-core/response-normalize` entries so a validator-only service does
not allocate or bundle a browser DOM. The package has no UI, token, or
email-rendering dependency; its small localization dependency resolves authored
labels for companion and automation profiles.
The live `/forms/core` reference executes the schema parser and response
validator, lists the field registry, and displays both automation vocabularies.

Automation is source-native rather than artificially flattened:
`@braedonsaunders/appkit-forms-core/safety-automation` preserves the safety workflow contract,
while `@braedonsaunders/appkit-forms-core/business-automation` preserves the ERP
lifecycle contract. Both retain their complete upstream automation tests. The
payloads intentionally remain separate where same-named actions mean different
things.

`@braedonsaunders/appkit-forms` now has two explicitly different runtime surfaces. Use
`ProductionFormRenderer` for production parity: it is the complete source fill
runtime with revision-safe and unload-safe drafts, inline field saves, lazy
draft creation, server validation, guided steps, formulas/defaults/conditional
logic, entity refresh, hierarchy and data-source queries, repeating sections,
tables, matrices, ratings, attestations, media/photo analysis and annotation,
signatures, sketches, responsive columns/canvas layouts, read-only records, and
submission handling. The renderer binds locale/copy and a
`ProductionFormRuntimeAdapter`; the host retains routing, persistence, uploads,
authorized data access, and optional photo analysis inside its trust boundary.
The source English copy catalogue is complete and consumers can replace it with
their own generated-copy translator.

`ProductionFormDesigner` is the complete generalized source authoring workspace:
the 1/3–2/3 composition, overview, complete field palette, stacked/free canvas,
tabs, sign-off workflow, record behaviour, record-list columns, manual actions,
assignments, permissions, localized copy, preview, immutable publishing, and
property inspectors are present. Persistence, navigation, data sources,
authorization, optional AI assistance, and workflow rendering are typed host
seams. `formFlowProfile` and `lintFormFlowGraph` preserve the source companion,
writability, photo, and top-level-field rules when composing
`@braedonsaunders/appkit-workflows/react`.

`FormRenderer` and `FormDesigner` remain smaller controlled compositions for
applications that intentionally own every callback. Neither is the production
parity surface. The live `/forms` reference now runs `ProductionFormDesigner`,
the production Flows canvas, the complete production fill runtime, JSON
editing, import/export, and browser-local persistence without a database.

`@braedonsaunders/appkit-editor` owns the optional TipTap authoring control used by rich-text
fields. Companion-value conventions live in `@braedonsaunders/appkit-forms-core` because forms,
flows, and documents must agree on them. `@braedonsaunders/appkit-forms-documents` owns document
styles and generated bounded PDF templates and re-exports those canonical
helpers for existing document consumers.

`@braedonsaunders/appkit-i18n` resolves supported locales, Accept-Language, tenant defaults,
per-user overrides, and localized authored content. Plain-string records remain
valid during progressive adoption.

`@braedonsaunders/appkit-email-render` is the extracted production rendering keystone used before
`@braedonsaunders/appkit-emails` transport. It compiles inline, saved-template, and design modes;
escapes merge values; supports bounded loops and conditionals; produces HTML and
plain text; sanitizes authored markup; and validates provider-neutral delivery
inputs without allocating decoded attachments.

## 6. Analytics and card queries (`@braedonsaunders/appkit-analytics`)

The analytics package deliberately knows no host-application domain tables.
An app provides an `AnalyticsCatalog`: authored source `FROM` clauses, the tenant
column, and a whitelist of fields with authored SQL expressions and semantic
types. User input can only select these keys. `compileQuery` always adds the
tenant predicate as `$1`, parameter-binds every filter/literal, validates formula
AST functions, caps result limits, and never accepts raw user SQL.

```ts
import { compileQuery, type AnalyticsCatalog } from '@braedonsaunders/appkit-analytics/server'

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

## 7. Governed scripts and installable apps

`@braedonsaunders/appkit-sandbox` is the common QuickJS execution kernel. It creates a fresh
WASM runtime per invocation, exposes no ambient host APIs, deep-freezes input,
and enforces memory, stack, deadline, and governance-unit ceilings. Add host
capabilities explicitly as synchronous-looking async functions. Do not expose a
database client, fetch implementation, filesystem handle, or tenant-unscoped
service to authored code.

`@braedonsaunders/appkit-process-sandbox` is deliberately separate from that authored-code
kernel. It owns the reusable Linux bubblewrap policy for full coding-agent or
trusted-worker processes: process/IPC/UTS/cgroup namespaces, masked host data,
read-only system roots, explicit writable workspace/home binds, a fresh
`/proc`/`/dev`/`/tmp`/`/run`, and a fully cleared child environment. Applications
inject the authenticated tenant's resolved paths, command, credentials, egress
proxy variables, and resource policy. `spawnBubblewrappedProcess` fails closed
on unsupported hosts or missing bind sources; `buildBubblewrapPlan` exposes the
same deterministic plan for tests, audits, and readiness UI. Desktop
single-user execution remains an explicit application mode and must never be an
automatic server fallback.

`@braedonsaunders/appkit-scripts` builds event, scheduled, endpoint, bulk, and browser-client
automation on that kernel. The application supplies the trigger catalogue,
mutable subject fields, tenant-bound read adapters, governed write functions,
identity, routes, and authorization. `/client` preserves the production
fail-open opaque-iframe validation gate; `/jobs` supplies a queue-neutral worker
handler; `/react`, `/schema`, and `/drizzle` add the complete authoring and
persistence layers. The React editor preserves the source CodeMirror authoring
surface with line numbers, folding, JavaScript completion, trigger-aware starter
source, keyboard editing, separate run selection and log inspection, and the
general/code/runs/log drawer flow.

`@braedonsaunders/appkit-scripts/bound` is the cutover seam for an application that already
has authored scripts. Configure its existing sandbox global, native context,
tenant resolver, host values, reads, and governed writes once; the returned
positional `runScript`, trigger, scheduled, endpoint, and bulk methods preserve
the caller and authored-code contract without putting application vocabulary in
AppKit.

`@braedonsaunders/appkit-apps` is the installable application platform. Its root owns validated
manifests and ZIPs, install/upgrade lifecycle, capability intersection, frontend
assembly, backend dispatch, files, storage, run history, publishing, and object
provisioning boundaries. `/runtime` preserves the source-shaped backend import;
`/bridge` owns the CSP and message protocol; `/react` provides the app manager,
the source nested/collapsible file tree, CodeMirror syntax editors for
JavaScript/HTML/CSS/JSON, binary file inspection, create/upload/delete/save
controls, endpoint authoring, live opaque-origin preview, run inspector, and library;
`/memory` and `/drizzle` are complete database-free and Postgres persistence
adapters. The iframe must retain `sandbox="allow-scripts"` without
`allow-same-origin`, and its CSP must keep `connect-src 'none'`. Effective
capabilities are always `(administrator grants ∩ invoking user permissions)`.
`@braedonsaunders/appkit-apps/service` similarly binds the complete positional lifecycle API to
an application store and permission/runtime adapters, while
`createAppEndpointRuntime` preserves an existing authored backend global and
host-adapter shape.

The runnable references are `/admin/scripts`, `/admin/apps`, and
`/packages/process-sandbox/demo`. They use the same server runtimes and database-free
stores public consumers receive; the preview iframe and QuickJS backend are
real, while the OS sandbox page renders its real deterministic execution plan
without performing a privileged spawn in the demo server.

## 8. Scaffolding a new app

```bash
pnpm create appkit my-app
# Optional groups: ai, analytics, communications, customization, documents,
# extensions, forms, integrations, platform, tenancy, workflows
pnpm create appkit my-app --features forms,tenancy,workflows --yes
```

`create-appkit` writes a minimal Next.js application with the real `AppShell`,
semantic-token stylesheet, pre-paint theme script, `ThemeProvider`, framework
link adapter, `Toaster`, and browser-native `PageTransition` already composed.
It refuses to overwrite a non-empty directory and can install with pnpm, npm,
Yarn, or Bun. Feature groups add packages, not invented domain screens or data.

For an existing application, install only the foundation packages:

```bash
pnpm add @braedonsaunders/appkit-ui @braedonsaunders/appkit-tokens
```

```css
/* app globals.css — the whole system in one import (Tailwind v4 + tokens) */
@import '@braedonsaunders/appkit-ui/styles.css';
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

## 8. Multi-tenancy out of the box (`@braedonsaunders/appkit-db` + `@braedonsaunders/appkit-tenant`)

An app on appkit is multi-tenant with super-admin from day one — you don't build
RLS or RBAC yourself.

```ts
import { createDb, tenantRef, id, installRlsSql, IDENTITY_TENANT_TABLES } from '@braedonsaunders/appkit-db'
import * as schema from '@braedonsaunders/appkit-db/schema'

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
- **Request context** (`@braedonsaunders/appkit-tenant`): the shared context carries tenant,
  membership, timezone, effective/default/enabled locale policy, permissions,
  scopes, active role, impersonation, API-key attribution, and a tenant-bound
  database callback. Add application-owned identity data with
  `RequestContext<MyContextExtension>`; do not fork the core type.
- **RBAC** (`@braedonsaunders/appkit-tenant`): resolve the user's permission set with the
  production-shaped `resolveMembershipAccess(tx, membershipId, activeRoleId?)`,
  then gate mutations with `assertCan(ctx, 'module.action')`. Bind the app's
  permission catalogue once with `createMembershipAccessResolver` when concrete
  denies can carve keys out of wildcard grants. `module.*` wildcards and
  `.read.{all,site,self}` tiers work; super-admins pass everything.
- **Existing database runtimes** use `createTenantContextFactory` to retain the
  same `makeTenantContext(baseDb, args)` / `makeSuperAdminContext(baseDb, userId)`
  call sites while the application continues to own its RLS implementation.

The canonical identity schema (tenants, users, memberships, roles,
role_assignments, per-user permission overrides) ships in `@braedonsaunders/appkit-db/schema` —
extend it, don't reinvent it.

`@braedonsaunders/appkit-dashboard/schema` exports `userDashboardLayouts`, `insightCards`, and
`DASHBOARD_TENANT_TABLES`, and ships its own Drizzle migration. Include its table
list in the RLS installer when the feature is installed. Layouts are personal
per tenant/user; cards persist their semantic query, visualization, settings,
owner, and draft/published state. Notification tables and migrations follow the
same feature-owned pattern under `@braedonsaunders/appkit-notifications/schema`.

## 9. Secrets and outbound delivery (`@braedonsaunders/appkit-crypto`, `@braedonsaunders/appkit-emails`, `@braedonsaunders/appkit-sms`)

- Seal tenant provider credentials with `sealSecret` from `@braedonsaunders/appkit-crypto` before
  persistence and inject `unsealSecret` into email/SMS transport resolution.
  Production requires the same 32+ character `APPKIT_SECRET` in every service
  that seals or consumes credentials; local development has an explicit insecure
  fallback.
- Existing applications can reproduce their current ciphertext profile with
  `createSealer(secret, { hkdfInfo })`. Applications with versioned compact
  ciphertext, per-tenant HKDF salt, and record-bound AES-GCM additional data use
  `createContextualSealer`; this permits a clean package cutover without
  invalidating live credentials. Email and SMS accept an `unsealSecret`
  function explicitly. AppKit does not ship application-named crypto or
  transport entry points.
- Email and SMS resolve the same platform policy: `disabled` suppresses delivery,
  `global_only` uses the platform provider, and `tenant_optional` prefers a valid
  tenant provider. A corrupt explicitly enabled tenant override fails closed.
- SMS destinations are strict E.164. The five fetch-based providers are Twilio,
  Vonage, MessageBird, Plivo, and Telnyx; provider errors are bounded, sanitized,
  and stripped of credentials before they reach logs or users.

## 10. Reports and documents

`@braedonsaunders/appkit-reports` owns fiscal periods, nested filter trees, relationship
refinement, metadata-backed custom fields, tenant-bound row and summary query
compilation, fiscal breakouts, grouped result shaping, saved definition
registries, document layout/rendering, DST-safe cadence, schedule policy, and
lease-based idempotent run claiming. `@braedonsaunders/appkit-reports/react` preserves the
production report surface: `ReportStudio` has the one-third scrolling build rail
and two-thirds live paper preview, grouped searchable sources, catalogue-derived
templates, ordered/searchable columns, and debounced preview/autosave adapters;
successful saves may return the persisted controlled value (for example, the
server-assigned definition id), and `onSaved` gives framework hosts a
post-commit navigation seam. Failed autosaves remain dirty and retry after the
next edit instead of being marked saved; controls are locked while persistence
is in flight so a create cannot race a second create or overwrite newer edits;
`ReportScheduleForm` preserves the production create/edit contract for daily,
weekly, day-of-month, and nth-weekday delivery, member and external recipients,
date bounds, timezone, report filters, and custom email copy;
`ReportScheduleList`, `ReportRunHistory`, and `ReportRunDetail` preserve the
searchable schedule register, pause/resume and run-now actions, paged execution
history, failure output, and generated-artifact seam;
`PaperView` and `ReportPaper` provide the
shared document presentation; `StatementMatrixTable` keeps grouped headings,
hierarchy, accounting currency, actual/thousands/millions scaling, percentage
variance semantics, totals, collapse/expand, account navigation, and amount
drill-through; and
`ReportDrillDrawer`, `ReportFilterBar`, and `ReportExportMenu` retain supporting
rows, pagination, the complete compact period/date/breakout/compare/subsidiary/
customer/dimension/basis/scale/section filter surface, PDF-backed print, and
multi-format actions.
The recursive filter editor, ordered/renamable columns, three-level sort, page
setup, schedule, run, and save controls write the same contracts the compiler
consumes. Schedule create and update adapters share
`parseReportScheduleForm`, so cadence, bounded filters, recipient policy, and
delivery copy cannot drift between mutations. Applications inject their
catalogue, tenant-scoped execution, persistence, member lookup, typed drill
target/loader, native record opener, and export/delivery transport.
Domain-specific built-in definitions remain in the consuming application rather
than becoming framework defaults. Applications rendering these React surfaces
import `@braedonsaunders/appkit-reports/styles.css` alongside
`@braedonsaunders/appkit-ui/styles.css` so Tailwind v4 scans the packaged components.

The stored query plan intentionally keeps the production contract names:
`ReportCustomQuery`, filter leaf `op`, measure `fn`, `sort` plus `sorts`, and
nullable `columnLabels`. The entity boundary accepts both production catalogue
families directly: expression/from/org-scope catalogues (`expr`, `from`,
`orgColumn`) and physical-table/RLS catalogues (`table`, optional `sql`). AppKit
normalizes those server-authored surfaces internally without requiring saved
query migrations. Application-owned catalogues may mark technical columns
`hidden`; those columns remain usable by trusted `baseFilter` scope predicates
but are excluded from the studio, defaults, and user-authored query plans.

`@braedonsaunders/appkit-pdf` provides a pure-JS PDFKit report,
table, and financial-statement renderer. Bounded template rendering is under
`@braedonsaunders/appkit-pdf/template`; HTML sanitization and hardened Chromium printing are
under `@braedonsaunders/appkit-pdf/html`, so a report-only service does not install Chromium.
`@braedonsaunders/appkit-forms-pdf` provides safe form-summary HTML at its root, then opt-in
production browser/resource runtime, PNG conversion, summary, record/report
template, and full-bleed design rendering entries.

`@braedonsaunders/appkit-design-studio` owns the bounded multi-artboard print document. Its
controlled editor is isolated at `@braedonsaunders/appkit-design-studio/react` and
supports Fabric selection, drag/resize/rotation, inline text editing,
zoom/fullscreen, artboards, insertion, layers, z-order, visibility/locking,
the full text/shape/image/QR property inspector, factories/defaults, controlled
copy, HTML output, and print-provider settings.
`@braedonsaunders/appkit-design-studio/fabric` remains the lazy
canvas-runtime boundary. Data field keys, sample values, persistence, and output
actions come from the application; product entities are not hardcoded in the
package. The working references are `/reports` and `/design-studio`.
Applications that render the editor import `@braedonsaunders/appkit-design-studio/styles.css`
in their Tailwind entry alongside `@braedonsaunders/appkit-ui/styles.css`.

`@braedonsaunders/appkit-storage` is the generalized S3/R2/MinIO runtime: tenant-owned object
keys, automatic multipart writes, client multipart completion/abort, byte
ranges, streaming reads, rich metadata, verified ETag promotion, lifecycle
tags, and existence-safe presigning live behind one injected configuration.
`@braedonsaunders/appkit-storage/env` exposes a strict, portable `APPKIT_STORAGE_*` environment
contract. Applications with another configuration system use `createStorage`.
`@braedonsaunders/appkit-storage/react` is the complete extracted record-attachment workspace:
upload, URL-backed search/type filters/paging, image and PDF preview, download,
expanded preview, and removal. It retains the source `targetTable`/`targetId`
caller shape while injecting an `AttachmentAdapter`, so authorization, tenancy,
metadata persistence, and file routes remain application-owned.
`createHttpAttachmentAdapter` matches the source GET/POST/DELETE response
contract; `@braedonsaunders/appkit-storage/memory` is a functional database-free adapter for
tests, demos, and local tools. Selecting the `storage` capability in
`create-appkit` installs this package without pulling it into unrelated apps.
`@braedonsaunders/appkit-jobs` supplies lazy BullMQ producer/worker connections, bounded Redis
readiness, source payload validators, and an atomic fixed-window rate limiter.
Its optional queue entries preserve the production email, notify/push,
PDF/document, report, scheduled, outbound, authored-script, sandbox, migration,
and asynchronous capture contracts. Queue names, payload ceilings,
recipient fan-out, deterministic IDs, in-flight PDF de-duplication, retries,
backoff, retention, worker concurrency, and the complete eleven-job repeatable
schedule registry are retained behind an application-owned `createJobs`
runtime. Factories remain lazy until a queue or worker is requested, and
existing deployments can override queue names or concurrency without forking
the runtime.
Its `/web-push` entry includes subscription validation, public-DNS
checks, bounded encrypted payloads, and terminal provider status handling.

## 11. Workflows, sync, integrations, notifications, and customization

`@braedonsaunders/appkit-workflows` provides dependency-free graph conversion, persistence
limits, cycle detection, linting, durable runs, replay-safe action claims, and
approval gates. Its `any`/`all` quorum behavior and pause/resume seam come from
the production reference implementations. Gate rows retain
their branch plans so a worker can resume after a process restart.
The root also exports the record-facing approval projection contract plus
source-compatible HTTP and fully functional memory adapters. It preserves the
production `subjectKind`/`subjectId`, record-state query, gate-decision body,
409 concurrency result, pending-assignee, and approval-history shapes.
`@braedonsaunders/appkit-workflows/react` adds the production multi-flow studio: workflow
library rail, enable/rename/delete controls, full React Flow canvas, node
toolbar, typed node registry, subject-compatible templates, drawer inspector,
and live lint. The application injects its subject profile, persistence adapter,
optional message catalogue, and optional email-design adapter while the package
owns the complete authoring interaction. The smaller single-graph
`WorkflowBuilder` remains available for embedded editors.
`RecordApprovalProvider`, `ApprovalActions`, and `ApprovalHistory` provide the
production record-flyout experience: viewer-authorized approve/reject actions,
a required rejection reason, pending-with feedback, shared state refresh, and
the collapsible submitted/requested/approved/rejected/escalated/delegated event
history. The provider injects authorization-bound state/decision I/O and the
host router refresh seam; the controls retain their source caller shape.
Dependency-sensitive consumers may import the same surface from
`@braedonsaunders/appkit-workflows/approval-react` without loading the visual studio, React
Flow, or form-authoring modules.
`/approval-tokens` signs one-click decisions;
`/schema` and `/drizzle` own definitions, runs, gates, and action executions.
The two source-native automation schemas remain in `@braedonsaunders/appkit-forms-core`; apps
adapt either schema through `WorkflowPlanner` and inject their action handlers.

`@braedonsaunders/appkit-sync` is the inbound connector spine: app-defined and built-in CSV,
database, HTTPS JSON, managed-provider, and ERP connectors emit a
generic `{entity, externalId, data}` envelope into an injected target adapter.
The production orchestrator loads the configured connection, resolves secrets
through an application adapter, pulls outside a transaction, prepares the
target once, then applies records in 250-row tenant-scoped transactions with a
savepoint per record. It owns scheduled/manual/preview triggers, source/manual
ownership modes, complete per-entity counters, durable run logs, per-record
before/after/diff/failure ledgers, and cursor advancement only after a clean
run. Partial and failed runs retain the old cursor so the next pull covers every
failed row again. Authoritative snapshots refuse to archive when a pull is
empty, authority is missing, or any row failed; archive changes share the same
ledger. The exact production people convergence/natural-adoption policy is
available under `/person-sync-policy`. `/egress` compatibility-re-exports the DNS-pinned,
SSRF-safe HTTPS transport from `@braedonsaunders/appkit-egress-proxy/secure-fetch`;
`/db-drivers` adds TLS-only PostgreSQL, MySQL, MariaDB, and SQL Server; `/schema`
and `/drizzle` own connections, crosswalks, full run state, and record changes.
The memory adapter runs the same state machine for local-first applications,
tests, and the database-free playground. Canonical tables, natural-key lookup,
field ownership, and archive writes remain the application's typed target
adapter because those schemas are product-owned.

`@braedonsaunders/appkit-integrations` is the outbound trigger-to-destination spine. Product
modules emit already-authorized item namespaces; the dispatcher maps tokens,
unseals through an app adapter, consults the delivery ledger, and records refs.
A source-shaped publisher selects every enabled matching automation and emits
one deterministic durable job per automation. The production React entry
contains the connected hub, searchable inbound/outbound catalogue, and complete
automation builder: trigger/destination selection, declared connection and
secret fields, destination-specific mappings, token insertion, testing, enable
and send-once policy, and save callbacks.
A failed multi-item delivery resumes known successes, while send-once suppresses
only a completely pushed delivery. HTTP, Slack/Teams, Google Sheets, email, and
SQL are optional entries. Email receives the app's transport. SQL preserves the
production row and weekly fan-out modes, required-field filtering, value maps,
and identity-based reversal. HTTP/chat/Sheets use the shared hardened egress transport.
The source-shaped `tenant_integrations` and `integration_export_log` schema,
clean migration, RLS-required Drizzle store, and database-free memory store run
the same publisher/dispatcher contract. The working reference is
`/admin/integrations`.

`@braedonsaunders/appkit-notifications` applies tenant category policy, per-user channel
preferences, digest/quiet-hour behavior, critical delivery rules, and stable
deduplication keys before invoking app-owned delivery adapters. Digest
aggregation and push subscription lifecycle are package-owned. Its root has no
dependencies. `@braedonsaunders/appkit-notifications/schema` owns its feature tables,
`@braedonsaunders/appkit-notifications/drizzle` provides the RLS-aware delivery store and a
tenant/user-bound inbox adapter with search, cursor paging, folder counts, and
mutations. It also owns source-shaped atomic preference and tenant-configuration
adapters, including the singular `tenant_notification_policy` table and its
digest, quiet-hour, scan-enabled, cron, and timezone fields. Domain to-dos and
recipient catalogue queries remain injected. The React entry
`@braedonsaunders/appkit-notifications/react` provides the complete responsive three-pane inbox:
smart and category folders, search, optimistic read/unread/delete/snooze,
to-dos, cursor paging, a reading pane, mobile drawers, recoverable errors, and
the matching loading shell. Applications inject the tenant/user-scoped
`NotificationInboxAdapter`, category/to-do visuals, routes, and localized copy.
The same entry preserves both production settings surfaces: the user
category/channel matrix plus browser/OS Web Push enrollment, and the tenant
routing cockpit with transport readiness, digest delivery, quiet hours,
automatic scan schedule, roles, people, groups, channels, escalation ladders,
dirty state, and atomic save. Applications inject their category/recipient
catalogues, authorized persistence, transport links, VAPID credentials, and
delivery providers. The working routes are `/notifications`,
`/notifications/preferences`, and `/admin/notifications`.

Package boundaries are executable architecture. `pnpm check:boundaries` rejects
runtime cycles and forbidden foundation dependencies; `pnpm test:isolation`
walks each package root's complete source import graph and fails if an optional
adapter peer leaks into it. Both run as part of `pnpm lint`.

`@braedonsaunders/appkit-customization` owns the production customization contracts: versioned
form layouts, ordered header groups, editable line-item columns, record actions,
saved list views, structured filters, defaults, parse/lint/refresh behavior, and
custom-field definitions. The framework-free root also resolves explicit,
personal, organization, and system views in production order; merges newly
registered/custom columns without losing user order; and executes the same
search, filter, sort, and pagination contract in database-free applications.
Applications bind their record metadata once with `createCustomizationEngine`;
the returned key-based defaults, parse/lint/refresh helpers, and registry keep
call sites source-shaped while preventing application records, storage tables,
action vocabularies, and translation keys from leaking into AppKit.
`@braedonsaunders/appkit-customization/react` exports the extracted `RecordListView`,
`CustomizationStudio`, `FormDesigner`, `ListViewDesigner`, and
`CustomFieldDesigner`. `RecordListView` is the consuming record surface: saved
view picker/defaults, compact quick filters, subtabs, sortable typed columns,
record drill-through, actions, empty state, and controlled pagination. Currency,
status semantics, labels, routing, and domain cell renderers are injected.

`@braedonsaunders/appkit-customization/memory` supplies the complete authorization-aware saved
view repository for database-free and local-first apps. Both memory and Drizzle
stores require that bound registry and validate every write against it.
`@braedonsaunders/appkit-customization/persistence-schema` owns the four extracted tenant tables
for layouts/views and their per-user preferences, while
`@braedonsaunders/appkit-customization/drizzle` supplies the RLS-compatible saved-view repository
with ownership checks, default uniqueness, validated writes, preference upsert,
and deletion cleanup. `CustomizationStudio` retains the complete one-third
library / two-thirds editor composition; the individual editors remain available
for embedded use. Applications inject permission decisions, record catalogues,
labels, roles, and routing. Import
`@braedonsaunders/appkit-customization/styles.css` wherever the React editors are used so
Tailwind scans the optional package. The database-free `/customization`
reference connects that same studio to a working source-derived record list and
browser-local persistence.

The working references are `/workflows`, `/admin/integrations`,
`/notifications`, and `/customization`.

The playground uses **Packages** as its single showcase navigation. `/packages`
is generated from the committed workspace manifests and links to a detail page
for every publishable package, including its real exports, dependencies,
optional peers, tags, source, and a working demo action. Interactive demos are
reached from their owning package page instead of a parallel Demonstration
menu. Server-oriented packages use dedicated `/packages/[slug]/demo` readiness
views built from their real exports; they never borrow an unrelated admin
screen or perform privileged mutations. The catalogue inventory test fails when
a package manifest is added without a page or demo target.

For the rules any app on this foundation must follow, see
[`building-applications.md`](building-applications.md).
