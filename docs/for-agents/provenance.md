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
`8d6ace86d3faf92381f2dbfe9ed0d14d937d7beb` and reference application B commit
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
- `PagedTable` is copied from reference A `web/components/paged-table.tsx` with
  localized copy moved to props and raw palette values tokenized. Its bounded
  search, clamped pages, aligned cells, row classes, and source caller signature
  are retained. `SearchSelectFilter` is the corresponding long-option URL
  filter from `filter-bar.tsx`, routed through AppKit's injectable list-nav
  provider. `SubtabNav` is the source `documents/DrawerTabs.tsx` detail/drawer
  grammar with optional counts and disabled states as additive generalizations.
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
| `@appkit/analytics` | substantial generalized extraction | The production catalogue/compiler and formula engine are preserved beside schema-discovered semantic entities, typed flat/pivot results, dense pivot construction, fifteen visualization definitions with renderability checks, library-neutral chart specs, tokenized conditional formatting, and fail-closed persisted-query validation. Tenant schema introspection and custom-field loading remain explicit application adapters because their data models are application-owned. |
| `@appkit/dashboard` | compatible production superset | The responsive production grid, searchable library, quick-action preservation/validation, user-role-default layout resolution, wildcard/tier access policy, source card-authoring flow, fifteen result renderers, and typed pivot/heatmap renderer are present. `DashboardStudio` adds a controlled metadata, autosave, publish, pin, and delete shell around those source behaviors. No non-existent source panels are claimed. |
| `@appkit/reports` | substantial faithful generalized extraction — reference-application cutover pending | The paper/table exports retain source-compatible names and props. The production statement viewer behavior is present in full: grouped headings, hierarchy, accounting currency, scale, variance percentages, totals, collapse/expand, account navigation, typed drill targets, and the paged supporting-row drawer. The compact toolbar restores every source control through application-owned state. Stored queries use the shared production `ReportCustomQuery`/`op`/`fn` contract, and packed-consumer tests compile both source catalogue families without translation. The one-third/two-thirds studio includes grouped searchable catalogues, catalogue-derived templates, ordered/renamable and searchable columns, recursive filters, three-level synchronized sorting, page setup, debounced live preview/autosave, manual run/save, paper preview, and export. The scheduled-report extraction preserves the production `definitionId`/`active` contract, full cadence and nth-weekday grammar, timezone and date bounds, member and external recipients, bounded filters, email copy, shared create/update parser, searchable register, pause/resume, run-now, execution history, failure detail, and artifact transport seam. The packed consumer renders those source-shaped contracts directly. An adjacent production application still needs to replace its imports with this package before the package can claim proven reference-application cutover. Product catalogues, SQL loaders, persistence, recipient lookup, native record drawers, and export/delivery routes remain injected because they are application-owned. |
| `@appkit/ai` | substantial generalized extraction | The bounded agent loop and thread UI sit beside the production analysis, extraction, document-chat, vision, writing, digest, model-policy, prompt, and provider-client helpers. Credentials and application tool registries are injected; no provider secret or product prompt catalogue is bundled. |
| `@appkit/db` | generalized extraction | Reference A DB executor/schema conventions plus the reference B Postgres RLS engine |
| `@appkit/tenant` | faithful generalized extraction — adapter-ready; reference cutover pending | Reference B's request context, timezone and locale policy, active-role resolution, impersonation guard, template/payload access helpers, scope ordering, wildcard/read-tier RBAC, concrete deny behavior, and exact `resolveMembershipAccess(tx, membershipId, activeRoleId?)` call shape are preserved. `createMembershipAccessResolver` binds an application catalogue once and fails closed if a wildcard carve-out is underconfigured. `createTenantContextFactory` retains the source context-constructor call shape over an application-owned RLS runtime, while `RequestContext<TExtension>` carries product-owned identity or terminology without putting it in AppKit. Tenant permission evaluation is dependency-correct and standalone; optional IAM now consumes/re-exports it instead of the foundation depending on IAM. Package tests cover source behavior and the packed consumer compiles the unchanged resolver call plus a typed application extension. A reference application import cutover remains required before a completed drop-in claim. |
| `@appkit/iam` | faithful generalized extraction — packed reference-shaped consumer proven; application cutover pending | Reference B `admin/roles` list/detail/actions, permission matrix, scoped role-member manager, bulk add/replace/remove, `admin/users` lifecycle/scope/override model, invitation resend generation, and IAM schema are combined with reference A `RoleEditor`, paged role/user registers, source filter counts, role list/API protections, permission deny semantics, destructive confirmations, user actions, and the complete audit list/detail drawer. AppKit retains service-backed filtering/sorting/paging and stable facets, responsive member cards, key/email columns, actor-aware built-in/current-user/super-admin protections, runtime permission/scope validation, atomic duplicate/delete/bulk writes, invitation persistence and rotation, scoped assignment upsert, per-user grant/deny overrides, record activity, before/after audit, application lifecycle hooks, typed UI/action extensions, and authenticated HTTP and memory adapters. The Drizzle adapter compiles against both production driver families (`node-postgres` and `postgres-js`), and the packed consumer exercises the source-shaped bulk/resend/record-audit calls and React extension seams. Browser verification covers role filtering/detail/protected permissions/bulk UI, member facets/invitation resend, destructive confirmation, and audit filtering/detail with a clean console. Product permission catalogues, hierarchy choices, invitation credential delivery, route authorization, and product-owned identity panels remain typed application inputs. An adjacent production application still needs to replace its imports before a completed application-cutover claim. |
| `@appkit/auth` | substantial faithful generalized extraction — reference-consumer cutover pending | Reference B's Better Auth server/client runtime, password reset lifecycle, hashed magic links, membership-targeted invitation grants, durable core schema, lazy singleton, and React sign-in/reset forms are preserved. Reference A's active-user field and UUID/plural-table schema are retained through Better Auth's explicit model/field mappings. Email transport, brand rendering, tenant cookie selection, post-acceptance domain effects, and route authorization are injected. Direct reference-application compile cutovers remain required before a drop-in claim. |
| `@appkit/events` | substantial generalized extraction | Structured audit, transactional outbox writes, recipient resolution, lease-based claiming, durable retry transitions, effects ledger, HMAC internal authentication, and a bounded relay are present. Concrete transport delivery is an injected handler so the package remains vendor-neutral. |
| `@appkit/notifications` | faithful generalized inbox UI plus substantial notification runtime extraction | Reference B `apps/web/src/app/(app)/notifications/_outlook-inbox.tsx`, `actions.ts`, and `loading.tsx` supply the three-pane folder rail, message list, reading pane, smart/category folders, search, to-dos, optimistic mutations, snooze, cursor paging, responsive drawers, and loading shell. AppKit preserves that interaction surface while injecting routes, category/to-do visuals, and copy; it adds rollback reloads and a visible retry state. `/drizzle` retains the source tenant/user-bound search, cursor, count, read/unread, delete, snooze, and mark-all query behavior behind an RLS-scoped database handle. Category/quiet-hour policy, preferences, storage, digest aggregation, push lifecycle, delivery keys, and dispatch policy remain the broader generalized runtime. Provider transports and domain to-do queries are application adapters. |
| `@appkit/api` | generalized extraction | Reference B `apps/web/src/lib/api` layer, made framework-neutral; OpenAPI description helpers are appkit-original extensions |
| `@appkit/sandbox` | faithful generalized execution-kernel extraction | Reference A `engine/src/apps-runtime.ts` and `engine/src/scripting.ts`; the byte-level duplicated QuickJS memory/stack/deadline/async-host mechanics are unified behind generic host capabilities and structured faults. |
| `@appkit/endpoints` | faithful generalized extraction | Reference A `engine/src/apps-runtime.ts`; the source-shaped `runAppEndpoint` export is also available from `@appkit/apps/runtime`, while application-specific writes are injected host functions. |
| `@appkit/scripts` | substantial faithful generalized extraction — consuming-app route cutover pending | Reference A `engine/src/scripting.ts`, `web/lib/client-scripts.ts`, script worker/queue contracts, `schema/src/extension.ts`, and `web/app/(app)/admin/scripts/ScriptDrawer.tsx`. The source CodeMirror JavaScript editor, line numbers/folding/completion, trigger-aware starter source, general/code/runs/log drawer flow, run selection, and log viewer are preserved behind controlled callbacks. Event ordering, aborts, allowed mutations, read-only data seams, endpoint/scheduled/bulk/client runtimes, cron, audit history, Drizzle, React authoring, and queue-neutral jobs are present. `/bound` has a tested positional cutover contract that preserves an application's authored global, native input context, host values, and adapters without hardcoding them. Route authorization and application query/write adapters remain host-owned. |
| `@appkit/apps` | substantial faithful generalized extraction — consuming-app route cutover pending | Reference A `engine/src/apps-runtime.ts`, `schema/src/apps.ts`, `web/lib/apps/{manifest,zip,objects,bridge,store}.ts`, installed App frame, marketplace/library, API lifecycle, and `web/app/(app)/admin/apps/AppDrawer.tsx`. The source `xl` editor drawer and inset, rounded file workbench are preserved with the same 15rem collapsible tree, file-type icons, CodeMirror JavaScript/HTML/CSS/JSON modes, line numbers/folding/completion, binary inspector, create/upload/delete/save controls, overview, and run inspection; AppKit additionally retains its governed live preview. Manifest/ZIP validation, immutable versions, object provisioning transaction seam, storage, capability intersection, QuickJS endpoints, opaque-origin iframe/CSP/SDK, publishing, memory/Drizzle persistence, and React authoring are present. `/service` and `createAppEndpointRuntime` provide tested source-shaped lifecycle and endpoint cutover seams with application-supplied global, scope mapping, permissions, records, and governed writes. Authentication, routes, and domain object schemas remain injected. |
| `@appkit/crypto` | generalized application-agnostic runtime | The AppKit root uses `APPKIT_SECRET` and `appkit.secret.v1`; `createSealer(secret, { hkdfInfo })` lets an application own migration compatibility without shipping an application-named entry. |
| `@appkit/emails` | substantial generalized extraction | The root injects secret unsealing for modular apps. Provider behavior, local loopback SMTP, delivery policy, and hardened validation are retained without application-specific entry points. |
| `@appkit/email-render` | faithful generalized extraction | Reference B `packages/email-render` copied file-for-file with all 48 upstream tests; only the package name and inline default brand are generalized |
| `@appkit/sms` | substantial generalized extraction | The root injects secret unsealing for modular apps. The five-provider catalogue, policy, validation, bounded responses, and credential redaction are retained without application-specific entry points. |
| `@appkit/jobs` | substantial generalized extraction — product queue profiles remain | Lazy BullMQ connections, bounded readiness, source payload guards, atomic Redis rate limits, and hardened Web Push delivery are present. Reference-application queue payload catalogues, schedules, and enqueue APIs still require app-owned adapters. |
| `@appkit/storage` | faithful attachment UI extraction plus reference generalized runtime | Reference A `web/components/attachment-panel.tsx` supplies the complete two-pane upload, URL-backed search/type filter/paging, selected-file list, image/PDF preview, download, expand/restore, and removal behavior. Raw palettes are tokenized; translations, Next routing, fetch routes, authorization, and tenancy are generalized behind labels, AppKit list navigation, and an injected `AttachmentAdapter`. The source `targetTable`/`targetId` caller shape and HTTP response contract are retained. The root also provides tenant-owned keys, multipart upload, streams/ranges, rich metadata, verified promotion, lifecycle tagging, existence checks, presigning, private-bucket readiness, and strict portable environment configuration. |
| `@appkit/editor` | faithful generalized extraction | Reference B `packages/ui/src/rich-text-editor.tsx`; controlled value and host link normalization are additive generalizations, while TipTap behavior and toolbar grammar are preserved |
| `@appkit/forms-documents` | faithful package-boundary extraction | Reference B `packages/forms-core/src/form-companions.ts`, `pdf-template-html.ts`, and `doc-style.ts`, moved intact behind a document-specific package boundary so forms-core remains framework-neutral |
| `@appkit/forms` | substantial generalized extraction — consumer cutover compile gate pending | The production scrolling designer, field library/canvas, full field and section inspectors, formula and logic builders, pages, guided workflow steps, record behavior/list/actions, data binding, table/matrix/risk/sketch/signature runtimes, and interactive renderer are present. Application-owned pickers, upload transports, address search, and data queries are explicit field adapters. Representative unmodified consumer imports must still compile before root drop-in compatibility is claimed. |
| `@appkit/i18n` | generalized production pattern | Tenant locale policy and localized-value resolution from both products, with application translation catalogues injected rather than bundled. |
| `@appkit/workflows` | substantial generalized extraction — subject adapters remain application-owned | Graph validation/runtime, durable gates, approval tokens, and the production multi-flow authoring composition are present: library rail, enable/rename/delete, node toolbar, compatible templates, drawer inspector, lint, save boundary, and canvas branches. Reference A's record approval actions, pending-with chip, rejection prompt, synchronized state hook, and complete approval history event list are copied into tokenized React components; its record-state query and gate-decision contracts are retained by the HTTP adapter. The provider replaces framework router/i18n coupling, while a quorum-aware memory adapter proves the same UI database-free. Subject profiles and persistence are injected; durable definition CRUD and domain execution adapters remain host-owned. |
| `@appkit/sync` | substantial generalized extraction | Runtime, CSV/transforms, fail-closed snapshots, hardened egress, SQL drivers, persistence, connector registry, and the production CSV, database, HTTP, managed-connector, and ERP connector families are present. Entity mapping and credentials are host-owned adapters. |
| `@appkit/integrations` | substantial generalized extraction | Dispatch, retry ledger, hardened destinations, persistence, the production trigger catalogue, and destination registry are present. Applications inject their event vocabulary, credentials, and domain record loaders. |
| `@appkit/customization` | faithful generalized engine, persistence, authoring, and consuming-list extraction — reference route/query cutover pending | Reference A's complete types, registry behavior, Zod schemas, parse/lint helpers, locked/versioned merge behavior, default refresh logic, and upstream tests were copied before generalization. `RecordListView`, `EntityListView`, `ViewsMenu`, `FilterChips`, sortable headers, paging, effective-view resolution, live-column merge, and the four form/list preference tables are represented by generalized package-owned contracts, React composition, memory repository, and tenant-scoped Drizzle repository. The form, list-view, and custom-field editors retain source groups, field placement, line columns, actions, filters, sorting, scope, field options/behavior, and save/delete flows. `createCustomizationEngine` moves the source catalogue to the consuming application while preserving record-type-key default/parse/lint/refresh calls; both persistence adapters validate through the same injected registry. The packed Node/React consumer renders a saved-view record table with subtabs and exercises a validated write. Currency, status meaning, routing, permission decisions, record metadata, roles, and domain queries remain injected application concerns. The full reference route and tenant query builders have not yet been cut over. |
| `@appkit/design-studio` | faithful generalized production extraction — consumer cutover compile gate pending | The Fabric editor, selection/move/resize/rotate interaction, layers and full property inspector, bounded DTO schema, factories/defaults, copy catalogue, controlled studio composition, HTML rendering, print rendering, and source behavior tests are present. Persistence, asset upload, and route policy are injected. |
| `@appkit/pdf` | faithful generalized implementation | The PDFKit/table/statement/template/Chromium engine is retained behind dependency-light root, `/template`, and `/html` entries without an application-named compatibility surface. |
| `@appkit/forms-pdf` | faithful generalized production extraction | Portable summaries sit beside the production PNG rendering, bounded resource policy, browser lifecycle, report/record printers, template profiles, and source behavior tests. Chromium and storage are optional injected/runtime subpaths rather than root dependencies. |

## Forms parity boundaries

The forms packages intentionally distinguish source parity from reusable
composition:

| surface | classification | exact boundary |
|---|---|---|
| `@appkit/forms-core` form schema/evaluator/validator/scoring helpers | substantial generalized extraction — root type compatibility differs | Reference B behavior plus the reference A field/string layer and 235 core tests remain. DOM-free text parsing and attachment URL policy stay in the dependency-light root; rich sanitization/normalization use explicit subpaths, and document-generation helpers live in `@appkit/forms-documents`. The generalized root widens localized strings, makes workflow metadata optional, and adds finance fields, so unmodified reference consumers must not be claimed as compile-compatible. |
| `@appkit/forms-core/safety-automation` | faithful generalized extraction | Reference B automation and flow-subject contracts, verified by the complete 11-test upstream suite |
| `@appkit/forms-core/business-automation` and `business-flow-subjects` | faithful extraction | Reference A `packages/forms-core/src/automation.ts`, `flow-subjects.ts`, and its complete 22-test automation suite; only the local import path changes |
| `LogicBuilder` | faithful generalized extraction | Reference B template-designer `logic-builder.tsx`; condition behavior and array coercion are preserved, generated i18n wrappers become injectable labels, raw colors become semantic tokens, and an additive disabled state supports read-only hosts |
| `FormDesigner` shell | faithful generalized production extraction | The independently scrolling source shell, field library, sortable canvas, drawer interaction, and one-third/two-thirds workspace are preserved. Controlled schema and adapter props replace route and persistence coupling. |
| `FormDesigner` field editing / `FormRenderer` | substantial generalized extraction — application services injected | Formula/default/logic/validation editors, field-specific table/matrix/slider/data-binding configuration, section grid/canvas/repeating behavior, pages, workflow assignments, record behavior/list/actions, and native table/matrix/risk/signature/sketch runtime controls are present. Entity pickers, media upload, camera/scanner, address search, tenant data queries, and durable persistence require typed adapters because those services belong to the consuming application. |

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
