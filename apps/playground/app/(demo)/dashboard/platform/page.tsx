import {
  BarChart3,
  BellRing,
  Bot,
  Braces,
  ClipboardList,
  Cloud,
  Cable,
  Database,
  FileOutput,
  FileText,
  Gauge,
  KeyRound,
  Languages,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquare,
  Palette,
  Paintbrush,
  Puzzle,
  Rocket,
  ScrollText,
  ServerCog,
  ShieldCheck,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { EMAIL_PROVIDER_SPECS } from '@appkit/emails/providers'
import { SMS_PROVIDER_SPECS } from '@appkit/sms/providers'
import { AdminHub, Badge, Button, type AdminHubGroup } from '@appkit/ui'

export const metadata = { title: 'Platform — appkit' }

const GROUPS: AdminHubGroup[] = [
  {
    label: 'What you gain',
    description: 'Start with the whole product foundation, or take one proven layer at a time.',
    accent: 'teal',
    layout: 'detailed',
    cards: [
      {
        title: 'create-appkit',
        description: 'Go from an empty directory to a branded, navigable application in one command.',
        icon: <Rocket />,
        badge: <Badge variant="success">Fast path</Badge>,
        features: [
          'Next.js 16, React 19, TypeScript, Tailwind v4, tokens, themes, and the application shell arrive wired together',
          'Choose topbar or sidebar navigation without rebuilding the shell',
          'Authentication, Postgres, queues, AI, and provider integrations stay optional',
          'Workspace dependencies become normal npm ranges in generated applications',
        ],
        href: '/components',
        linkLabel: 'See the foundation in use',
      },
      {
        title: 'Modular by construction',
        description: 'Import the capability you need without accepting an all-or-nothing framework.',
        icon: <Puzzle />,
        features: [
          'Dependency-light package roots keep React, Drizzle, browser automation, and provider SDKs out until requested',
          'Explicit subpath exports make optional runtime and UI layers visible in the import itself',
          'Application adapters preserve your domain model, routing, storage, credentials, and deployment choices',
          'Packages share contracts and tokens, so independently adopted pieces still compose cleanly',
        ],
        href: '/components',
        linkLabel: 'Inspect an optional layer',
      },
      {
        title: 'Production guardrails',
        description: 'Inherit the constraints teams usually discover after launch.',
        icon: <ShieldCheck />,
        features: [
          'Tenant isolation, wildcard RBAC, audit history, idempotent writes, sealed secrets, and replay-safe background work',
          'Bounded graphs, queries, templates, uploads, user code, agent loops, retries, and provider responses',
          'Semantic tokens, keyboard interaction, focus management, dark mode, and reduced-motion behavior',
          'Fail-closed validation at persistence, execution, and external-delivery boundaries',
        ],
        href: '/admin/audit',
        linkLabel: 'Inspect the audit trail',
      },
      {
        title: 'A reference you can operate',
        description: 'Every linked surface is a working implementation, not a component screenshot.',
        icon: <Gauge />,
        features: [
          'Build dashboard cards, forms, reports, workflows, record layouts, and print designs directly in the demo',
          'Exercise API docs, notifications, settings, audit history, sync, and integration configuration',
          'The public demo runs without authentication and can use database-free adapters where persistence is unnecessary',
          'Each screen shows the package composition an application can import and own',
        ],
        href: '/workflows',
        linkLabel: 'Build a workflow',
      },
    ],
  },
  {
    label: 'Build the application',
    description: 'Interface, data, permissions, analytics, forms, and localization.',
    accent: 'teal',
    layout: 'detailed',
    cards: [
      {
        title: '@appkit/tokens',
        description: 'Rebrand an entire application without hunting through component code.',
        icon: <Palette />,
        features: [
          'Semantic color, typography, radius, elevation, and motion values',
          'Tailwind v4 utilities generated from the same CSS variables',
          'Light and dark themes, reduced motion, and one-file brand overrides',
        ],
        href: '/components',
        linkLabel: 'See the token system',
      },
      {
        title: '@appkit/ui',
        description: 'Build consistent product screens with shared navigation, data-entry, feedback, and workspace components.',
        icon: <Layers3 />,
        features: [
          'Inputs, feedback, dialogs, drawers, popovers, menus, tables, lists, and line editors',
          'Direct file upload protocol, signature capture, and translated UI copy injection',
          'Topbar/sidebar app shell, account launcher, search, notifications, theme, settings hub, and settings shell',
          'Page layouts, route transitions, metrics, sparklines, and accessible interaction primitives',
          'Tokenized light/dark styling, keyboard behavior, focus management, and reduced-motion support',
        ],
        href: '/components',
        linkLabel: 'View components',
      },
      {
        title: '@appkit/analytics',
        description: 'Create governed reporting cards from approved data sources, measures, and dimensions.',
        icon: <BarChart3 />,
        features: [
          'Application-defined catalogues plus schema-discovered semantic entities',
          'Parsed formula ASTs with a controlled function and field vocabulary',
          'Tenant-bound, parameterized Postgres compilation and result contracts',
          'Typed flat and pivot results, fifteen visualizations, chart specs, and conditional formatting',
        ],
        href: '/insights',
        linkLabel: 'Build an insight card',
      },
      {
        title: '@appkit/dashboard',
        description: 'Give people configurable dashboards and a governed way to build reusable insight cards.',
        icon: <LayoutDashboard />,
        features: [
          'Responsive 12-column layouts with drag, resize, add, remove, save, and reset controls',
          'Flat, pivot, and heatmap result renderers plus the one-third/two-thirds card studio',
          'Controlled dashboard metadata, autosave, publish, pin, delete, and role-default lifecycle',
          'Framework-neutral layout and card contracts available without installing React Grid Layout',
          'Optional React workspace and Drizzle persistence entry points for applications that need them',
        ],
        href: '/dashboard',
        linkLabel: 'Use the dashboard',
      },
      {
        title: '@appkit/reports',
        description: 'Define governed report queries, grouped results, page layouts, and schedules.',
        icon: <FileOutput />,
        features: [
          'Nested filters, relationship refinement, custom fields, and tenant-bound row or summary SQL',
          'Grouped results, fiscal breakouts, saved definitions, document layouts, and export contracts',
          'DST-safe daily, weekly, monthly, quarterly, yearly, and nth-weekday schedules',
          'Lease-based, idempotent run claiming plus injected execution, persistence, and delivery adapters',
        ],
        href: '/reports',
        linkLabel: 'Open reports',
      },
      {
        title: '@appkit/forms-core',
        description: 'Define forms, validation, scoring, and workflow automation through versioned schemas.',
        icon: <Braces />,
        features: [
          'Plain and localized content supported by one versioned form contract',
          'Field metadata, conditional logic, formulas, defaults, response validation, scoring, and normalization',
          'Separate safety and business automation profiles with domain-specific actions',
          'GL account, party, currency, percentage, inspection, and safety field types',
        ],
        href: '/forms/core',
        linkLabel: 'Open form engine',
      },
      {
        title: '@appkit/forms',
        description: 'Design, validate, preview, import, and export forms from one workspace.',
        icon: <ClipboardList />,
        features: [
          'Independently scrolling field library and sortable canvas with full drawer-based field and section properties',
          'Tables, matrices, formulas, defaults, validation, conditional logic, data binding, repeating sections, and free-form layouts',
          'Guided workflow steps, assignments, signatures, app pages, record editing/locking, list columns, and manual record actions',
          'Native fill runtime plus typed adapters for application data, identity, uploads, camera/scanner, and address services',
        ],
        href: '/forms',
        linkLabel: 'Open the form builder',
      },
      {
        title: '@appkit/editor',
        description: 'Add the same bounded rich-text authoring control to forms, notes, and document fields.',
        icon: <FileText />,
        features: [
          'TipTap paragraph, heading, list, emphasis, and link authoring',
          'Host-provided link normalization and shared translated control labels',
          'Separate install keeps the base UI primitive package free of editor dependencies',
        ],
        href: '/forms',
        linkLabel: 'Use rich text in a form',
      },
      {
        title: '@appkit/workflows',
        description: 'Run durable event, decision, approval, and action workflows.',
        icon: <Workflow />,
        features: [
          'Multi-flow library with enable, rename, delete, and subject-compatible templates',
          'Full graph canvas, typed node toolbar, drawer inspector, branch handles, and live validation',
          'Application-supplied subject profiles, trigger/action registries, and persistence adapters',
          'Replay-safe action ledger, pause/resume gates, and any/all approval quorums',
          'HMAC email approvals plus optional Drizzle schema/store and React visual builder',
        ],
        href: '/workflows',
        linkLabel: 'Open workflow builder',
      },
      {
        title: '@appkit/sync',
        description: 'Bring external records into application-owned models through a safe connector spine.',
        icon: <RefreshCw />,
        features: [
          'App-defined connector registry, canonical record envelope, cursors, dry runs, and record caps',
          'Crosswalk persistence and injected target adapters keep product entities outside the package',
          'Authoritative snapshots fail closed on empty pulls or any processing failure',
          'Optional hardened HTTPS egress and TLS PostgreSQL, MySQL, MariaDB, and SQL Server drivers',
        ],
        href: '/admin/integrations',
        linkLabel: 'Configure data connections',
      },
      {
        title: '@appkit/integrations',
        description: 'Send application events to external services without coupling product code to vendors.',
        icon: <Cable />,
        features: [
          'Application-defined trigger catalogue and independently installable destination registry',
          'Token mapping, sealed-secret seam, deterministic delivery references, and send-once policy',
          'Partial retries resume completed items; reversible SQL exports replace prior rows safely',
          'Optional HTTP, Slack/Teams, Google Sheets, email, SQL, and Drizzle persistence entries',
        ],
        href: '/admin/integrations',
        linkLabel: 'Open integrations',
      },
      {
        title: '@appkit/customization',
        description: 'Ship record customization as a native application capability instead of rebuilding an admin editor.',
        icon: <Paintbrush />,
        features: [
          'Production form designer with ordered header groups, editable line columns, and record actions',
          'Saved list-view designer with column widths, filters, sort, scope, and defaults',
          'Custom-field authoring plus versioned schemas, parsing, validation, linting, and refresh behavior',
        ],
        href: '/customization',
        linkLabel: 'Open customization studio',
      },
      {
        title: '@appkit/i18n',
        description: 'Apply one tenant-aware locale policy to application copy and user-authored multilingual content.',
        icon: <Languages />,
        features: [
          'Supported-locale parsing, Accept-Language negotiation, and stable policy normalization',
          'Tenant default and per-user override resolution with disabled-locale rejection',
          'Localized authoring-copy fallback that preserves older English and plain-string records',
        ],
        href: '/forms',
        linkLabel: 'See localized schemas',
      },
      {
        title: '@appkit/db',
        description: 'Start with tenant isolation and identity persistence already shaped for production.',
        icon: <Database />,
        features: [
          'Postgres RLS executor with tenant-scoped and BYPASSRLS handles',
          'Canonical tenants, users, memberships, roles, and API-key schemas',
          'Schema helpers and an installer for repeatable row-level-security policies',
        ],
        href: '/admin/users',
        linkLabel: 'See an RLS-scoped list',
      },
      {
        title: '@appkit/tenant',
        description: 'Carry one resolved request context through database access, authorization, and auditing.',
        icon: <ShieldCheck />,
        features: [
          'Wildcard RBAC, read tiers, visibility scopes, and per-user grant/deny overrides',
          'Membership resolution, permission assertions, and super-admin behavior',
          'One trust boundary shared by routes, actions, agent tools, and background work',
        ],
        href: '/admin/users',
        linkLabel: 'Inspect the RBAC flow',
      },
      {
        title: '@appkit/auth',
        description: 'Add a complete identity-provider runtime when an app needs one while keeping public and externally managed apps auth-free.',
        icon: <LockKeyhole />,
        badge: <Badge variant="secondary">Optional</Badge>,
        features: [
          'Durable sessions, password sign-in and resets, hashed one-time magic links, and OAuth accounts',
          'Membership-bound invitation grants with atomic activation and audit',
          'React forms, framework-neutral delivery, and memory, Postgres, and Next.js adapters',
        ],
      },
    ],
  },
  {
    label: 'Extend the runtime',
    description: 'Audit history, APIs, governed user code, and AI-assisted workflows.',
    accent: 'violet',
    layout: 'detailed',
    cards: [
      {
        title: '@appkit/events',
        description: 'Make material application changes traceable and reliably hand work to asynchronous consumers.',
        icon: <ScrollText />,
        features: [
          'Structured audit records and JSON before/after diffs',
          'Transactional outbox writes alongside the business mutation',
          'Recipient resolution, leased claims, durable retries, and an effects ledger',
          'Stable deduplication keys and authenticated relay calls for safe downstream delivery',
        ],
        href: '/admin/audit',
        linkLabel: 'View live audit history',
      },
      {
        title: '@appkit/notifications',
        description: 'Publish one event to an in-app inbox, email, web push, and critical SMS.',
        icon: <BellRing />,
        features: [
          'Tenant-scoped inbox, channel preferences, and web-push subscription schema',
          'Category policy, digests, quiet hours, critical-message handling, and deterministic delivery keys',
          'Push subscription lifecycle and provider-neutral channel dispatch',
          'Core policy works alone; optional React and Drizzle entries add surfaces and persistence',
        ],
        href: '/notifications',
        linkLabel: 'Open notifications',
      },
      {
        title: '@appkit/api',
        description: 'Ship consistent external APIs with authorization and documentation built into the route contract.',
        icon: <Braces />,
        features: [
          'API-key parsing, scoped authorization, and typed public errors',
          'Idempotent mutation helpers that safely replay prior results',
          'Route-shaped descriptions and generated OpenAPI documents',
        ],
        href: '/api-docs',
        linkLabel: 'Use the API reference',
      },
      {
        title: '@appkit/sandbox',
        description: 'Run authored JavaScript without granting it ambient access to the host process.',
        icon: <ShieldCheck />,
        features: [
          'Fresh QuickJS WASM runtime with no Node, filesystem, module loader, network, or database globals',
          'Bounded memory, stack, wall-clock execution, and governance units',
          'Deep-frozen inputs, structured host faults, logs, and explicit async capability injection',
          'One execution kernel shared by programmable endpoints, scripts, and installed app backends',
        ],
        href: '/admin/scripts',
        linkLabel: 'Run a governed script',
      },
      {
        title: '@appkit/endpoints',
        description: 'Offer user-defined handlers while keeping host access and resource consumption under application control.',
        icon: <Workflow />,
        features: [
          'QuickJS isolation with memory, execution-time, and unit budgets',
          'Governed storage, record, and host-call capabilities',
          'Deterministic limits that stop over-budget programs',
        ],
        href: '/admin/apps',
        linkLabel: 'Call a live app backend',
      },
      {
        title: '@appkit/scripts',
        description: 'Give builders governed automation code without exposing the application process.',
        icon: <Braces />,
        features: [
          'Ordered event hooks with explicit vetoes and application-whitelisted field changes',
          'Scheduled, bulk, HTTP endpoint, and opaque-origin browser-validation runtimes',
          'Read-only query, record, and governed host-function adapters supplied by the application',
          'Timezone-aware cron scheduling, queue-neutral jobs, durable results, logs, units, and timing',
        ],
        href: '/admin/scripts',
        linkLabel: 'Open script authoring',
      },
      {
        title: '@appkit/apps',
        description: 'Add an installable app platform with a real builder, runtime, permissions, and distribution lifecycle.',
        icon: <Puzzle />,
        features: [
          'Validated manifests and ZIPs, immutable versions, editable files, app storage, and declared object provisioning',
          'Opaque-origin iframe frontends with CSP, inlined assets, and a permission-checked message bridge',
          'QuickJS backend endpoints whose effective capabilities are the app grant intersected with the invoking user',
          'Install, upgrade, enable, author, preview, audit, publish, browse, and reinstall marketplace snapshots',
        ],
        href: '/admin/apps',
        linkLabel: 'Build and run an app',
      },
      {
        title: '@appkit/ai',
        description: 'Connect an agent to approved tools, models, prompts, and tenant policy.',
        icon: <Bot />,
        features: [
          'Provider-neutral, bounded multi-step tool loop with abort and redacted errors',
          'Streaming UI-message protocol, markdown, tool cards, cancellation, and thread composer',
          'Production analysis, extraction, document chat, vision, writing, digest, prompt, and model helpers',
          'Injected provider credentials, persistence transport, system prompt, and request-scoped tools',
        ],
      },
    ],
  },
  {
    label: 'Protect and deliver',
    description:
      'One encrypted credential path feeding provider-neutral email and SMS delivery, without leaking secrets through application errors.',
    accent: 'amber',
    layout: 'detailed',
    cards: [
      {
        title: '@appkit/crypto',
        description: 'Store provider and integration credentials through one authenticated-encryption contract.',
        icon: <KeyRound />,
        features: [
          'AES-256-GCM sealed secrets with a fresh nonce for every write',
          'HKDF-derived application keys and authenticated tamper rejection',
          'Shared ciphertext contract for every package that persists credentials',
        ],
      },
      {
        title: '@appkit/email-render',
        description: 'Turn authored workflow email content into safe provider-ready HTML, text, subjects, recipients, and attachments.',
        icon: <Mail />,
        features: [
          'Template AST, interpolation, loops, conditionals, and plain-text rendering',
          'Save-time HTML sanitization and escaped untrusted merge values',
          'Strict subject, output, recipient, attachment, and resource ceilings',
          'Provider-neutral delivery normalization shared by web and worker processes',
        ],
      },
      {
        title: '@appkit/design-studio',
        description: 'Compose print designs from positioned text, fields, shapes, images, and QR codes.',
        icon: <Palette />,
        features: [
          'Bounded multi-artboard document model with application-defined data fields',
          'Letter, A4-style, card, label, and custom physical formats',
          'Safe normalization, catalogue validation, HTML rendering, and print-provider profiles',
          'Interactive Fabric artboard with selection, move, resize, rotate, layers, zoom, and the full property inspector',
        ],
        href: '/design-studio',
        linkLabel: 'Open design studio',
      },
      {
        title: '@appkit/pdf',
        description: 'Render report documents, tables, statements, and authored templates to PDF.',
        icon: <FileText />,
        features: [
          'Pure-JS PDFKit renderer with manual pagination, repeated headers, and page totals',
          'Formal and modern financial-statement output',
          'Optional template and Chromium entries keep browser automation out of the core renderer',
        ],
        href: '/reports',
        linkLabel: 'Download a report PDF',
      },
      {
        title: '@appkit/forms-documents',
        description: 'Turn a form schema into localized document fields, stable print styles, and an authored PDF template.',
        icon: <FileOutput />,
        features: [
          'Companion text, image, photo, and repeating-section fields generated from the form contract',
          'Localized labels and shared document styling for consistent downstream output',
          'Generated bounded templates that can be edited before PDF rendering',
        ],
        href: '/forms/core',
        linkLabel: 'Inspect the form contract',
      },
      {
        title: '@appkit/forms-pdf',
        description: 'Print form summaries, repeating sections, photos, authored templates, and design documents.',
        icon: <ClipboardList />,
        features: [
          'Branded key-value summaries with repeating tables and photo grids',
          'Bounded resource loading, PNG conversion, reusable browser lifecycle, and template profiles',
          'Record/report printers and full-bleed multi-artboard design runs through optional runtime entries',
        ],
        href: '/design-studio',
        linkLabel: 'Preview document output',
      },
      {
        title: '@appkit/emails',
        description: 'Change outbound email providers without rewriting product workflows or credential handling.',
        icon: <Mail />,
        features: [
          `${EMAIL_PROVIDER_SPECS.length} provider specifications: Resend, SendGrid, Mailgun, Postmark, and secure SMTP`,
          'Tenant/platform policy resolution from one provider catalogue',
          'Credential-safe validation, transport construction, and failure reporting',
        ],
      },
      {
        title: '@appkit/sms',
        description: 'Send transactional messages through a stable application contract across common SMS vendors.',
        icon: <MessageSquare />,
        features: [
          `${SMS_PROVIDER_SPECS.length} providers: Twilio, Vonage, MessageBird, Plivo, and Telnyx`,
          'Strict E.164 address validation and fetch-based transports',
          'The same fail-closed tenant policy and sealed-secret path as email',
        ],
      },
    ],
  },
  {
    label: 'Run outside the request',
    description: 'Queues, workers, retries, and binary object storage.',
    accent: 'sky',
    layout: 'detailed',
    cards: [
      {
        title: '@appkit/jobs',
        description: 'Move expensive or retryable work into queues through a reusable producer and worker contract.',
        icon: <ServerCog />,
        features: [
          'BullMQ and Redis queue/worker factories with lazy connections',
          'Bounded producer retries and resilient blocking consumers',
          'Import- and build-safe behavior when Redis is not running',
        ],
      },
      {
        title: '@appkit/storage',
        description: 'Keep file workflows provider-portable across AWS, R2, MinIO, and other S3-compatible services.',
        icon: <Cloud />,
        features: [
          'Put, get, delete, and head operations behind one injected configuration',
          'Presigned upload and download URLs for direct client transfers',
          'Provider changes without changes to application feature code',
        ],
      },
    ],
  },
]

export default function PlatformPage() {
  return (
    <AdminHub
      title="Build the product. Keep the hard parts."
      description="AppKit gives TypeScript teams a production-shaped application foundation—complete enough to start fast, modular enough to adopt without a rewrite."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">35 modular packages</Badge>
          <Button asChild variant="outline" size="sm">
            <a href="https://github.com/braedonsaunders/appkit" target="_blank" rel="noreferrer">View on GitHub</a>
          </Button>
        </div>
      }
      groups={GROUPS}
    />
  )
}
