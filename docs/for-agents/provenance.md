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
on 2026-07-20.

## Application shell and navigation

| appkit surface | classification | production source |
|---|---|---|
| `AppShell` | faithful generalized extraction | `openbooks/web/components/app-shell.tsx`; `beaconhs-platform/apps/web/src/components/app-shell.tsx` |
| `TopNav` | faithful generalized extraction | `openbooks/web/components/top-nav.tsx` and `web/lib/top-nav-overflow.ts` |
| `AppSidebar` | faithful generalized extraction | both apps' `components/app-sidebar.tsx` |
| `SidebarNav` | compatible superset | OpenBooks workspace/subgroup implementation plus the BeaconHS grouped-list contract |
| `MobileTabBar` / mobile selection | faithful generalized extraction | both apps' `components/mobile-tab-bar.tsx`; OpenBooks `web/lib/mobile-nav.ts` |
| mobile drawer inside `AppShell` | generalized production pattern | both apps' `components/mobile-nav-toggle.tsx`, implemented with appkit's extracted `Drawer` |
| `AccountMenu` | compatible generalized extraction | OpenBooks `web/components/account-menu.tsx` launcher visual grammar; choices/persistence are controlled props so BeaconHS and other apps can supply their policy |
| `GlobalSearch` | generalized production pattern | both apps' `components/global-search.tsx`; domain querying and route selection are injected |
| `NotificationsBell` | compatible superset | OpenBooks inbox list plus BeaconHS controlled unread/menu pattern; items and mutations are injected |
| theme/navigation/link providers | faithful generalized extraction | both apps' `theme-provider.tsx`, `theme-toggle.tsx`, `app-link-provider.tsx`, and `navigation-provider.tsx`; sibling UI `link-context.tsx` was byte-identical |

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
  `SettingsRow` come from the OpenBooks admin hub and setup shell. `AdminHub`'s
  detailed capability-card layout is a generalized extension of that same card
  grammar for package inventories; the compact settings layout remains the
  faithful default.
- `RecordList` and URL-driven search/filter/sort/pagination are generalized from
  OpenBooks production list pages and navigation helpers.
- `Select` is the BeaconHS native-`<select>`-API implementation from
  `beaconhs-platform/packages/ui/src/select.tsx` and `select-options.ts`, copied
  at source parity with its upstream tests. It preserves `<option>`/
  `<optgroup>`, form submission, required validation, refs, and genuine change
  events while presenting `SearchSelect`. Options-array consumers use
  `SearchSelect` explicitly; AppKit no longer substitutes a different contract
  under the `Select` name.
- `DashboardGrid`, its customize toolbar, edit overlays, categorized widget
  drawer, and role/personal/default layout contract are faithful generalized
  extractions from OpenBooks `web/app/(app)/dashboard` and BeaconHS
  `apps/web/src/app/(app)/dashboard`.
- `DashboardMetricCard`, `DashboardPanel`, the card-library list, and the
  two-column `CardStudio` visual grammar are faithful generalized extractions
  from OpenBooks dashboard widgets and `web/app/(app)/insights/CardStudio.tsx`.
- `InsightResultView` and the expanded visualization vocabulary are generalized
  from both siblings' insights renderers, with BeaconHS providing the richer
  scalar/progress/row/donut/gauge vocabulary.
- `AnimatedNumber` is a token-timed extraction of the byte-identical sibling UI
  primitive. `Sparkline` is the shared sibling implementation with i18n replaced
  by labels and every raw chart color replaced by semantic tokens.

appkit-original UI with no direct sibling component source:

- `ApiReference`, `ApiEndpoint`, `MethodBadge`, and `CodeBlock`.
- `Avatar`, `Checkbox`, `Dialog`, `Progress`, `Spinner`, `Switch`, `Tabs`, and
  `Tooltip`.
- The Sonner-compatible `toast`/`Toaster` implementation. Its API mirrors what
  the siblings consume, but the implementation is appkit's.
- `PageTransition` and the `appkit-page-transition` browser-native route motion;
  neither sibling had a routed-page transition implementation to extract.
- The standalone component-gallery composition and appkit brand artwork.

These originals may be useful, but they are not evidence of OpenBooks/BeaconHS
parity until a consuming app adopts them or they are explicitly reconciled with
a new sibling source.

## Platform packages

| package | classification | production lineage |
|---|---|---|
| `@appkit/tokens` | appkit-original abstraction | semantic-token layer built around the siblings' real light/dark palette and UI values |
| `@appkit/analytics` | generalized extraction | OpenBooks `packages/analytics` catalog/compile/execute/viz contracts plus BeaconHS `packages/analytics` BHQL AST, expression parser, semantic safety, results, and visualization registry; all domain catalogues are injected |
| `@appkit/ai` | generalized extraction | BeaconHS `packages/ai/src/agent.ts` multi-step streaming runtime plus OpenBooks `web/components/assistant` thread, message-parts, markdown, and tool-card UI; providers, persistence, prompts, and domain tools are injected |
| `@appkit/db` | generalized extraction | OpenBooks DB executor/schema conventions plus BeaconHS Postgres RLS engine |
| `@appkit/tenant` | generalized extraction | BeaconHS request context/RBAC, decoupled from its domain schema |
| `@appkit/auth` | generalized extraction | OpenBooks password/session implementation |
| `@appkit/events` | generalized extraction | BeaconHS audit and transactional outbox |
| `@appkit/api` | generalized extraction | BeaconHS `apps/web/src/lib/api` layer, made framework-neutral; OpenAPI description helpers are appkit-original extensions |
| `@appkit/endpoints` | generalized extraction | OpenBooks apps runtime / QuickJS endpoint sandbox |
| `@appkit/crypto` | generalized extraction | BeaconHS sealed-secret package and OpenBooks secret handling |
| `@appkit/emails` | generalized extraction | BeaconHS multi-provider email transport plus OpenBooks delivery validation |
| `@appkit/email-render` | faithful generalized extraction | BeaconHS `packages/email-render` copied file-for-file with all 48 upstream tests; only the package name and inline default brand are generalized |
| `@appkit/sms` | faithful generalized extraction | BeaconHS provider catalogue and transport policy |
| `@appkit/jobs` | generalized extraction | BeaconHS BullMQ connection and worker patterns |
| `@appkit/storage` | generalized extraction | BeaconHS S3-compatible storage core |

## Forms parity boundaries

The forms packages intentionally distinguish source parity from reusable
composition:

| surface | classification | exact boundary |
|---|---|---|
| `@appkit/forms-core` form schema/evaluator/validator/scoring helpers | compatible generalized extraction | BeaconHS source behavior plus the OpenBooks field/string compatibility layer; the complete 238-test BeaconHS suite runs in AppKit (one sanitizer expectation is tightened to remove its raw `text-teal-700` class) |
| `@appkit/forms-core/safety-automation` | faithful generalized extraction | BeaconHS automation and flow-subject contracts, verified by the complete 11-test upstream suite |
| `@appkit/forms-core/business-automation` and `business-flow-subjects` | faithful extraction | OpenBooks `packages/forms-core/src/automation.ts`, `flow-subjects.ts`, and its complete 22-test automation suite; only the local import path changes |
| `LogicBuilder` | faithful generalized extraction | BeaconHS template-designer `logic-builder.tsx`; condition behavior and array coercion are preserved, generated i18n wrappers become injectable labels, raw colors become semantic tokens, and an additive disabled state supports read-only hosts |
| `FormDesigner` / `FormRenderer` | appkit-original reusable composition | built over the extracted core because neither sibling contains a reusable package-level designer/renderer—the BeaconHS versions are product screens coupled to actions, flows, data sources, AI, routing, and specialized capture, while the OpenBooks `FormDesigner` edits ERP record layouts rather than this schema |

The safety and business automation vocabularies are separate public subpaths
because identically named actions have incompatible payloads and lifecycle
semantics. A fabricated union would not be drop-in compatible with either
product. Consumers choose the source-native profile and may build an app-level
adapter to a future shared orchestration layer.

The `user_dashboard_layouts` and `insight_cards` schema in `@appkit/db` follows
the two siblings' production personal/role layout and persisted insight-card
models. The playground's `members`/`roles`/`audit` semantic catalogue is demo-app
composition over real tables, not part of the reusable analytics package.

## Rule for future work

Every new primitive or package must name its production source in the commit and
in this file. If no source exists, label it **appkit-original** before building
it. “Compatible API” is not the same claim as “identical implementation,” and a
visual approximation is not an extraction.
