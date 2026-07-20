# Provenance audit

appkit has three kinds of code. Do not blur them:

- **Faithful extraction** — ported from a named production sibling source;
  app coupling is replaced by props/providers, but behavior and visual grammar
  stay aligned.
- **Generalized production pattern** — a real sibling flow expressed as a
  reusable primitive or framework-neutral package.
- **appkit-original** — no matching production implementation existed. These
  components must not be presented as extracted or sibling-identical.

This inventory was audited against the local OpenBooks and BeaconHS checkouts
on 2026-07-19.

## Application shell and navigation

| appkit surface | classification | production source |
|---|---|---|
| `AppShell` | faithful generalized extraction | `openbooks/web/components/app-shell.tsx`; `beaconhs-platform/apps/web/src/components/app-shell.tsx` |
| `TopNav` | faithful generalized extraction | `openbooks/web/components/top-nav.tsx` and `web/lib/top-nav-overflow.ts` |
| `AppSidebar` | faithful generalized extraction | both apps' `components/app-sidebar.tsx` |
| `SidebarNav` | compatible superset | OpenBooks workspace/subgroup implementation plus the BeaconHS grouped-list contract |
| `MobileTabBar` / mobile selection | faithful generalized extraction | both apps' `components/mobile-tab-bar.tsx`; OpenBooks `web/lib/mobile-nav.ts` |
| mobile drawer inside `AppShell` | generalized production pattern | both apps' `components/mobile-nav-toggle.tsx`, implemented with appkit's extracted `Drawer` |

The flat-link top navigation introduced in appkit commit `21b98ad` was invented
and was not sibling-compatible. It was removed rather than retained as a second
navigation system.

## UI package

Faithful or generalized extractions:

- Base primitives: `Alert`, `Badge`, `Button`, `Card`, `ContextMenu`, `Drawer`,
  `EmptyState`, `Input`, `Label`, `PageHeader`, `Popover`, `SearchSelect`,
  `Separator`, `Skeleton`, `Table`, `Textarea`, and utilities come from the
  siblings' `packages/ui/src` implementations and are tokenized here.
- `PageContainer`, list/detail/wizard layouts come from both apps'
  `components/page-layout.tsx`.
- `LineGrid` comes from `openbooks/web/components/line-grid.tsx`.
- `AdminHub`, `SettingsShell`, `SettingsNav`, `SettingsSection`, and
  `SettingsRow` come from the OpenBooks admin hub and setup shell.
- `RecordList` and URL-driven search/filter/sort/pagination are generalized from
  OpenBooks production list pages and navigation helpers.
- `Select` is an appkit convenience adapter over the extracted `SearchSelect`;
  the earlier standalone combobox was invented and removed in commit `fb323a0`.

appkit-original UI with no direct sibling component source:

- `ApiReference`, `ApiEndpoint`, `MethodBadge`, and `CodeBlock`.
- `Avatar`, `Checkbox`, `Dialog`, `Progress`, `Spinner`, `Switch`, `Tabs`, and
  `Tooltip`.
- The Sonner-compatible `toast`/`Toaster` implementation. Its API mirrors what
  the siblings consume, but the implementation is appkit's.
- The standalone component-gallery composition and appkit brand artwork.

These originals may be useful, but they are not evidence of OpenBooks/BeaconHS
parity until a consuming app adopts them or they are explicitly reconciled with
a new sibling source.

## Platform packages

| package | classification | production lineage |
|---|---|---|
| `@appkit/tokens` | appkit-original abstraction | semantic-token layer built around the siblings' real light/dark palette and UI values |
| `@appkit/db` | generalized extraction | OpenBooks DB executor/schema conventions plus BeaconHS Postgres RLS engine |
| `@appkit/tenant` | generalized extraction | BeaconHS request context/RBAC, decoupled from its domain schema |
| `@appkit/auth` | generalized extraction | OpenBooks password/session implementation |
| `@appkit/events` | generalized extraction | BeaconHS audit and transactional outbox |
| `@appkit/api` | generalized extraction | BeaconHS `apps/web/src/lib/api` layer, made framework-neutral; OpenAPI description helpers are appkit-original extensions |
| `@appkit/endpoints` | generalized extraction | OpenBooks apps runtime / QuickJS endpoint sandbox |
| `@appkit/crypto` | generalized extraction | BeaconHS sealed-secret package and OpenBooks secret handling |
| `@appkit/emails` | generalized extraction | BeaconHS multi-provider email transport plus OpenBooks delivery validation |
| `@appkit/sms` | faithful generalized extraction | BeaconHS provider catalogue and transport policy |
| `@appkit/jobs` | generalized extraction | BeaconHS BullMQ connection and worker patterns |
| `@appkit/storage` | generalized extraction | BeaconHS S3-compatible storage core |

## Rule for future work

Every new primitive or package must name its production source in the commit and
in this file. If no source exists, label it **appkit-original** before building
it. “Compatible API” is not the same claim as “identical implementation,” and a
visual approximation is not an extraction.
