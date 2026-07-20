import {
  BarChart3,
  Bot,
  Braces,
  ClipboardList,
  Cloud,
  Database,
  KeyRound,
  Languages,
  Layers3,
  LockKeyhole,
  Mail,
  MessageSquare,
  Palette,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { EMAIL_PROVIDER_SPECS } from '@appkit/emails/providers'
import { SMS_PROVIDER_SPECS } from '@appkit/sms/providers'
import { AdminHub, Badge, type AdminHubGroup } from '@appkit/ui'

export const metadata = { title: 'Platform — appkit' }

const GROUPS: AdminHubGroup[] = [
  {
    label: 'Build the application',
    description:
      'The shared visual language, shell, data boundary, permissions, and analytical building blocks every suite application starts with.',
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
        description: 'Compose a complete OpenBooks/BeaconHS-compatible product instead of rebuilding common interface behavior.',
        icon: <Layers3 />,
        features: [
          'Inputs, feedback, dialogs, drawers, popovers, menus, tables, lists, and line editors',
          'Rich-text authoring, direct file upload protocol, signature capture, and translated UI copy injection',
          'Topbar/sidebar app shell, account launcher, search, notifications, theme, settings hub, and settings shell',
          'Dashboard grid, insight renderers, card studio, page layouts, transitions, metrics, and sparklines',
          'Tokenized light/dark styling, keyboard behavior, focus management, and reduced-motion support',
        ],
        href: '/components',
        linkLabel: 'Explore interactive primitives',
      },
      {
        title: '@appkit/analytics',
        description: 'Let users build reporting cards without accepting arbitrary SQL or coupling the engine to one product schema.',
        icon: <BarChart3 />,
        features: [
          'App-authored semantic catalogues and typed visualization metadata',
          'Parsed formula ASTs with a controlled function and field vocabulary',
          'Tenant-bound, parameterized Postgres compilation and result contracts',
          'Scalar, progress, table, bar, row, line, area, pie, donut, and gauge output',
        ],
        href: '/insights',
        linkLabel: 'Build an insight card',
      },
      {
        title: '@appkit/forms-core',
        description: 'Share one portable form language while preserving source-native automation profiles for different product domains.',
        icon: <Braces />,
        features: [
          'OpenBooks string schemas and BeaconHS localized/workflow schemas accepted by one versioned form contract',
          'Field metadata, conditional logic, formulas, defaults, response validation, scoring, and normalization',
          'Source-native safety and business automation profiles instead of a lossy invented union',
          'Finance-native GL account, party, currency, and percentage fields alongside the complete safety vocabulary',
        ],
        href: '/forms',
        linkLabel: 'Edit the portable schema',
      },
      {
        title: '@appkit/forms',
        description: 'Give app builders a portable designer and validated fill runtime while product persistence stays behind explicit adapters.',
        icon: <ClipboardList />,
        features: [
          'Searchable field library, section canvas, property inspector, ordering, options, and required-state authoring',
          'BeaconHS conditional-logic authoring extracted with injectable labels and semantic tokens',
          'Built-in form controls plus explicit host adapters for files, signatures, entity pickers, data sources, and specialized capture',
          'Live preview, full-schema linting, import/export, and browser persistence in the demo workbench',
        ],
        href: '/forms',
        linkLabel: 'Open the form builder',
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
          'Canonical tenants, users, memberships, roles, API keys, dashboards, and card schemas',
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
          'Independent package boundary—the demo remains authentication-free in every route',
        ],
      },
    ],
  },
  {
    label: 'Extend the runtime',
    description:
      'Production contracts for auditable mutations, public APIs, governed user code, and tenant-aware AI features.',
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
        description: 'Add an agent that uses app-approved tools without baking one model vendor, prompt, or tenant policy into AppKit.',
        icon: <Bot />,
        features: [
          'Provider-neutral, bounded multi-step tool loop with abort and redacted errors',
          'Streaming UI-message protocol, markdown, tool cards, cancellation, and thread composer',
          'Injected model, persistence transport, system prompt, and RequestContext-bound tools',
          'No provider credential or fake conversation is shipped by the public demo',
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
          'BeaconHS template AST, interpolation, loops, conditionals, and plain-text rendering preserved at source parity',
          'Save-time HTML sanitization and escaped untrusted merge values',
          'Strict subject, output, recipient, attachment, and resource ceilings',
          'Provider-neutral delivery normalization shared by web and worker processes',
        ],
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
    description:
      'Lazy infrastructure adapters for queued work and binary objects—production-shaped without making local builds depend on external services.',
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
      description="Everything an app builder gets from the shared foundation—grouped the same way suite applications organize company settings."
      actions={<Badge variant="success">19 production packages</Badge>}
      groups={GROUPS}
    />
  )
}
