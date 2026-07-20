# Provenance audit

appkit has three kinds of code. Do not blur them:

- **Faithful extraction** — ported from a named production sibling source;
  app coupling is replaced by props/providers, but behavior and visual grammar
  stay aligned.
- **Generalized production pattern** — a real sibling flow expressed as a
  reusable primitive or framework-neutral package.
- **appkit-original** — no matching production implementation existed. These
  components must not be presented as extracted or sibling-identical.

This inventory was audited against reference application A commit
`680b153f84550025a55149bc6deaaaf83b16f41f` and reference application B commit
`2bc3d36ae435b6bb7072a9c990b835bbce47fd0e` on 2026-07-20.

The `create-appkit` scaffold and package build/release toolchain are
**appkit-original infrastructure**. They compose and distribute the audited
surfaces below; they are not presented as extracted product features.

## Application shell and navigation

| appkit surface | classification | production source |
|---|---|---|
| `AppShell` | faithful generalized extraction | reference A `web/components/app-shell.tsx`; reference B `apps/web/src/components/app-shell.tsx` |
| `TopNav` | faithful generalized extraction | reference A `web/components/top-nav.tsx` and `web/lib/top-nav-overflow.ts` |
| `AppSidebar` | faithful generalized extraction | both apps' `components/app-sidebar.tsx` |
| `SidebarNav` | compatible superset | reference A workspace/subgroup implementation plus the reference B grouped-list contract |
| `MobileTabBar` / mobile selection | faithful generalized extraction | both apps' `components/mobile-tab-bar.tsx`; reference A `web/lib/mobile-nav.ts` |
| mobile drawer inside `AppShell` | generalized production pattern | both apps' `components/mobile-nav-toggle.tsx`, implemented with appkit's extracted `Drawer` |
| `AccountMenu` | compatible generalized extraction | reference A `web/components/account-menu.tsx` launcher visual grammar; choices/persistence are controlled props so any app can supply its policy |
| `GlobalSearch` | generalized production pattern | both apps' `components/global-search.tsx`; domain querying and route selection are injected |
| `NotificationsBell` | compatible superset | reference A inbox list plus the reference B controlled unread/menu pattern; items and mutations are injected |
| theme/navigation/link providers | faithful generalized extraction | both apps' `theme-provider.tsx`, `theme-toggle.tsx`, `app-link-provider.tsx`, and `navigation-provider.tsx`; sibling UI `link-context.tsx` was byte-identical |

The flat-link top navigation introduced in appkit commit `21b98ad` was invented
and was not sibling-compatible. It was removed rather than retained as a second
navigation system.

## UI package

Faithful or generalized extractions:

- Base primitives: `Alert`, `Badge`, `Button`, `Card`, `ContextMenu`, `Drawer`,
  `DocumentTitle`, `DetailHeader`, `EmptyState`, `Input`, `Label`, `PageHeader`, `Popover`, `SearchSelect`,
  `Separator`, `Skeleton`, `Table`, `Textarea`, and utilities come from the
  siblings' `packages/ui/src` implementations and are tokenized here.
- `PageContainer`, list/detail/wizard layouts come from both apps'
  `components/page-layout.tsx`.
- `LineGrid` comes from reference A `web/components/line-grid.tsx`.
- `AdminHub`, `SettingsShell`, `SettingsNav`, `SettingsSection`, and
  `SettingsRow` come from the reference A admin hub and setup shell. `AdminHub`'s
  detailed capability-card layout is a generalized extension of that same card
  grammar for package inventories; the compact settings layout remains the
  faithful default.
- `RecordList` and URL-driven search/filter/sort/pagination are generalized from
  reference A production list pages and navigation helpers.
- `Select` is the reference B native-`<select>`-API implementation from
  `packages/ui/src/select.tsx` and `select-options.ts`, copied
  at source parity with its upstream tests. It preserves `<option>`/
  `<optgroup>`, form submission, required validation, refs, and genuine change
  events while presenting `SearchSelect`. Options-array consumers use
  `SearchSelect` explicitly; AppKit no longer substitutes a different contract
  under the `Select` name.
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

These originals may be useful, but they are not evidence of reference-app
parity until a consuming app adopts them or they are explicitly reconciled with
a new sibling source.

## Platform packages

| package | classification | production lineage |
|---|---|---|
| `@appkit/tokens` | appkit-original abstraction | semantic-token layer built around the siblings' real light/dark palette and UI values |
| `@appkit/ui` | audited mixed extraction | Every exported UI surface is classified in the UI section above; extracted primitives retain source behavior while AppKit-original primitives are named explicitly rather than presented as source parity. |
| `@appkit/analytics` | substantial generalized extraction — advanced query-language adapters remain | The safe catalogue/compiler and formula engine now sit beside schema-discovered semantic entities, typed flat/pivot results, dense pivot construction, fifteen visualization definitions with renderability checks, library-neutral chart specs, and tokenized conditional formatting. The multi-stage source query AST, schema introspection adapters, and custom-field loaders remain application adapters. |
| `@appkit/dashboard` | substantial generalized extraction — advanced card-query adapters remain | The responsive production grid, searchable library, quick-action preservation/validation, user-role-default layout resolution, wildcard/tier access policy, flat card studio, fifteen result renderers, and typed pivot/heatmap renderer are present. The multi-stage source studio's cross-source metric, matrix-spine, and AI-drafting panels remain unported. |
| `@appkit/reports` | substantial generalized extraction — built-in catalogues and delivery worker remain application-owned | Fiscal periods, nested filters, row/summary SQL compilation, fiscal bins, grouped result shaping, definition registry, schedule policy, document contracts, and the interactive one-third/two-thirds report studio are present. Domain built-in definitions, tenant schema discovery, export transport, and the claiming/delivery worker stay outside the framework-neutral package. |
| `@appkit/ai` | targeted extraction — not package-compatible with either reference | AppKit has a bounded agent loop and thread UI; provider/model policy and the source analysis, extraction, document-chat, vision, writing, and digest helpers remain app-owned or unported |
| `@appkit/db` | generalized extraction | Reference A DB executor/schema conventions plus the reference B Postgres RLS engine |
| `@appkit/tenant` | substantial generalized extraction — not root drop-in compatible | Reusable reference B scope ordering, impersonation guard, template/payload access helpers, wildcard RBAC, and request context are present. Regulatory and product-owned context fields remain app-owned, and the generalized root is intentionally narrower than its source type. |
| `@appkit/auth` | reference A extraction — not reference B compatible | optional scrypt passwords and stateless HMAC sessions; the other reference application's authentication/client/invite contract is not represented |
| `@appkit/events` | partial extraction — not drop-in compatible | structured audit and transactional outbox writes are present; recipient resolution, claiming, delivery workers, and source event APIs remain unported |
| `@appkit/notifications` | partial generalized extraction — not drop-in compatible | inbox/preferences, policy, React UI, and Drizzle storage are present; production dispatch workers, digest aggregation, and push-subscription lifecycle remain unported |
| `@appkit/api` | generalized extraction | Reference B `apps/web/src/lib/api` layer, made framework-neutral; OpenAPI description helpers are appkit-original extensions |
| `@appkit/endpoints` | generalized extraction | Reference A apps runtime / QuickJS endpoint sandbox |
| `@appkit/crypto` | generalized application-agnostic runtime | The AppKit root uses `APPKIT_SECRET` and `appkit.secret.v1`; `createSealer(secret, { hkdfInfo })` lets an application own migration compatibility without shipping an application-named entry. |
| `@appkit/emails` | substantial generalized extraction | The root injects secret unsealing for modular apps. Provider behavior, local loopback SMTP, delivery policy, and hardened validation are retained without application-specific entry points. |
| `@appkit/email-render` | faithful generalized extraction | Reference B `packages/email-render` copied file-for-file with all 48 upstream tests; only the package name and inline default brand are generalized |
| `@appkit/sms` | substantial generalized extraction | The root injects secret unsealing for modular apps. The five-provider catalogue, policy, validation, bounded responses, and credential redaction are retained without application-specific entry points. |
| `@appkit/jobs` | substantial generalized extraction — product queue profiles remain | Lazy BullMQ connections, bounded readiness, source payload guards, atomic Redis rate limits, and hardened Web Push delivery are present. Reference-application queue payload catalogues, schedules, and enqueue APIs still require app-owned adapters. |
| `@appkit/storage` | reference generalized runtime | Tenant-owned keys, multipart upload, streams/ranges, rich metadata, verified promotion, lifecycle tagging, existence checks, presigning, and private-bucket readiness are present. `@appkit/storage/env` provides a strict portable environment contract. |
| `@appkit/editor` | faithful generalized extraction | Reference B `packages/ui/src/rich-text-editor.tsx`; controlled value and host link normalization are additive generalizations, while TipTap behavior and toolbar grammar are preserved |
| `@appkit/forms-documents` | faithful package-boundary extraction | Reference B `packages/forms-core/src/form-companions.ts`, `pdf-template-html.ts`, and `doc-style.ts`, moved intact behind a document-specific package boundary so forms-core remains framework-neutral |
| `@appkit/forms` | partial extraction under active parity work | The interactive renderer, logic builder, and scrolling designer are functional; the exact missing reference authoring and specialized-field surfaces are listed below and must be ported before cutover. |
| `@appkit/i18n` | generalized production pattern | Tenant locale policy and localized-value resolution from both products, with application translation catalogues injected rather than bundled. |
| `@appkit/workflows` | substantial generalized extraction — subject adapters remain application-owned | Graph validation/runtime, durable gates, approval tokens, and the production multi-flow authoring composition are present: library rail, enable/rename/delete, node toolbar, compatible templates, drawer inspector, lint, save boundary, and canvas branches. Subject profiles and persistence are injected; durable definition CRUD and domain execution adapters remain host-owned. |
| `@appkit/sync` | substantial generalized extraction — compatibility adapters missing | runtime, CSV/transforms, fail-closed snapshots, hardened egress, SQL drivers, and persistence are present; source connector registry and built-in CSV/database/HTTP/Nango/NetSuite connectors remain unported |
| `@appkit/integrations` | substantial generalized extraction — compatibility adapters missing | dispatch, retry ledger, hardened destinations, and persistence are present; source trigger/destination catalogue and package API contracts are not preserved |
| `@appkit/customization` | incompatible partial generalization | AppKit currently uses a different catalogue/layout model; reference A schemas, parse helpers, locked/versioned merge behavior, refresh/default logic, and import-compatible contracts remain unported |
| `@appkit/design-studio` | partial generalized extraction — not drop-in compatible | bounded documents, HTML, Fabric interaction, rails, and basic inspectors are present; reference B DTOs, factories/presets, source exports, and the full property inspector remain unported |
| `@appkit/pdf` | faithful generalized implementation | The PDFKit/table/statement/template/Chromium engine is retained behind dependency-light root, `/template`, and `/html` entries without an application-named compatibility surface. |
| `@appkit/forms-pdf` | partial extraction — not drop-in compatible | portable HTML summaries and optional render adapters are present; reference B PNG rendering, hardened resource/browser pipeline, report/record printers, source exports, and template profiles remain unported |

## Forms parity boundaries

The forms packages intentionally distinguish source parity from reusable
composition:

| surface | classification | exact boundary |
|---|---|---|
| `@appkit/forms-core` form schema/evaluator/validator/scoring helpers | substantial generalized extraction — root type compatibility differs | Reference B behavior plus the reference A field/string layer and 235 core tests remain. DOM-free text parsing and attachment URL policy stay in the dependency-light root; rich sanitization/normalization use explicit subpaths, and document-generation helpers live in `@appkit/forms-documents`. The generalized root widens localized strings, makes workflow metadata optional, and adds finance fields, so unmodified reference consumers must not be claimed as compile-compatible. |
| `@appkit/forms-core/safety-automation` | faithful generalized extraction | Reference B automation and flow-subject contracts, verified by the complete 11-test upstream suite |
| `@appkit/forms-core/business-automation` and `business-flow-subjects` | faithful extraction | Reference A `packages/forms-core/src/automation.ts`, `flow-subjects.ts`, and its complete 22-test automation suite; only the local import path changes |
| `LogicBuilder` | faithful generalized extraction | Reference B template-designer `logic-builder.tsx`; condition behavior and array coercion are preserved, generated i18n wrappers become injectable labels, raw colors become semantic tokens, and an additive disabled state supports read-only hosts |
| `FormDesigner` shell | partial visual extraction — not drop-in compatible | the reference B scrolling shell and drawer interaction are preserved, but most source authoring panels and field-specific configuration are absent |
| `FormDesigner` field editing / `FormRenderer` | appkit-original partial composition | common fields work, but this is not yet a replacement for the full production runtime: formulas, type-specific validation/configuration, layout canvas, record behavior/list/actions, assignments/permissions, and many specialized field runtimes remain unported |

The safety and business automation vocabularies are separate public subpaths
because identically named actions have incompatible payloads and lifecycle
semantics. A fabricated union would not be drop-in compatible with either
product. Consumers choose the source-native profile and may build an app-level
adapter to a future shared orchestration layer.

The `user_dashboard_layouts` and `insight_cards` schema in
`@appkit/dashboard/schema` follows
the two siblings' production personal/role layout and persisted insight-card
models. The playground's `members`/`roles`/`audit` semantic catalogue is demo-app
composition over real tables, not part of the reusable analytics package.

## Rule for future work

Every new primitive or package must name its production source in the commit and
in this file. If no source exists, label it **appkit-original** before building
it. “Compatible API” is not the same claim as “identical implementation,” and a
visual approximation is not an extraction.

A package cannot be called **faithful**, **complete**, or **drop-in compatible**
until all of these gates are recorded and green:

1. Inventory every public source export, subpath, schema, migration, preset, and
   runtime entry from both sibling implementations.
2. Port the source tests first, then add behavior tests for every generalized
   adapter boundary.
3. Compile representative unmodified reference-application consumer imports
   against AppKit compatibility entries.
4. For UI, compare the real source screen and AppKit screen at the same viewport
   and exercise selection, editing, scrolling, keyboard, empty, error, and dark
   states in a browser.
5. List every intentionally app-owned domain adapter. An omitted reusable
   implementation is not an adapter boundary.

Until those gates pass, use **partial extraction** and list the missing source
surface explicitly. A working demo of a subset does not establish parity.
