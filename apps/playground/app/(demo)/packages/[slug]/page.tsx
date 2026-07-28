import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ArrowUpRight, Boxes, Play } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DetailPageLayout,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appkit/ui'
import {
  CAPTURE_QUEUE_PROFILE,
  EMAIL_QUEUE_PROFILE,
  MIGRATION_QUEUE_PROFILE,
  NOTIFICATION_QUEUE_PROFILE,
  OUTBOUND_QUEUE_PROFILE,
  PDF_QUEUE_PROFILE,
  PRODUCTION_SCHEDULES,
  PUSH_QUEUE_PROFILE,
  REPORT_DELIVERY_QUEUE_PROFILE,
  REPORT_RUN_QUEUE_PROFILE,
  SANDBOX_QUEUE_PROFILE,
  SCHEDULED_QUEUE_PROFILE,
  SCRIPTS_QUEUE_PROFILE,
  type QueueProfile,
} from '@appkit/jobs'
import { buildPortraitPrompt, IMAGE_MODELS } from '@appkit/avatars'
import { sendMail, syncMailbox, verifyImap, verifySmtp } from '@appkit/mailbox'
import { buildBubblewrapPlan } from '@appkit/process-sandbox'
import { CharacterScene, type SceneCharacter } from '@appkit/scene'
import {
  DEEPGRAM_STT_MODELS,
  ELEVENLABS_TTS_MODELS,
  GEMINI_LIVE_MODELS,
  OPENAI_REALTIME_MODELS,
} from '@appkit/voice'
import {
  getPackage,
  PACKAGE_CATALOG,
  PACKAGE_CATEGORIES,
  type PackageCatalogItem,
} from '../../../../lib/server/package-catalog'

type PackagePageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return PACKAGE_CATALOG.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: PackagePageProps): Promise<Metadata> {
  const item = getPackage((await params).slug)
  return item
    ? { title: `${item.name} — appkit`, description: item.description }
    : { title: 'Package not found — appkit' }
}

export default async function PackagePage({ params }: PackagePageProps) {
  const item = getPackage((await params).slug)
  if (!item) notFound()
  const category = PACKAGE_CATEGORIES.find((candidate) => candidate.key === item.category)
  const runtimeDependencies = Object.entries(item.dependencies)
  const peers = Object.entries(item.peerDependencies)
  const showcase = packageShowcase(item.name)

  return (
    <DetailPageLayout
      header={
        <PageHeader
          title={item.name}
          description={item.description}
          back={{
            href: '/packages',
            label: 'All packages',
            render: ({ href, className, children }) => <Link href={href} className={className}>{children}</Link>,
          }}
          actions={
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href={item.demoHref}><Play className="size-4" /> Open demo</Link>
              </Button>
              {item.homepage ? (
                <Button asChild variant="outline" size="sm">
                  <a href={item.homepage} target="_blank" rel="noreferrer">Source <ArrowUpRight className="size-4" /></a>
                </Button>
              ) : null}
            </>
          }
        />
      }
      className="space-y-6"
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">v{item.version}</Badge>
        {item.license ? <Badge variant="outline">{item.license}</Badge> : null}
        {category ? <Badge variant="outline">{category.label}</Badge> : null}
        {Object.entries(item.engines).map(([engine, version]) => (
          <Badge key={engine} variant="outline">{engine} {version}</Badge>
        ))}
      </div>

      {showcase ? (
        <section id="demo" aria-label={`${item.name} demo`} className="scroll-mt-24">
          {showcase}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.5fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Install</CardTitle>
            <CardDescription>The package command from this workspace manifest.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-bg-subtle px-4 py-3 font-mono text-sm text-fg"><code>{installCommand(item)}</code></pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manifest</CardTitle>
            <CardDescription>Published package metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ManifestRow label="Name" value={item.name} mono />
            <ManifestRow label="Version" value={item.version} mono />
            <ManifestRow label="Public entries" value={String(item.exports.length)} />
            <ManifestRow label="Runtime dependencies" value={String(runtimeDependencies.length)} />
            <ManifestRow label="Peer dependencies" value={String(peers.length)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public entry points</CardTitle>
          <CardDescription>Every export declared by the published package.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {item.exports.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Import</TableHead><TableHead>Published target</TableHead></TableRow></TableHeader>
              <TableBody>
                {item.exports.map((entry) => (
                  <TableRow key={entry.path}>
                    <TableCell className="font-mono text-xs text-fg">{entry.path === '.' ? item.name : `${item.name}${entry.path.slice(1)}`}</TableCell>
                    <TableCell className="font-mono text-xs text-fg-muted">{entry.target}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="p-6 text-sm text-fg-muted">This package does not declare an exports map.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <DependencyCard
          title="Runtime dependencies"
          description="Installed with the package."
          dependencies={runtimeDependencies}
        />
        <DependencyCard
          title="Peer dependencies"
          description="Installed or selected by the consuming application."
          dependencies={peers}
          optional={new Set(item.optionalPeers)}
        />
      </div>

      {item.keywords.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Keywords declared in package.json.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {item.keywords.map((keyword) => <Badge key={keyword} variant="secondary">{keyword}</Badge>)}
          </CardContent>
        </Card>
      ) : null}
    </DetailPageLayout>
  )
}

function packageShowcase(name: string): ReactNode {
  switch (name) {
    case '@appkit/jobs':
      return <JobsPackageShowcase />
    case '@appkit/avatars':
      return <AvatarsPackageShowcase />
    case '@appkit/mailbox':
      return <MailboxPackageShowcase />
    case '@appkit/process-sandbox':
      return <ProcessSandboxShowcase />
    case '@appkit/scene':
      return <ScenePackageShowcase />
    case '@appkit/voice':
      return <VoicePackageShowcase />
    default:
      return null
  }
}

const JOB_PROFILES: readonly { label: string; profile: QueueProfile }[] = [
  { label: 'Email', profile: EMAIL_QUEUE_PROFILE },
  { label: 'Notifications', profile: NOTIFICATION_QUEUE_PROFILE },
  { label: 'Push', profile: PUSH_QUEUE_PROFILE },
  { label: 'PDF and documents', profile: PDF_QUEUE_PROFILE },
  { label: 'Report runs', profile: REPORT_RUN_QUEUE_PROFILE },
  { label: 'Report delivery', profile: REPORT_DELIVERY_QUEUE_PROFILE },
  { label: 'Scheduled work', profile: SCHEDULED_QUEUE_PROFILE },
  { label: 'Outbound events', profile: OUTBOUND_QUEUE_PROFILE },
  { label: 'Authored scripts', profile: SCRIPTS_QUEUE_PROFILE },
  { label: 'Sandboxes', profile: SANDBOX_QUEUE_PROFILE },
  { label: 'Migrations', profile: MIGRATION_QUEUE_PROFILE },
  { label: 'Capture', profile: CAPTURE_QUEUE_PROFILE },
]

function JobsPackageShowcase() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Production queue profiles</CardTitle>
          <CardDescription>Queue names, retry policy, retention, and worker concurrency come from the exported runtime—not duplicated demo data.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Work</TableHead><TableHead>Queue</TableHead><TableHead>Attempts</TableHead><TableHead>Backoff</TableHead><TableHead>Failed jobs</TableHead><TableHead>Workers</TableHead></TableRow></TableHeader>
            <TableBody>
              {JOB_PROFILES.map(({ label, profile }) => (
                <TableRow key={label}>
                  <TableCell className="font-medium text-fg">{label}</TableCell>
                  <TableCell className="font-mono text-xs text-fg-muted">{profile.name}</TableCell>
                  <TableCell>{profile.defaultJobOptions.attempts ?? 1}</TableCell>
                  <TableCell>{backoffLabel(profile)}</TableCell>
                  <TableCell>{retentionLabel(profile)}</TableCell>
                  <TableCell>{profile.workerConcurrency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repeatable work</CardTitle>
          <CardDescription>The default registry reconciles Redis to these exact identities and removes stale shadow schedules.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Kind</TableHead><TableHead>Cron</TableHead></TableRow></TableHeader>
            <TableBody>
              {PRODUCTION_SCHEDULES.map((schedule) => (
                <TableRow key={schedule.repeatKey}>
                  <TableCell className="font-mono text-xs text-fg">{schedule.name}</TableCell>
                  <TableCell className="font-mono text-xs text-fg-muted">{schedule.data.kind}</TableCell>
                  <TableCell className="font-mono text-xs text-fg-muted">{schedule.pattern}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ProcessSandboxShowcase() {
  const plan = buildBubblewrapPlan({
    command: '/usr/local/bin/codex',
    args: ['exec', '--json', 'Inspect this workspace'],
    cwd: '/data/projects/project-one',
    writablePaths: [
      '/data/projects/project-one',
      '/data/agent-home/users/user-one',
    ],
    readOnlyPaths: ['/usr', '/etc', '/opt', '/app'],
    environment: {
      CODEX_HOME: '/data/agent-home/users/user-one/.codex',
      HTTPS_PROXY: 'http://sandbox-egress.internal:3128',
    },
  }, { pathExists: () => true })

  const guarantees = [
    ['Namespaces', 'PID, IPC, UTS, and cgroup'],
    ['Host data', plan.maskedPaths.join(', ')],
    ['Writable', plan.writablePaths.join(', ')],
    ['Environment', 'Cleared, then explicitly rebuilt'],
    ['Network', 'Application-owned egress policy'],
    ['Failure mode', 'Never falls back to an unsandboxed server process'],
  ] as const

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Isolation contract</CardTitle>
          <CardDescription>This readiness view is generated from the package&apos;s real plan builder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {guarantees.map(([label, value]) => (
            <ManifestRow key={label} label={label} value={value} mono={label === 'Host data' || label === 'Writable'} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Generated bubblewrap plan</CardTitle>
          <CardDescription>Privileged execution is intentionally not performed by the demo server.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-bg-subtle px-4 py-3 font-mono text-xs leading-5 text-fg"><code>{`${plan.command} ${plan.args.join(' ')}`}</code></pre>
        </CardContent>
      </Card>
    </div>
  )
}

function AvatarsPackageShowcase() {
  const prompt = buildPortraitPrompt({
    description: 'a construction estimator wearing a navy work jacket',
    tone: ['capable', 'approachable'],
  })
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Available image models</CardTitle>
          <CardDescription>The live provider catalogue exported by the package.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {IMAGE_MODELS.map((model) => (
            <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium text-fg">{model.name}</span>
              <Badge variant="secondary">{model.provider}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Consistent portrait prompt</CardTitle>
          <CardDescription>Generated by the real shared prompt helper; no provider request is made without tenant credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-border bg-bg-subtle p-4 text-sm leading-6 text-fg">{prompt}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function MailboxPackageShowcase() {
  const operations = [
    ['verifyImap', verifyImap.name, 'Validate inbound connectivity without advancing the cursor'],
    ['syncMailbox', syncMailbox.name, 'Incrementally fetch, deduplicate, persist, then advance'],
    ['verifySmtp', verifySmtp.name, 'Validate outbound connectivity without sending a message'],
    ['sendMail', sendMail.name, 'Send with RFC 5322 reply and References threading'],
  ] as const
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailbox operation boundary</CardTitle>
        <CardDescription>These operations are read from the package&apos;s actual exports; credentials and persistence remain application-owned.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Export</TableHead><TableHead>Runtime function</TableHead><TableHead>Responsibility</TableHead></TableRow></TableHeader>
          <TableBody>
            {operations.map(([exportName, runtimeName, responsibility]) => (
              <TableRow key={exportName}>
                <TableCell className="font-mono text-xs text-fg">{exportName}</TableCell>
                <TableCell className="font-mono text-xs text-fg-muted">{runtimeName}</TableCell>
                <TableCell>{responsibility}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function VoicePackageShowcase() {
  const lanes = [
    ['Cascade · speech to text', 'Deepgram', DEEPGRAM_STT_MODELS],
    ['Cascade · text to speech', 'ElevenLabs', ELEVENLABS_TTS_MODELS],
    ['Realtime', 'OpenAI', OPENAI_REALTIME_MODELS],
    ['Realtime', 'Google', GEMINI_LIVE_MODELS],
  ] as const
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lanes.map(([mode, provider, models]) => (
        <Card key={`${mode}-${provider}`}>
          <CardHeader>
            <CardTitle>{provider}</CardTitle>
            <CardDescription>{mode}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {models.map((model) => (
              <Badge key={model.id} variant="secondary" title={model.hint}>{model.name}</Badge>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const SCENE_CHARACTERS: SceneCharacter[] = [
  {
    id: 'aria',
    name: 'Aria',
    idleAnimation: 'sway',
    status: { label: 'Reviewing', tone: 'active' },
  },
  {
    id: 'marcus',
    name: 'Marcus',
    walkSpeed: 0.85,
    idleAnimation: 'bounce',
    status: { label: 'Planning', tone: 'busy' },
  },
  {
    id: 'nora',
    name: 'Nora',
    walkSpeed: 1.15,
    idleAnimation: 'dance',
    status: { label: 'Available', tone: 'idle' },
  },
]

function ScenePackageShowcase() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live character stage</CardTitle>
        <CardDescription>
          The real scene runtime owns walking, idle motion, collision spacing, and depth
          scaling. Applications provide the people and ground configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CharacterScene
          characters={SCENE_CHARACTERS}
          height={360}
          contentZone={{ minX: 30, maxX: 70, minY: 38, maxY: 70 }}
        >
          <div className="mx-auto mt-8 w-fit max-w-[20rem] rounded-xl border border-border bg-surface/90 px-5 py-4 text-center shadow-md backdrop-blur">
            <p className="text-sm font-semibold text-fg">Shared team lobby</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">
              Characters route around this protected content zone.
            </p>
          </div>
        </CharacterScene>
      </CardContent>
    </Card>
  )
}

function backoffLabel(profile: QueueProfile): string {
  const backoff = profile.defaultJobOptions.backoff
  if (!backoff) return 'None'
  if (typeof backoff === 'number') return `${backoff / 1_000}s`
  return `${backoff.type} ${Number(backoff.delay ?? 0) / 1_000}s`
}

function retentionLabel(profile: QueueProfile): string {
  const retention = profile.defaultJobOptions.removeOnFail
  if (!retention || typeof retention === 'boolean' || typeof retention === 'number') return retention ? 'Configured' : 'Kept'
  if (!('age' in retention) || !retention.age) return 'Configured'
  return `${Math.round(retention.age / 86_400)} days`
}

function installCommand(item: PackageCatalogItem): string {
  return item.name === 'create-appkit' ? 'pnpm create appkit my-app' : `pnpm add ${item.name}`
}

function ManifestRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle pb-2 last:border-0 last:pb-0">
      <span className="text-fg-muted">{label}</span>
      <span className={mono ? 'font-mono text-xs text-fg' : 'font-medium text-fg'}>{value}</span>
    </div>
  )
}

function DependencyCard({
  title,
  description,
  dependencies,
  optional = new Set<string>(),
}: {
  title: string
  description: string
  dependencies: [string, string][]
  optional?: Set<string>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {dependencies.length ? (
          <div className="divide-y divide-border-subtle rounded-md border border-border">
            {dependencies.map(([name, version]) => (
              <div key={name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-mono text-xs text-fg">{name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {optional.has(name) ? <Badge variant="secondary">Optional</Badge> : null}
                  <span className="font-mono text-xs text-fg-muted">{version}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-fg-muted">
            <Boxes className="size-4" /> None declared
          </div>
        )}
      </CardContent>
    </Card>
  )
}
