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
  KeyRound,
  Languages,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquare,
  Palette,
  Paintbrush,
  ScrollText,
  ServerCog,
  ShieldCheck,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { EMAIL_PROVIDER_SPECS } from '@appkit/emails/providers'
import { SMS_PROVIDER_SPECS } from '@appkit/sms/providers'
import { AdminHub, Badge, type AdminHubGroup } from '@appkit/ui'

export const metadata = { title: 'Platform — appkit' }

const GROUPS: AdminHubGroup[] = [
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
          'Nested filters and tenant-bound row or summary query compilation',
          'Grouped results, fiscal breakouts, saved definitions, and page layouts',
          'Timezone-aware daily, weekly, and monthly delivery schedules',
          'Interactive report studio with injected execution, persistence, and export adapters',
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
          'Independently scrolling field library and canvas with drawer-based properties',
          'Conditional display rules, field validation, ordering, and section management',
          'Host adapter boundary for application-owned files, signatures, entity pickers, data sources, and specialized capture',
          'Live preview, schema validation, import/export, and draft persistence',
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
          'Two-pane node library, independently scrolling inspector, and graph canvas',
          'Application-supplied trigger and action registries',
          'Bounded graph persistence, branch handles, node positioning, and cycle detection',
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
        description: 'Let each application define configurable record screens without hardcoding product entities.',
        icon: <Paintbrush />,
        features: [
          'Application-supplied record, field, column, filter, and action catalogues',
          'Custom fields that extend forms, lists, filters, reports, and APIs together',
          'Form-layout and list-view defaults, validation, and linting',
        ],
        href: '/customization',
        linkLabel: 'Configure project screens',
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
        description: 'Add local credentials when a product needs them without forcing authentication into public or externally managed apps.',
        icon: <LockKeyhole />,
        badge: <Badge variant="secondary">Optional</Badge>,
        features: [
          'Scrypt password hashing with timing-safe verification',
          'Stateless HMAC-signed sessions and explicit expiry handling',
          'Optional local authentication that can be enabled only where required',
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
          'Stable deduplication keys for safe downstream delivery',
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
        title: '@appkit/endpoints',
        description: 'Offer user-defined handlers while keeping host access and resource consumption under application control.',
        icon: <Workflow />,
        features: [
          'QuickJS isolation with memory, execution-time, and unit budgets',
          'Governed storage, record, and host-call capabilities',
          'Deterministic limits that stop over-budget programs',
        ],
      },
      {
        title: '@appkit/ai',
        description: 'Connect an agent to approved tools, models, prompts, and tenant policy.',
        icon: <Bot />,
        features: [
          'Provider-neutral, bounded multi-step tool loop with abort and redacted errors',
          'Streaming UI-message protocol, markdown, tool cards, cancellation, and thread composer',
          'Injected model, persistence transport, system prompt, and request-scoped tools',
          'Application-controlled provider credentials, model policy, and conversation storage',
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
          'Optional React/Fabric entry adds an interactive artboard, layer, transform, zoom, and basic inspector workspace',
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
          'Optional summary and template entries add PDF rendering only when requested',
          'Optional design entry prints full-bleed design-studio documents and multi-page runs',
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
      title="AppKit platform"
      description="Packages and capabilities available to every application."
      actions={<Badge variant="success">31 packages</Badge>}
      groups={GROUPS}
    />
  )
}
