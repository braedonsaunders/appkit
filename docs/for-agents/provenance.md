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

The `create-appkit` scaffold and package build/release toolchain are
**appkit-original infrastructure**. They compose and distribute the audited
surfaces below; they are not presented as extracted product features.

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
| `@appkit/analytics` | partial generalized extraction — not drop-in compatible | AppKit has a safe semantic catalogue/compiler and visualization registry, but does not yet preserve BeaconHS BHQL, discovery, pivot, conditional-formatting, and custom-field APIs |
| `@appkit/dashboard` | partial generalized extraction — not drop-in compatible | AppKit has the dashboard grid, card library, and a smaller query studio; the full BeaconHS card studio/query vocabulary and source component contracts remain unported |
| `@appkit/reports` | partial extraction — not drop-in compatible | OpenBooks fiscal periods are source-backed; built-in report definitions, source query compiler/executor surfaces, document generation, exports, and schedule workers remain unported |
| `@appkit/ai` | targeted extraction — not package-compatible with BeaconHS | AppKit has the BeaconHS-style bounded agent loop and OpenBooks-style thread UI; provider/model policy and the source analysis, extraction, document-chat, vision, writing, and digest helpers remain app-owned or unported |
| `@appkit/db` | generalized extraction | OpenBooks DB executor/schema conventions plus BeaconHS Postgres RLS engine |
| `@appkit/tenant` | generalized extraction | BeaconHS request context/RBAC, decoupled from its domain schema |
| `@appkit/auth` | OpenBooks-specific extraction — not BeaconHS compatible | optional scrypt passwords and stateless HMAC sessions; BeaconHS's authentication/client/invite contract is not represented |
| `@appkit/events` | partial extraction — not drop-in compatible | structured audit and transactional outbox writes are present; recipient resolution, claiming, delivery workers, and source event APIs remain unported |
| `@appkit/notifications` | partial generalized extraction — not drop-in compatible | inbox/preferences, policy, React UI, and Drizzle storage are present; production dispatch workers, digest aggregation, and push-subscription lifecycle remain unported |
| `@appkit/api` | generalized extraction | BeaconHS `apps/web/src/lib/api` layer, made framework-neutral; OpenAPI description helpers are appkit-original extensions |
| `@appkit/endpoints` | generalized extraction | OpenBooks apps runtime / QuickJS endpoint sandbox |
| `@appkit/crypto` | generalized extraction | BeaconHS sealed-secret package and OpenBooks secret handling |
| `@appkit/emails` | generalized extraction | BeaconHS multi-provider email transport plus OpenBooks delivery validation |
| `@appkit/email-render` | faithful generalized extraction | BeaconHS `packages/email-render` copied file-for-file with all 48 upstream tests; only the package name and inline default brand are generalized |
| `@appkit/sms` | faithful generalized extraction | BeaconHS provider catalogue and transport policy |
| `@appkit/jobs` | partial extraction — not drop-in compatible | lazy BullMQ connections and queue/worker factories only; source payload schemas, queue catalogue, enqueue APIs, schedules, rate limits, health, and web-push jobs remain unported |
| `@appkit/storage` | partial extraction — not drop-in compatible | basic S3 object and presign operations only; source multipart, streaming/ranges, key validation, promotion/lifecycle, and readiness behavior remain unported |
| `@appkit/editor` | faithful generalized extraction | BeaconHS `packages/ui/src/rich-text-editor.tsx`; controlled value and host link normalization are additive generalizations, while TipTap behavior and toolbar grammar are preserved |
| `@appkit/forms-documents` | faithful package-boundary extraction | BeaconHS `packages/forms-core/src/form-companions.ts`, `pdf-template-html.ts`, and `doc-style.ts`, moved intact behind a document-specific package boundary so forms-core remains framework-neutral |
| `@appkit/workflows` | partial generalized extraction — not drop-in compatible | graph validation/runtime, durable gates, approval tokens, and a React Flow shell are present; source node registry, concrete inspector, save/enable flows, execution UI, and run history remain unported |
| `@appkit/sync` | substantial generalized extraction — compatibility adapters missing | runtime, CSV/transforms, fail-closed snapshots, hardened egress, SQL drivers, and persistence are present; source connector registry and built-in CSV/database/HTTP/Nango/NetSuite connectors remain unported |
| `@appkit/integrations` | substantial generalized extraction — compatibility adapters missing | dispatch, retry ledger, hardened destinations, and persistence are present; source trigger/destination catalogue and package API contracts are not preserved |
| `@appkit/customization` | incompatible partial generalization | AppKit currently uses a different catalogue/layout model; OpenBooks schemas, parse helpers, locked/versioned merge behavior, refresh/default logic, and import-compatible contracts remain unported |
| `@appkit/design-studio` | partial generalized extraction — not drop-in compatible | bounded documents, HTML, Fabric interaction, rails, and basic inspectors are present; BeaconHS DTOs, factories/presets, source exports, and the full property inspector remain unported |
| `@appkit/pdf` | faithful extraction | OpenBooks `packages/pdf` source lifted as the generic PDFKit/table/statement/template/Chromium engine, with AppKit package identity and strict-index fixes only |
| `@appkit/forms-pdf` | partial extraction — not drop-in compatible | portable HTML summaries and optional render adapters are present; BeaconHS PNG rendering, hardened resource/browser pipeline, report/record printers, source exports, and template profiles remain unported |

## Forms parity boundaries

The forms packages intentionally distinguish source parity from reusable
composition:

| surface | classification | exact boundary |
|---|---|---|
| `@appkit/forms-core` form schema/evaluator/validator/scoring helpers | compatible generalized extraction | BeaconHS source behavior plus the OpenBooks field/string compatibility layer; 235 core tests remain here and the 3 document-generation tests run in `@appkit/forms-documents` (one sanitizer expectation is tightened to remove its raw `text-teal-700` class) |
| `@appkit/forms-core/safety-automation` | faithful generalized extraction | BeaconHS automation and flow-subject contracts, verified by the complete 11-test upstream suite |
| `@appkit/forms-core/business-automation` and `business-flow-subjects` | faithful extraction | OpenBooks `packages/forms-core/src/automation.ts`, `flow-subjects.ts`, and its complete 22-test automation suite; only the local import path changes |
| `LogicBuilder` | faithful generalized extraction | BeaconHS template-designer `logic-builder.tsx`; condition behavior and array coercion are preserved, generated i18n wrappers become injectable labels, raw colors become semantic tokens, and an additive disabled state supports read-only hosts |
| `FormDesigner` shell | partial visual extraction — not drop-in compatible | the BeaconHS scrolling shell and drawer interaction are preserved, but most source authoring panels and field-specific configuration are absent |
| `FormDesigner` field editing / `FormRenderer` | appkit-original partial composition | common fields work, but this is not a replacement for BeaconHS: formulas, type-specific validation/configuration, layout canvas, record behavior/list/actions, assignments/permissions, and many specialized field runtimes remain unported |

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
3. Compile representative unmodified OpenBooks and BeaconHS consumer imports
   against AppKit compatibility entries.
4. For UI, compare the real source screen and AppKit screen at the same viewport
   and exercise selection, editing, scrolling, keyboard, empty, error, and dark
   states in a browser.
5. List every intentionally app-owned domain adapter. An omitted reusable
   implementation is not an adapter boundary.

Until those gates pass, use **partial extraction** and list the missing source
surface explicitly. A working demo of a subset does not establish parity.
