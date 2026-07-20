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
and `.appkit-row` (staggered table rows).

## 2. Primitive index

Import everything from `@appkit/ui`.

**Buttons & inputs** — `Button` (variants: default/secondary/outline/subtle/ghost/
destructive/link; sizes sm/md/lg/icon; `asChild`) · `Input` · `Textarea` ·
`Label` · `Select` (searchable combobox, options-based, backed by `SearchSelect`)
· `SearchSelect` (desktop dropdown + mobile bottom sheet, groups, hints,
clearable, keyboard nav) · `Checkbox` · `Switch`.

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
(+ parts) · `Tabs` (animated indicator).

**App shell / admin** — `PageHeader` · `AdminHub` (the settings **landing/hub** —
grouped accent cards) · `SettingsShell` (the **sidebar settings area** — fixed
header + two-pane rail) + `SettingsNav` / `SettingsSection` / `SettingsRow`.
`AppShell` renders the same OpenBooks/BeaconHS-compatible navigation registry as
the OpenBooks workspace-dropdown topbar (default) or the shared collapsible
sidebar via `navigationMode="topbar" | "sidebar"`. The registry supports the
siblings' serializable `iconKey`, `id`, subgroup, exact-match, and mobile-pin
fields; mobile uses the same data in a drawer and bottom tab bar. `TopNav`,
`AppSidebar`, `SidebarNav`, and `MobileTabBar` are also exported directly.

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

## 4. Scaffolding a new app

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
TSX source, not built output). Then compose screens from the primitives above —
every color a token, light + dark for free.

## 5. Multi-tenancy out of the box (`@appkit/db` + `@appkit/tenant`)

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

## 6. Secrets and outbound delivery (`@appkit/crypto`, `@appkit/emails`, `@appkit/sms`)

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

For the rules any app on this foundation must follow, see
[`building-applications.md`](building-applications.md).
