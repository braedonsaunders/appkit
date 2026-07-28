import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
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
  buildNotifyQueueJobs,
  type QueueProfile,
} from '@appkit/jobs'
import { createSealer } from '@appkit/crypto'
import { renderEmail } from '@appkit/email-render'
import { EMAIL_PROVIDER_SPECS, buildTransport } from '@appkit/emails'
import { sendMail, syncMailbox, verifyImap, verifySmtp } from '@appkit/mailbox'
import {
  XLSX_MIME_TYPE,
  excelJsAvailable,
  officeDocumentHtml,
  renderWorkbook,
  replaceTextInFodt,
  resolveSoffice,
  sanitizeOfficeHtml,
  type WorkbookSpec,
} from '@appkit/office'
import { buildBubblewrapPlan } from '@appkit/process-sandbox'
import { SMS_PROVIDER_SPECS, buildSmsTransport } from '@appkit/sms'
import {
  DEEPGRAM_STT_MODELS,
  ELEVENLABS_TTS_MODELS,
  GEMINI_LIVE_MODELS,
  OPENAI_REALTIME_MODELS,
} from '@appkit/voice'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DetailPageLayout,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appkit/ui'
import { getPackage } from '../../../../../lib/server/package-catalog'
import { SceneDemoStage } from './scene-demo-stage'
import { SuperadminDemo } from './superadmin-demo'

const PACKAGE_DEMOS = {
  crypto: 'Secret sealing',
  'email-render': 'Email rendering',
  emails: 'Email delivery',
  jobs: 'Background jobs',
  mailbox: 'Mailbox operations',
  office: 'Office documents',
  'process-sandbox': 'Process isolation',
  scene: 'Character scene',
  superadmin: 'Instance administration',
  sms: 'SMS delivery',
  voice: 'Voice providers',
} as const

type PackageDemoSlug = keyof typeof PACKAGE_DEMOS
type PackageDemoPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function generateStaticParams() {
  return Object.keys(PACKAGE_DEMOS).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PackageDemoPageProps): Promise<Metadata> {
  const slug = (await params).slug
  return slug in PACKAGE_DEMOS
    ? { title: `${PACKAGE_DEMOS[slug as PackageDemoSlug]} demo — appkit` }
    : { title: 'Package demo not found — appkit' }
}

export default async function PackageDemoPage({ params, searchParams }: PackageDemoPageProps) {
  const slug = (await params).slug
  if (!(slug in PACKAGE_DEMOS)) notFound()
  const item = getPackage(slug)
  if (!item) notFound()
  const query = await searchParams

  return (
    <DetailPageLayout
      header={
        <PageHeader
          title={`${PACKAGE_DEMOS[slug as PackageDemoSlug]} demo`}
          description={`A working proof built from ${item.name}'s published runtime exports.`}
          back={{
            href: `/packages/${slug}`,
            label: item.name,
            render: ({ href, className, children }) => <Link href={href} className={className}>{children}</Link>,
          }}
        />
      }
      className="space-y-6"
    >
      {renderPackageDemo(slug as PackageDemoSlug, query)}
    </DetailPageLayout>
  )
}

function renderPackageDemo(
  slug: PackageDemoSlug,
  query: Record<string, string | string[] | undefined>,
): ReactNode {
  switch (slug) {
    case 'crypto':
      return <CryptoDemo />
    case 'email-render':
      return <EmailRenderDemo project={queryValue(query.project, 'North Tower')} />
    case 'emails':
      return <EmailsDemo provider={queryValue(query.provider, 'resend')} />
    case 'jobs':
      return <JobsDemo recipients={boundedInteger(query.recipients, 620, 1, 1_000)} />
    case 'mailbox':
      return <MailboxDemo />
    case 'office':
      return <OfficeDemo project={queryValue(query.project, 'North Tower')} />
    case 'process-sandbox':
      return <ProcessSandboxDemo />
    case 'scene':
      return <SceneDemo />
    case 'superadmin':
      return <SuperadminDemo />
    case 'sms':
      return <SmsDemo provider={queryValue(query.provider, 'twilio')} />
    case 'voice':
      return <VoiceDemo />
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

function JobsDemo({ recipients }: { recipients: number }) {
  const jobs = buildNotifyQueueJobs({
    tenantId: '0194b8a2-3b74-7000-8000-000000000001',
    userIds: Array.from({ length: recipients }, (_, index) => `user-${String(index + 1).padStart(4, '0')}`),
    category: 'projects',
    type: 'project.updated',
    title: 'North Tower was updated',
    linkPath: '/projects/north-tower',
    channels: ['in_app', 'email'],
  }, { jobId: 'north-tower-update' })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Build a production queue plan</CardTitle>
          <CardDescription>
            Change the audience size. The exported normalizer deduplicates recipients, validates the payload,
            and splits work into bounded batches of 250 without contacting Redis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid flex-1 gap-1.5 text-sm font-medium text-fg">
              Recipients
              <Input name="recipients" type="number" min={1} max={1_000} defaultValue={recipients} />
            </label>
            <Button type="submit">Build queue plan</Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Validated recipients" value={String(recipients)} />
            <Metric label="Queue jobs" value={String(jobs.length)} />
            <Metric label="Largest batch" value={String(Math.max(...jobs.map((job) => job.data.userIds.length)))} />
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Recipients</TableHead><TableHead>Stable job id</TableHead></TableRow></TableHeader>
              <TableBody>
                {jobs.map((job, index) => (
                  <TableRow key={job.opts.jobId ?? index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{job.data.userIds.length}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs text-fg-muted">{job.opts.jobId ?? 'Generated by BullMQ'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Production queue profiles</CardTitle>
            <CardDescription>Retry, retention, and worker settings from the exported profiles.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Work</TableHead><TableHead>Queue</TableHead><TableHead>Attempts</TableHead><TableHead>Backoff</TableHead><TableHead>Workers</TableHead></TableRow></TableHeader>
              <TableBody>
                {JOB_PROFILES.map(({ label, profile }) => (
                  <TableRow key={label}>
                    <TableCell className="font-medium text-fg">{label}</TableCell>
                    <TableCell className="font-mono text-xs text-fg-muted">{profile.name}</TableCell>
                    <TableCell>{profile.defaultJobOptions.attempts ?? 1}</TableCell>
                    <TableCell>{backoffLabel(profile)}</TableCell>
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
            <CardDescription>The schedule registry reconciles Redis to these exact identities.</CardDescription>
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
    </>
  )
}

function CryptoDemo() {
  const sealer = createSealer('appkit-demo-secret-with-at-least-thirty-two-characters')
  const plaintext = 'provider-token-for-demo'
  const sealed = sealer.sealSecret(plaintext)
  const roundTrip = sealer.unsealSecret(sealed)
  const tampered = sealer.unsealSecret({
    ...sealed,
    ciphertext: `${sealed.ciphertext.slice(0, -4)}AAAA`,
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>AES-256-GCM round trip</CardTitle>
          <CardDescription>An explicit demo key exercises the same sealer used for tenant credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DemoRow label="Plaintext" value={plaintext} mono />
          <DemoRow label="Ciphertext" value={sealed.ciphertext} mono />
          <DemoRow label="Nonce" value={sealed.nonce} mono />
          <DemoRow label="Unsealed" value={roundTrip ?? 'Rejected'} mono />
          <Badge variant={roundTrip === plaintext ? 'success' : 'destructive'}>Authenticated round trip {roundTrip === plaintext ? 'passed' : 'failed'}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tamper protection</CardTitle>
          <CardDescription>Changing the authenticated ciphertext must fail closed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-md border border-border bg-bg-subtle p-4 text-sm leading-6 text-fg">
            The modified payload returned <strong>{tampered === null ? 'null' : 'plaintext'}</strong>.
            No malformed or cross-key value is accepted.
          </p>
          <Badge variant={tampered === null ? 'success' : 'destructive'}>Tampered payload {tampered === null ? 'rejected' : 'accepted'}</Badge>
        </CardContent>
      </Card>
    </div>
  )
}

function EmailRenderDemo({ project }: { project: string }) {
  const safeProject = project.trim().slice(0, 80) || 'North Tower'
  const rendered = renderEmail({
    mode: 'inline',
    subject: '{{project}} needs review',
    bodyTemplate: 'Project: {{project}}\nStatus: {{status}}\n\nOpen the project to review the latest changes.',
    brandName: 'AppKit Demo',
    cta: { label: 'Review project', url: 'https://example.com/projects/north-tower' },
  }, { project: safeProject, status: 'Ready for review' })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Merge a record</CardTitle>
          <CardDescription>The shared renderer escapes merge values and creates matched HTML and plain text.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="space-y-3">
            <label className="grid gap-1.5 text-sm font-medium text-fg">
              Project name
              <Input name="project" defaultValue={safeProject} maxLength={80} />
            </label>
            <Button type="submit">Render email</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{rendered.subject}</CardTitle>
          <CardDescription>Generated HTML preview and plain-text fallback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <iframe
            title="Rendered email"
            sandbox=""
            srcDoc={rendered.html}
            className="h-80 w-full rounded-md border border-border bg-surface"
          />
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-bg-subtle p-4 font-mono text-xs leading-5 text-fg">{rendered.text}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

function EmailsDemo({ provider }: { provider: string }) {
  const spec = EMAIL_PROVIDER_SPECS.find((candidate) => candidate.value === provider) ?? EMAIL_PROVIDER_SPECS[0]!
  const transport = buildTransport({
    provider: spec.value,
    fromName: 'AppKit Demo',
    fromEmail: 'notifications@example.com',
    secret: spec.value === 'smtp' ? undefined : 'demo-provider-secret',
    ...(spec.value === 'mailgun' ? { mailgunDomain: 'mg.example.com', mailgunRegion: 'us' as const } : {}),
    ...(spec.value === 'smtp' ? { smtpHost: 'smtp.example.com', smtpPort: 587 } : {}),
  })

  return (
    <ProviderDemo
      title="Email transport factory"
      description="Choose a provider to resolve its real configuration contract into a network-ready transport. No message is sent."
      name="provider"
      selected={spec.value}
      options={EMAIL_PROVIDER_SPECS.map((candidate) => ({ value: candidate.value, label: candidate.label }))}
      rows={[
        ['Credential', spec.secretLabel],
        ['Credential required', spec.secretRequired ? 'Yes' : 'No'],
        ['Additional fields', spec.fields.length ? spec.fields.map((field) => field.label).join(', ') : 'None'],
        ['Resolved transport', transport?.provider ?? 'Configuration incomplete'],
      ]}
    />
  )
}

function SmsDemo({ provider }: { provider: string }) {
  const spec = SMS_PROVIDER_SPECS.find((candidate) => candidate.value === provider) ?? SMS_PROVIDER_SPECS[0]!
  const transport = buildSmsTransport({
    enabled: true,
    provider: spec.value,
    fromNumber: '+14165550100',
    secret: 'demo-provider-secret',
    ...(spec.value === 'twilio' ? { twilioAccountSid: 'ACDEMO' } : {}),
    ...(spec.value === 'vonage' ? { vonageApiKey: 'demo-api-key' } : {}),
    ...(spec.value === 'plivo' ? { plivoAuthId: 'MADEMO' } : {}),
    ...(spec.value === 'telnyx' ? { telnyxMessagingProfileId: 'demo-profile' } : {}),
  })

  return (
    <ProviderDemo
      title="SMS transport factory"
      description="Choose a provider to validate its real configuration contract and resolve a transport. No message is sent."
      name="provider"
      selected={spec.value}
      options={SMS_PROVIDER_SPECS.map((candidate) => ({ value: candidate.value, label: candidate.label }))}
      rows={[
        ['Credential', spec.secretLabel],
        ['Credential required', spec.secretRequired ? 'Yes' : 'No'],
        ['Additional fields', spec.fields.length ? spec.fields.map((field) => field.label).join(', ') : 'None'],
        ['Resolved transport', transport?.provider ?? 'Configuration incomplete'],
      ]}
    />
  )
}

function ProviderDemo({
  title,
  description,
  name,
  selected,
  options,
  rows,
}: {
  title: string
  description: string
  name: string
  selected: string
  options: { value: string; label: string }[]
  rows: readonly (readonly [string, string])[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
        <CardContent>
          <form method="get" className="space-y-3">
            <label className="grid gap-1.5 text-sm font-medium text-fg">
              Provider
              <Select name={name} defaultValue={selected}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </label>
            <Button type="submit">Resolve transport</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Resolved contract</CardTitle><CardDescription>Values below come from the selected package provider specification.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {rows.map(([label, value]) => <DemoRow key={label} label={label} value={value} />)}
        </CardContent>
      </Card>
    </div>
  )
}

function MailboxDemo() {
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
        <CardDescription>A deterministic readiness view of the real runtime operations. Live calls require application-owned credentials and persistence.</CardDescription>
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

const OFFICE_UNTRUSTED_DRAFT = [
  '<h2>Site safety briefing</h2>',
  '<script>alert("blocked")</script>',
  '<p onclick="steal()">All visitors must wear a <strong>hard hat</strong> past the gate.</p>',
  '<img src="https://example.com/tracking-pixel.png">',
  '<div><ul><li>Check in at the trailer</li><li>High-visibility vest required</li></ul></div>',
].join('\n')

const OFFICE_FODT_SAMPLE =
  '<office:document><office:body><office:text>' +
  '<text:p>Wear a <text:span text:style-name="T1">hard hat</text:span> on site.</text:p>' +
  '<text:p>Report incidents to the site office.</text:p>' +
  '</office:text></office:body></office:document>'

async function OfficeDemo({ project }: { project: string }) {
  const safeProject = project.trim().slice(0, 80) || 'North Tower'

  const sanitizedBody = sanitizeOfficeHtml(OFFICE_UNTRUSTED_DRAFT)
  const documentHtml = officeDocumentHtml({
    bodyHtml: `<h1>${safeProject} — weekly report</h1>${sanitizedBody}`,
    title: `${safeProject} weekly report`,
    branding: {
      companyName: 'AppKit Demo Construction',
      accentColor: '#1a4f8a',
      footerText: `Prepared for ${safeProject} — confidential`,
    },
  })

  const edits = [
    { find: 'hard hat', replace: 'Type II hard hat' },
    { find: 'site office', replace: 'safety coordinator' },
    { find: 'scaffold permit', replace: 'work permit' },
  ]
  const { results: editResults } = replaceTextInFodt(OFFICE_FODT_SAMPLE, edits)

  const workbookSpec: WorkbookSpec = {
    creator: 'AppKit playground',
    sheets: [
      {
        name: `${safeProject} costs`,
        columns: [
          { header: 'Cost code', key: 'code', width: 12 },
          { header: 'Description', key: 'description' },
          { header: 'Committed', key: 'committed', numFmt: '#,##0.00' },
          { header: 'Invoiced', key: 'invoiced', numFmt: '#,##0.00' },
        ],
        rows: [
          { code: '03-100', description: 'Concrete formwork', committed: 182_500, invoiced: 121_300.5 },
          { code: '05-500', description: 'Structural steel erection', committed: 964_000, invoiced: 402_118.25 },
          { code: '26-050', description: 'Electrical rough-in', committed: 310_750, invoiced: 88_402 },
        ],
        formulas: [
          { cell: 'C5', formula: 'SUM(C2:C4)' },
          { cell: 'D5', formula: 'SUM(D2:D4)' },
        ],
        freezeHeader: true,
        autoFilter: true,
      },
    ],
  }
  const excelReady = await excelJsAvailable()
  const workbookBytes = excelReady ? (await renderWorkbook(workbookSpec)).byteLength : null

  const soffice = await resolveSoffice().then(
    (path) => ({ ready: true as const, detail: path }),
    (error: unknown) => ({
      ready: false as const,
      detail: error instanceof Error ? error.message : 'LibreOffice is not available.',
    }),
  )

  const conversions = [
    ['htmlToDocx(html)', 'docx:MS Word 2007 XML', 'Authored HTML becomes an editable Word document'],
    ['htmlToPdf(html)', 'pdf', 'Authored HTML prints straight to PDF'],
    ['docxToPdf(docx)', 'pdf', 'Renders an uploaded Word document for distribution'],
    ['docxToText(docx)', 'txt:Text', 'Plain-text extraction for agents and search'],
    ['replaceTextInDocx(docx, edits)', 'fodt round trip', 'Exact-match edits that keep formatting intact'],
    ['pdfUnite(pdfs)', 'poppler pdfunite', 'Concatenates rendered PDFs into one book'],
  ] as const

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Author a printable document</CardTitle>
            <CardDescription>
              Untrusted draft markup is reduced to the print allowlist, then wrapped in a branded
              letter-format document ready for LibreOffice conversion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1.5 text-sm font-medium text-fg">
                Project name
                <Input name="project" defaultValue={safeProject} maxLength={80} />
              </label>
              <Button type="submit">Compose document</Button>
            </form>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Draft input</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-subtle p-3 font-mono text-xs leading-5 text-fg">{OFFICE_UNTRUSTED_DRAFT}</pre>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Sanitized body</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-subtle p-3 font-mono text-xs leading-5 text-fg">{sanitizedBody}</pre>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rendered document</CardTitle>
            <CardDescription>
              The exact HTML that htmlToDocx and htmlToPdf hand to headless LibreOffice: 0.75in
              margins, serif hierarchy, bordered tables, letterhead, and footer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              title="Office document preview"
              sandbox=""
              srcDoc={documentHtml}
              className="h-[26rem] w-full rounded-md border border-border bg-surface"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workbook from a declarative spec</CardTitle>
            <CardDescription>
              renderWorkbook turns typed sheets, number formats, formulas, and a frozen filtered
              header into real .xlsx bytes through the optional exceljs adapter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DemoRow label="Sheet" value={`${safeProject} costs`} />
            <DemoRow label="Columns" value={workbookSpec.sheets[0]!.columns.map((column) => column.header).join(', ')} />
            <DemoRow label="Data rows" value={String(workbookSpec.sheets[0]!.rows.length)} />
            <DemoRow label="Formulas" value={workbookSpec.sheets[0]!.formulas!.map((formula) => `${formula.cell} = ${formula.formula}`).join(', ')} mono />
            <DemoRow label="Content type" value={XLSX_MIME_TYPE} mono />
            {workbookBytes === null ? (
              <Badge variant="secondary">Install the optional exceljs peer to generate workbooks</Badge>
            ) : (
              <Badge variant="success">Rendered a {workbookBytes.toLocaleString()}-byte workbook on this request</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Precision edits inside formatted text</CardTitle>
            <CardDescription>
              replaceTextInFodt splices exact-match plain-text edits across formatting runs; each
              result reports its occurrence count, and replaceTextInDocx round-trips the same edits
              through a Word document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {edits.map((edit, index) => (
              <div key={edit.find} className="grid gap-1 border-b border-border-subtle pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                <span className="font-mono text-xs text-fg">
                  {edit.find} {'->'} {edit.replace}
                </span>
                <Badge variant={editResults[index]!.count > 0 ? 'success' : 'secondary'}>
                  {editResults[index]!.count > 0
                    ? `${editResults[index]!.count} replaced`
                    : 'Not present'}
                </Badge>
              </div>
            ))}
            <p className="rounded-md border border-border bg-bg-subtle p-3 text-sm leading-6 text-fg">
              Character styles, lists, tables, and images survive because only text tokens are
              rewritten — the surrounding markup is never touched.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion runtime</CardTitle>
          <CardDescription>
            {soffice.ready
              ? `LibreOffice resolved at ${soffice.detail}; conversions run in a disposable profile directory with a 180-second ceiling.`
              : 'LibreOffice is not installed in this environment, so conversions are unavailable here. Install LibreOffice or set SOFFICE_PATH on the worker that renders documents.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Export</TableHead>
                <TableHead>Engine filter</TableHead>
                <TableHead>Responsibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversions.map(([name, filter, responsibility]) => (
                <TableRow key={name}>
                  <TableCell className="font-mono text-xs text-fg">{name}</TableCell>
                  <TableCell className="font-mono text-xs text-fg-muted">{filter}</TableCell>
                  <TableCell>{responsibility}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function ProcessSandboxDemo() {
  const plan = buildBubblewrapPlan({
    command: '/usr/local/bin/codex',
    args: ['exec', '--json', 'Inspect this workspace'],
    cwd: '/data/projects/project-one',
    writablePaths: ['/data/projects/project-one', '/data/agent-home/users/user-one'],
    readOnlyPaths: ['/usr', '/etc', '/opt', '/app'],
    environment: {
      CODEX_HOME: '/data/agent-home/users/user-one/.codex',
      HTTPS_PROXY: 'http://sandbox-egress.internal:3128',
    },
    launcherIdentity: { uid: 1000, gid: 1000 },
    syntheticSelfExecutable: '/usr/local/bin/codex',
  }, { pathExists: () => true })

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <Card>
        <CardHeader><CardTitle>Isolation contract</CardTitle><CardDescription>Generated by the package plan builder without spawning a privileged process.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <DemoRow label="Namespaces" value="PID, IPC, UTS, and cgroup" />
          <DemoRow
            label="Process view"
            value={plan.syntheticSelfExecutable
              ? `Synthetic self executable only · ${plan.syntheticSelfExecutable}`
              : plan.mountProc
                ? 'Private procfs for the isolated PID namespace'
                : 'Unavailable'}
          />
          <DemoRow label="Host data" value={plan.maskedPaths.join(', ')} mono />
          <DemoRow label="Writable" value={plan.writablePaths.join(', ')} mono />
          <DemoRow label="Environment" value="Cleared, then explicitly rebuilt" />
          <DemoRow
            label="Container launcher"
            value={`${plan.launcherIdentity?.uid}:${plan.launcherIdentity?.gid} via setuid bubblewrap`}
            mono
          />
          <DemoRow label="Failure mode" value="Never falls back to an unsandboxed process" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Generated bubblewrap plan</CardTitle><CardDescription>The exact command contract that a Linux worker would execute.</CardDescription></CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-subtle p-4 font-mono text-xs leading-5 text-fg"><code>{`${plan.command} ${plan.args.join(' ')}`}</code></pre>
        </CardContent>
      </Card>
    </div>
  )
}

function VoiceDemo() {
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
          <CardHeader><CardTitle>{provider}</CardTitle><CardDescription>{mode}</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {models.map((model) => <Badge key={model.id} variant="secondary" title={model.hint}>{model.name}</Badge>)}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SceneDemo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live character stage</CardTitle>
        <CardDescription>The real runtime owns walking, idle motion, collision spacing, protected zones, and depth scaling.</CardDescription>
      </CardHeader>
      <CardContent>
        <SceneDemoStage />
      </CardContent>
    </Card>
  )
}

function DemoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-border-subtle pb-3 last:border-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={`${mono ? 'break-all font-mono text-xs' : 'text-sm font-medium'} text-fg`}>{value}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-fg">{value}</p>
    </div>
  )
}

function backoffLabel(profile: QueueProfile): string {
  const backoff = profile.defaultJobOptions.backoff
  if (!backoff) return 'None'
  if (typeof backoff === 'number') return `${backoff / 1_000}s`
  return `${backoff.type} ${Number(backoff.delay ?? 0) / 1_000}s`
}

function queryValue(value: string | string[] | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function boundedInteger(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
