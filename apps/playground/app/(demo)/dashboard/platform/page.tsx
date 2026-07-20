import Link from 'next/link'
import {
  Braces,
  Cloud,
  Database,
  KeyRound,
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
import { createSealer } from '@appkit/crypto'
import { EMAIL_PROVIDER_SPECS } from '@appkit/emails'
import { SMS_PROVIDER_SPECS } from '@appkit/sms'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  PageContainer,
  PageHeader,
} from '@appkit/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Platform — appkit' }

type Capability = {
  name: string
  summary: string
  proof: string
  icon: React.ReactNode
  href?: string
  linkLabel?: string
}

const GROUPS: { label: string; description: string; capabilities: Capability[] }[] = [
  {
    label: 'Foundation',
    description: 'The shared visual, data, tenant, and identity substrate every app starts with.',
    capabilities: [
      {
        name: '@appkit/tokens',
        summary: 'Semantic color, shape, elevation, and motion tokens with Tailwind v4 utilities and one-class dark mode.',
        proof: 'The entire demo—including this page—uses these tokens in both themes.',
        icon: <Palette />,
        href: '/components',
        linkLabel: 'See token gallery',
      },
      {
        name: '@appkit/ui',
        summary: 'Accessible primitives, overlays, data grids, app shells, admin layouts, URL lists, and feedback patterns.',
        proof: 'The component gallery exercises the interactive primitive set.',
        icon: <Layers3 />,
        href: '/components',
        linkLabel: 'Open components',
      },
      {
        name: '@appkit/db',
        summary: 'Drizzle schema conventions, canonical identity tables, API tables, and a Postgres row-level-security executor.',
        proof: 'Dashboard counts and Team rows are live Postgres queries constrained by RLS.',
        icon: <Database />,
        href: '/dashboard/team',
        linkLabel: 'See live data',
      },
      {
        name: '@appkit/tenant',
        summary: 'RequestContext, wildcard RBAC, visibility scopes, permission overrides, and super-admin behavior.',
        proof: 'The fixed demo identity resolves real permissions; Team mutations still call assertCan.',
        icon: <ShieldCheck />,
        href: '/dashboard/team',
        linkLabel: 'See RBAC flow',
      },
      {
        name: '@appkit/auth',
        summary: 'Scrypt password hashing plus stateless, HMAC-signed sessions for apps that choose local credentials.',
        proof: 'Available to consuming apps, deliberately disabled throughout this public demo—no cookies, passwords, or login route.',
        icon: <LockKeyhole />,
      },
    ],
  },
  {
    label: 'Application runtime',
    description: 'Auditable mutations, public APIs, and governed user-defined behavior.',
    capabilities: [
      {
        name: '@appkit/events',
        summary: 'Audit records, JSON diffs, and a transactional outbox with stable deduplication keys.',
        proof: 'Inviting a Team member writes a real audit row in the same tenant context.',
        icon: <ScrollText />,
        href: '/dashboard/team',
        linkLabel: 'Create an audit event',
      },
      {
        name: '@appkit/api',
        summary: 'API-key parsing, scoped authorization, typed errors, idempotent mutations, route descriptions, and OpenAPI output.',
        proof: 'The interactive API reference is generated from route-shaped docs; its live demo endpoint is public here by design.',
        icon: <Braces />,
        href: '/api-docs',
        linkLabel: 'Send a request',
      },
      {
        name: '@appkit/endpoints',
        summary: 'QuickJS sandbox for user-defined handlers with memory, time, unit-budget, storage, record, and host-call governance.',
        proof: 'The package test suite executes real sandbox programs and proves over-budget scripts are stopped.',
        icon: <Workflow />,
      },
    ],
  },
  {
    label: 'Secrets and delivery',
    description: 'One encrypted credential path feeding provider-neutral outbound delivery.',
    capabilities: [
      {
        name: '@appkit/crypto',
        summary: 'AES-256-GCM sealed secrets using an HKDF-derived application key and a fresh nonce for every write.',
        proof: 'The live crypto proof below seals a demo credential and verifies tamper detection on every render.',
        icon: <KeyRound />,
      },
      {
        name: '@appkit/emails',
        summary: 'Resend, SendGrid, Mailgun, Postmark, and secure SMTP behind one tenant/platform policy.',
        proof: `${EMAIL_PROVIDER_SPECS.length} provider specifications drive settings and transport construction from one catalogue.`,
        icon: <Mail />,
      },
      {
        name: '@appkit/sms',
        summary: 'Twilio, Vonage, MessageBird, Plivo, and Telnyx with strict E.164 validation and credential-safe errors.',
        proof: `${SMS_PROVIDER_SPECS.length} fetch-based provider contracts share the same fail-closed tenant policy as email.`,
        icon: <MessageSquare />,
      },
    ],
  },
  {
    label: 'Infrastructure',
    description: 'Lazy, production-shaped adapters for work that leaves the request lifecycle.',
    capabilities: [
      {
        name: '@appkit/jobs',
        summary: 'BullMQ + Redis queue and worker factory with bounded producer retries and resilient blocking consumers.',
        proof: 'Connections are lazy, so importing or building an app never requires Redis to be online.',
        icon: <ServerCog />,
      },
      {
        name: '@appkit/storage',
        summary: 'S3-compatible put, get, delete, head, and presigned upload/download operations for R2, MinIO, or AWS.',
        proof: 'One injected configuration changes providers without changing application code.',
        icon: <Cloud />,
      },
    ],
  },
]

export default function PlatformPage() {
  const sealer = createSealer('appkit-public-demo-sealing-key-32-characters')
  const sealed = sealer.sealSecret('twilio-demo-auth-token')
  const tampered = `${sealed.ciphertext[0] === 'A' ? 'B' : 'A'}${sealed.ciphertext.slice(1)}`
  const rejectsTampering = sealer.unsealSecret({ ...sealed, ciphertext: tampered }) === null

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Everything in appkit"
        description="Every shipped package is accounted for here—live where safe, interactive where useful, and explicit about infrastructure that needs an external service."
        actions={<Badge variant="success">13 packages · auth disabled</Badge>}
      />

      <Card className="overflow-hidden border-primary/25 bg-primary-subtle/40">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>@appkit/crypto · live proof</Badge>
            <Badge variant={rejectsTampering ? 'success' : 'destructive'}>
              {rejectsTampering ? 'Tamper rejected' : 'Tamper check failed'}
            </Badge>
          </div>
          <CardTitle className="pt-2">A provider credential, sealed before persistence</CardTitle>
          <CardDescription>
            The plaintext exists only for this demonstration. Production stores the ciphertext and nonce, while APPKIT_SECRET stays in the environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <CodeBlock code={`plaintext: twilio-demo-auth-token\nnonce: ${sealed.nonce}`} />
          <CodeBlock code={`ciphertext: ${sealed.ciphertext}\nauthentication: AES-256-GCM`} />
        </CardContent>
      </Card>

      {GROUPS.map((group) => (
        <section key={group.label} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">{group.label}</h2>
            <p className="text-sm text-fg-muted">{group.description}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {group.capabilities.map((capability) => (
              <Card key={capability.name} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary [&_svg]:size-4">
                      {capability.icon}
                    </span>
                    <CardTitle className="font-mono text-base">{capability.name}</CardTitle>
                  </div>
                  <CardDescription className="pt-2 leading-relaxed">{capability.summary}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4">
                  <p className="text-sm leading-relaxed text-fg-muted">
                    <span className="font-medium text-fg">Proof: </span>
                    {capability.proof}
                  </p>
                  {capability.href ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={capability.href}>{capability.linkLabel}</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </PageContainer>
  )
}
