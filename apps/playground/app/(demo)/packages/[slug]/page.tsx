import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
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
              {item.demoHref ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={item.demoHref}><Play className="size-4" /> Open demo</Link>
                </Button>
              ) : null}
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

      {item.name === '@appkit/jobs' ? <JobsPackageShowcase /> : null}

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
