import assert from 'node:assert/strict'
import test from 'node:test'
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
  assertCaptureJobData,
  assertMigrationJobData,
  assertOutboundDispatchJob,
  assertPdfJobData,
  assertReportDeliveryJobData,
  assertReportRunJobData,
  assertSandboxJobData,
  assertScheduledTick,
  assertScriptJobData,
  buildEmailQueueJobs,
  captureJobId,
  createCaptureQueue,
  createEmailQueue,
  createMigrationQueue,
  createNotificationQueues,
  createOutboundQueue,
  createPdfQueue,
  createReportDeliveryQueue,
  createReportRunQueue,
  createSandboxQueue,
  createScheduledQueue,
  createScriptsQueue,
  pdfJobId,
  reportRunJobId,
  scheduledJobOptions,
  unconfiguredScheduleKeys,
  type Jobs,
} from './index'

const TENANT_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_ID = '20000000-0000-4000-8000-000000000001'

test('all reusable production queue profiles retain names, retries, retention, and worker concurrency', () => {
  assert.deepEqual(
    [
      [EMAIL_QUEUE_PROFILE.name, EMAIL_QUEUE_PROFILE.defaultJobOptions.attempts, EMAIL_QUEUE_PROFILE.workerConcurrency],
      [PDF_QUEUE_PROFILE.name, PDF_QUEUE_PROFILE.defaultJobOptions.attempts, PDF_QUEUE_PROFILE.workerConcurrency],
      [NOTIFICATION_QUEUE_PROFILE.name, NOTIFICATION_QUEUE_PROFILE.defaultJobOptions.attempts, NOTIFICATION_QUEUE_PROFILE.workerConcurrency],
      [PUSH_QUEUE_PROFILE.name, PUSH_QUEUE_PROFILE.defaultJobOptions.attempts, PUSH_QUEUE_PROFILE.workerConcurrency],
      [OUTBOUND_QUEUE_PROFILE.name, OUTBOUND_QUEUE_PROFILE.defaultJobOptions.attempts, OUTBOUND_QUEUE_PROFILE.workerConcurrency],
      [SCHEDULED_QUEUE_PROFILE.name, SCHEDULED_QUEUE_PROFILE.defaultJobOptions.attempts, SCHEDULED_QUEUE_PROFILE.workerConcurrency],
      [REPORT_RUN_QUEUE_PROFILE.name, REPORT_RUN_QUEUE_PROFILE.defaultJobOptions.attempts, REPORT_RUN_QUEUE_PROFILE.workerConcurrency],
      [REPORT_DELIVERY_QUEUE_PROFILE.name, REPORT_DELIVERY_QUEUE_PROFILE.defaultJobOptions.attempts, REPORT_DELIVERY_QUEUE_PROFILE.workerConcurrency],
      [SCRIPTS_QUEUE_PROFILE.name, SCRIPTS_QUEUE_PROFILE.defaultJobOptions.attempts, SCRIPTS_QUEUE_PROFILE.workerConcurrency],
      [SANDBOX_QUEUE_PROFILE.name, SANDBOX_QUEUE_PROFILE.defaultJobOptions.attempts, SANDBOX_QUEUE_PROFILE.workerConcurrency],
      [MIGRATION_QUEUE_PROFILE.name, MIGRATION_QUEUE_PROFILE.defaultJobOptions.attempts, MIGRATION_QUEUE_PROFILE.workerConcurrency],
      [CAPTURE_QUEUE_PROFILE.name, CAPTURE_QUEUE_PROFILE.defaultJobOptions.attempts, CAPTURE_QUEUE_PROFILE.workerConcurrency],
    ],
    [
      ['emails', 5, 10],
      ['pdfs', 3, 3],
      ['notifications', 3, 10],
      ['push', 5, 10],
      ['outbound', 5, 5],
      ['scheduled', 3, 5],
      ['reports', 3, 2],
      ['reports', 3, 3],
      ['scripts', 1, 4],
      ['sandbox', 1, 1],
      ['migration', 2, 2],
      ['capture', 3, 3],
    ],
  )
  assert.deepEqual(EMAIL_QUEUE_PROFILE.defaultJobOptions.backoff, { type: 'exponential', delay: 30_000 })
  assert.deepEqual(PDF_QUEUE_PROFILE.defaultJobOptions.removeOnFail, { age: 30 * 24 * 3_600 })
  assert.deepEqual(CAPTURE_QUEUE_PROFILE.defaultJobOptions.removeOnFail, { age: 90 * 24 * 3_600 })
})

test('email fan-out preserves source normalization, privacy, and deterministic ids', () => {
  const jobs = buildEmailQueueJobs(
    {
      orgId: TENANT_ID,
      to: [' First@Example.com ', 'first@example.com', 'second@example.com'],
      subject: 'Queued',
      html: '<p>Queued</p>',
      text: 'Queued',
      meta: { category: 'reports' },
    },
    { jobId: 'domain-event|one' },
  )
  assert.deepEqual(jobs.map((job) => job.data.to), ['First@Example.com', 'second@example.com'])
  assert.equal(new Set(jobs.map((job) => job.opts?.jobId)).size, 2)
  assert.ok(jobs.every((job) => /^email-fanout\|[a-f0-9]{64}$/.test(String(job.opts?.jobId))))
  assert.equal(jobs[0]?.data.orgId, TENANT_ID)
  assert.deepEqual(jobs[0]?.data.meta, { category: 'reports' })
  assert.throws(() => buildEmailQueueJobs({ to: 'not-an-email', subject: 'Queued', html: '', text: '' }), /invalid recipient/)
})

test('outbound payload validation binds tenant identity and bounds flat event records', () => {
  assert.doesNotThrow(() => assertOutboundDispatchJob({
    tenantId: TENANT_ID,
    automationId: OTHER_ID,
    event: { type: 'record.created', tenantId: TENANT_ID, subjectId: 'record-one', items: [{ total: 42, active: true }] },
  }))
  assert.throws(() => assertOutboundDispatchJob({
    tenantId: TENANT_ID,
    automationId: OTHER_ID,
    event: { type: 'record.created', tenantId: OTHER_ID, subjectId: 'record-one', items: [] },
  }), /identity/)
  assert.throws(() => assertOutboundDispatchJob({
    tenantId: TENANT_ID,
    automationId: OTHER_ID,
    event: { type: 'record.created', tenantId: TENANT_ID, subjectId: 'record-one', items: [{ value: Number.NaN }] },
  }), /finite/)
})

test('PDF jobs retain every production kind, target binding, ceilings, and deterministic identity', () => {
  const summary = {
    kind: 'record_summary' as const,
    tenantId: TENANT_ID,
    subjectId: OTHER_ID,
    entityType: 'form_response',
    heading: 'Form response',
    fields: [],
    artifactTarget: { kind: 'form_response' as const, responseId: OTHER_ID },
  }
  assert.doesNotThrow(() => assertPdfJobData(summary))
  assert.equal(pdfJobId(summary), `pdf|${TENANT_ID}|record_summary|${OTHER_ID}`)
  assert.throws(() => assertPdfJobData({ ...summary, artifactTarget: { kind: 'form_response', responseId: TENANT_ID } }), /identity/)
  assert.throws(() => assertPdfJobData({
    kind: 'template_pdf', tenantId: TENANT_ID, html: 'x'.repeat(2 * 1024 * 1024 + 1), paperSize: 'letter', orientation: 'portrait', marginMm: 12, entityType: 'form_response', entityId: OTHER_ID,
  }), /too large|exceeds/)
  assert.doesNotThrow(() => assertPdfJobData({ kind: 'document_version_render', tenantId: TENANT_ID, documentId: OTHER_ID, versionId: TENANT_ID }))
  assert.doesNotThrow(() => assertPdfJobData({ kind: 'document_master_pdf', tenantId: TENANT_ID, documentId: OTHER_ID }))
  assert.doesNotThrow(() => assertPdfJobData({ kind: 'document_book', tenantId: TENANT_ID, bookId: OTHER_ID }))
  assert.doesNotThrow(() => assertPdfJobData({ kind: 'document_bundle', tenantId: TENANT_ID, parts: [{ html: '<p>Part</p>', paperSize: 'a4', orientation: 'landscape', marginMm: 10 }], filename: 'bundle.pdf', entityType: 'record', entityId: OTHER_ID }))
})

test('both production report queue contracts remain available without translation', () => {
  const run = { tenantId: TENANT_ID, scheduleId: OTHER_ID, runId: TENANT_ID }
  assert.doesNotThrow(() => assertReportRunJobData(run))
  assert.equal(reportRunJobId(run), `report-run|${TENANT_ID}`)
  assert.doesNotThrow(() => assertReportDeliveryJobData({ orgId: TENANT_ID, definitionId: 'income-statement', recipients: ['owner@example.com'], params: { period: 'current' } }))
  assert.throws(() => assertReportRunJobData({ ...run, runId: 'bad' }), /runId/)
  assert.throws(() => assertReportDeliveryJobData({ orgId: TENANT_ID, definitionId: 'income-statement', recipients: [] }), /between 1 and 1000/)
})

test('scheduled work retains the exact 11-job registry and reconciliation behavior', () => {
  assert.equal(PRODUCTION_SCHEDULES.length, 11)
  assert.equal(new Set(PRODUCTION_SCHEDULES.map((schedule) => schedule.repeatKey)).size, 11)
  assert.deepEqual(PRODUCTION_SCHEDULES.find((schedule) => schedule.repeatKey === 'tick-reports'), {
    name: 'tick:reports', data: { kind: 'report_schedule_scan' }, pattern: '*/5 * * * *', jobId: 'tick:reports', repeatKey: 'tick-reports',
  })
  assert.deepEqual(unconfiguredScheduleKeys([
    { key: 'legacy-generated-hash', name: 'tick:reports', pattern: '*/5 * * * *' },
    { key: 'tick-reports', name: 'tick:reports', pattern: '*/5 * * * *' },
    { key: 'tick-digest', name: 'tick:digest', pattern: 'old-pattern' },
  ]), ['legacy-generated-hash', 'tick-digest'])
  const sync = { kind: 'sync_run' as const, tenantId: TENANT_ID, connectionId: OTHER_ID, trigger: 'manual' as const }
  assert.doesNotThrow(() => assertScheduledTick(sync))
  assert.deepEqual(scheduledJobOptions(sync), { jobId: `sync-run|${TENANT_ID}|${OTHER_ID}`, removeOnComplete: true, removeOnFail: true })
  assert.deepEqual(scheduledJobOptions({ kind: 'db_maintenance', trigger: 'manual' }, { jobId: 'discarded', priority: 2 }), { priority: 2, deduplication: { id: 'db-maintenance' } })
})

test('script, sandbox, migration, and capture contracts accept both tenant naming conventions', () => {
  assert.doesNotThrow(() => assertScriptJobData({ orgId: TENANT_ID, scriptId: 'script-one', kind: 'bulk', actorId: 'user-one' }))
  assert.doesNotThrow(() => assertScriptJobData({ tenantId: TENANT_ID, scriptId: 'script-one', kind: 'scheduled' }))
  assert.doesNotThrow(() => assertSandboxJobData({ op: 'create', productionOrgId: TENANT_ID, name: 'QA', tier: 'masked', masked: true }))
  assert.doesNotThrow(() => assertSandboxJobData({ op: 'refresh', sandboxId: OTHER_ID, keepCustomizations: true }))
  assert.doesNotThrow(() => assertMigrationJobData({ orgId: TENANT_ID, connectionId: 'connection-one', mode: 'full_migration' }))
  const capture = { orgId: TENANT_ID, captureItemId: 'capture-one' } as const
  assert.doesNotThrow(() => assertCaptureJobData(capture))
  assert.equal(captureJobId(capture, 'source-capture'), 'source-capture|capture-one')
  assert.throws(() => assertMigrationJobData({ tenantId: 'bad', connectionId: 'connection-one', mode: 'mirror' }), /UUID/)
})

test('binding every production queue family remains lazy until a queue or worker is requested', () => {
  const fail = () => { throw new Error('connection allocated') }
  const lazyJobs = { getConnection: fail, getBlockingConnection: fail, defineQueue: fail, createWorker: fail, closeJobConnections: async () => undefined } as unknown as Jobs
  assert.doesNotThrow(() => {
    createEmailQueue(lazyJobs)
    createNotificationQueues(lazyJobs)
    createOutboundQueue(lazyJobs)
    createPdfQueue(lazyJobs)
    createReportRunQueue(lazyJobs)
    createReportDeliveryQueue(lazyJobs)
    createScheduledQueue(lazyJobs)
    createScriptsQueue(lazyJobs)
    createSandboxQueue(lazyJobs)
    createMigrationQueue(lazyJobs)
    createCaptureQueue(lazyJobs)
  })
})
