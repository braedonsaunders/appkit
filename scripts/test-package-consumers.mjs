import { execFile } from 'node:child_process'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const packagesArtifactRoot = join(root, '.artifacts', 'packages')
const consumersRoot = join(root, '.artifacts', 'consumers')
const artifactManifestPath = join(packagesArtifactRoot, 'manifest.json')

if (!existsSync(artifactManifestPath)) {
  throw new Error('Package tarballs are missing; run pnpm test:packages first')
}

const artifacts = JSON.parse(await readFile(artifactManifestPath, 'utf8'))
const tarballs = Object.fromEntries(artifacts.map((entry) => [entry.name, `file:${entry.tarball}`]))
await rm(consumersRoot, { recursive: true, force: true })
await mkdir(consumersRoot, { recursive: true })

await verifyNodeAndReactConsumer()
await verifyNextConsumer()
console.log('Fresh Node, React, and Next.js consumers all passed.')

async function verifyNodeAndReactConsumer() {
  const directory = join(consumersRoot, 'node-react')
  const typePackages = Object.keys(tarballs).sort()
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'appkit-packed-node-react-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...tarballs,
          '@xyflow/react': '^12.10.0',
          'drizzle-orm': '^0.45.2',
          fabric: '^7.0.0',
          'lucide-react': '^1.24.0',
          postgres: '^3.4.7',
          react: '^19.2.7',
          'react-dom': '^19.2.7',
          typescript: '^5.9.3',
        },
        pnpm: { overrides: tarballs },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(directory, 'smoke.mjs'),
    `import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseFormula } from '@appkit/analytics'
import { compileCustomReport, parseReportScheduleForm } from '@appkit/reports'
import { color } from '@appkit/tokens'
import { Button, PagedTable, PromptRoot, SubtabNav } from '@appkit/ui'
import { emptyFormSchema, validateFormSchema } from '@appkit/forms-core'
import { ProductionFormDesigner, ProductionFormRenderer } from '@appkit/forms'
import { createDesignDocument } from '@appkit/design-studio'
import { DesignStudioEditor } from '@appkit/design-studio/react'
import { ReportFilterBar, ReportPaper, ReportRunHistory, ReportScheduleForm, ReportScheduleList, StatementMatrixTable, Table, TableBody, TableCell, TableRow, reportStudioTemplates } from '@appkit/reports/react'
import { createCustomizationEngine } from '@appkit/customization'
import { createMemoryListViewStore } from '@appkit/customization/memory'
import { RecordListView } from '@appkit/customization/react'
import { createMemoryAttachmentAdapter } from '@appkit/storage/memory'
import { AttachmentPanel } from '@appkit/storage/react'
import { createMemoryRecordApprovalAdapter } from '@appkit/workflows'
import { ApprovalActions, ApprovalHistory, RecordApprovalProvider } from '@appkit/workflows/approval-react'
import { createTenantContextFactory } from '@appkit/tenant'
import { createMemoryIamService } from '@appkit/iam/memory'
import { AuditAdmin, RolesAdmin, UsersAdmin } from '@appkit/iam/react'
import { buildNotifyQueueJobs } from '@appkit/jobs/notifications'
import { buildEmailQueueJobs } from '@appkit/jobs/email'
import { assertPdfJobData, pdfJobId } from '@appkit/jobs/pdf'
import { PRODUCTION_SCHEDULES, scheduledJobOptions } from '@appkit/jobs/scheduled'
import { assertOutboundDispatchJob } from '@appkit/jobs/outbound'
import { NotificationSettings, ProductionNotificationPreferences, PushDeviceNotifications } from '@appkit/notifications/react'
import { createMemorySyncPersistence, createMemorySyncTarget, runSync as runDataSync } from '@appkit/sync'

assert.equal(parseFormula('count()', { resolveField: () => null }).ok, true)
assert.equal(color('primary').startsWith('rgb('), true)
assert.equal(validateFormSchema(emptyFormSchema('Smoke')).title, 'Smoke')
const productionFormSchema = { schemaVersion: 1, title: 'Equipment inspection', workflow: { steps: [{ key: 'inspect', title: 'Inspection', assignee: { type: 'expression', expr: '$submitter' } }] }, sections: [{ id: 'details', title: 'Inspection details', step: 'inspect', fields: [{ id: 'serial', type: 'text', label: 'Serial number', required: true }] }] }
const productionFormAdapter = {
  async createDraft() { return { ok: true, responseId: 'response-1' } },
  async saveDraft(input) { return { ok: true, savedAt: '2026-07-22T12:00:00.000Z', revision: input.baseRevision + 1, sequence: input.clientSequence } },
  async submit() { return { ok: true, responseId: 'response-1' } },
  async updateField() { return { ok: true } },
  async fetchEntityAttributes() { return { ok: true, attrs: {} } },
  async listHierarchyOptions() { return [] },
  async queryData(input) { return { columns: [], rows: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 25, selectedRow: null } },
  async aggregateData() { return { value: null, total: 0 } },
}
assert.match(renderToStaticMarkup(React.createElement(ProductionFormRenderer, { adapter: productionFormAdapter, templateId: 'template-1', templateName: 'Equipment inspection', version: 3, schema: productionFormSchema, sites: [], people: [], entitiesByField: {}, currentUser: { personId: null, name: 'Inspector' }, recordsHref: '/records', readOnly: true, responseStatus: 'submitted', initialValues: { serial: 'EQ-1042' } })), /EQ-1042/)
const productionDesignerAdapter = {
  async publish() { return { ok: true, version: 4 } },
  async saveOverview() { return { ok: true } },
  async saveRecordConfig() { return { ok: true } },
  async saveListConfig() { return { ok: true } },
  async savePermissions() { return { ok: true } },
}
const recordActionAdapter = {
  async create(name, graph) { return { id: 'flow-1', name, graph, enabled: true } },
  async update() {},
  async setEnabled() {},
  async remove() {},
}
const designerMarkup = renderToStaticMarkup(React.createElement(ProductionFormDesigner, { adapter: productionDesignerAdapter, recordActionAdapter, templateId: 'template-1', templateName: 'Equipment inspection', initialSchema: productionFormSchema, currentVersion: 3, backHref: '/forms', recordsHref: '/records', assignmentCreateHref: '/assignments/new', assignmentsHref: '/assignments', locale: 'en', defaultLocale: 'en', enabledLocales: ['en'] }))
assert.match(designerMarkup, /Record behaviour/)
assert.match(designerMarkup, /Publish v4/)
const tenantContextFactory = createTenantContextFactory({
  async withTenant(database, tenantId, fn) { assert.equal(tenantId, 'tenant-1'); return fn(database) },
  async withSuperAdmin(database, fn) { return fn(database) },
})
const tenantContext = tenantContextFactory.makeTenantContext({ name: 'primary' }, { userId: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false, timezone: 'America/Toronto', locale: 'fr', defaultLocale: 'en', enabledLocales: ['en', 'fr'], localeOverride: 'fr', membership: { id: 'member-1', displayName: 'Ada' }, permissions: new Set(['records.read.all']), scopes: [{ type: 'tenant' }], personId: 'person-1' })
assert.equal(tenantContext.personId, 'person-1')
assert.equal(await tenantContext.db(async database => database.name), 'primary')
const iamService = createMemoryIamService()
assert.match(renderToStaticMarkup(React.createElement(RolesAdmin, { service: iamService, permissionGroups: [] })), /Roles/)
assert.match(renderToStaticMarkup(React.createElement(UsersAdmin, { service: iamService, permissionGroups: [] })), /Users/)
assert.match(renderToStaticMarkup(React.createElement(AuditAdmin, { service: iamService })), /Audit log/)
const notificationCatalog = { categories: [{ key: 'records', label: 'Records', description: 'Record updates', defaultChannels: ['in_app', 'email'] }] }
const notificationPolicy = { digestMode: 'off', digestHourUtc: 7, quietHours: null, scanEnabled: true, scanCron: '0 6 * * *', scanTimezone: 'UTC' }
assert.match(renderToStaticMarkup(React.createElement(NotificationSettings, { categories: [{ key: 'records', label: 'Records', description: 'Record updates', defaultRoles: ['manager'] }], roles: [{ key: 'manager', name: 'Manager' }], members: [], groups: [], initial: {}, policy: notificationPolicy, adapter: { async save() {} } })), /Automatic scan schedule/)
assert.match(renderToStaticMarkup(React.createElement(ProductionNotificationPreferences, { catalog: notificationCatalog, initial: [], adapter: { async save() {} } })), /Save preferences/)
assert.match(renderToStaticMarkup(React.createElement(PushDeviceNotifications, { vapidPublicKey: null, adapter: { async save() {}, async remove() {}, async test() { return { sent: 1 } } } })), /Push notifications on this device/)
assert.deepEqual(buildNotifyQueueJobs({ tenantId: '11111111-1111-4111-8111-111111111111', userIds: Array.from({ length: 251 }, (_, index) => 'user-' + index), category: 'records', type: 'record.updated', title: 'Updated' }, { jobId: 'record-updated' }).map(job => job.data.userIds.length), [250, 1])
assert.deepEqual(buildEmailQueueJobs({ to: ['owner@example.com', 'team@example.com'], subject: 'Ready', html: '<p>Ready</p>', text: 'Ready' }, { jobId: 'report-ready' }).map(job => job.data.to), ['owner@example.com', 'team@example.com'])
const packedPdfJob = { kind: 'record_summary', tenantId: '11111111-1111-4111-8111-111111111111', subjectId: '22222222-2222-4222-8222-222222222222', entityType: 'form_response', heading: 'Response', fields: [] }
assert.doesNotThrow(() => assertPdfJobData(packedPdfJob))
assert.match(pdfJobId(packedPdfJob), /^pdf\|/)
assert.equal(PRODUCTION_SCHEDULES.length, 11)
assert.equal(scheduledJobOptions({ kind: 'sync_run', tenantId: '11111111-1111-4111-8111-111111111111', connectionId: '22222222-2222-4222-8222-222222222222', trigger: 'manual' }).jobId, 'sync-run|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222')
assert.doesNotThrow(() => assertOutboundDispatchJob({ tenantId: '11111111-1111-4111-8111-111111111111', automationId: '22222222-2222-4222-8222-222222222222', event: { type: 'record.created', tenantId: '11111111-1111-4111-8111-111111111111', subjectId: 'record-one', items: [] } }))
const syncPersistence = createMemorySyncPersistence([{ id: 'connection-1', tenantId: 'tenant-1', connectorKey: 'fixture', name: 'Fixture', status: 'connected', enabled: true, config: {}, secrets: {}, cursor: { page: 1 } }])
const packedSyncConnector = { key: 'fixture', name: 'Fixture', description: '', kind: 'native', entities: ['record'], async pull() { return { records: [{ entity: 'record', externalId: 'one', data: { name: 'Ready' } }], nextCursor: { page: 2 }, mode: 'full', authoritativeEntities: ['record'] } } }
const syncResult = await runDataSync({ tenantId: 'tenant-1', connectionId: 'connection-1', trigger: 'manual', connectors: { get: key => key === 'fixture' ? packedSyncConnector : null }, persistence: syncPersistence, target: createMemorySyncTarget() })
assert.equal(syncResult.status, 'success')
assert.equal(syncPersistence.changes[0]?.action, 'created')
assert.deepEqual(syncPersistence.connections[0]?.cursor, { page: 2 })
assert.equal(compileCustomReport({ entity: 'entries', columns: ['status'], filters: { combinator: 'and', rules: [{ field: 'status', op: 'eq', value: 'posted' }] } }, 'org-1', { entities: [{ key: 'entries', label: 'Entries', category: 'ledger', description: 'Entries', from: 'entries e', orgColumn: 'e.org_id', columns: [{ key: 'status', label: 'Status', kind: 'enum', expr: 'e.status', options: ['draft', 'posted'] }] }] }).sql.includes('e.org_id = $1'), true)
assert.equal(compileCustomReport({ entity: 'incidents', mode: 'summarize', columns: [], measures: [{ fn: 'count' }] }, 'tenant-1', { entities: [{ key: 'incidents', label: 'Incidents', category: 'operations', description: 'Incidents', table: 'incidents', columns: [{ key: 'reference', label: 'Reference', kind: 'text' }] }] }).sql.includes('"incidents"."tenant_id" = $1'), true)
assert.match(renderToStaticMarkup(React.createElement(Button, null, 'Ready')), /Ready/)
const design = createDesignDocument({ name: 'Smoke', theme: { primary: '#0f766e', accent: '#d97706', paper: '#ffffff', ink: '#0f172a', muted: '#64748b' } })
assert.match(renderToStaticMarkup(React.createElement(DesignStudioEditor, { document: design, onChange() {}, catalog: { fields: [] } })), /Smoke/)
assert.match(renderToStaticMarkup(React.createElement(ReportPaper, { company: 'Example', title: 'Report' }, React.createElement(Table, null, React.createElement(TableBody, null, React.createElement(TableRow, null, React.createElement(TableCell, null, 'Ready')))))), /data-report-paper/)
assert.match(renderToStaticMarkup(React.createElement(StatementMatrixTable, { view: { columns: [{ key: 'actual', label: 'Actual', kind: 'amount' }, { key: 'variance', label: 'Variance', kind: 'variance_pct' }], lines: [{ key: 'revenue', kind: 'account', label: 'Revenue', depth: 0, accountId: 'account-1', values: [125000, 12.5] }] }, currency: 'USD', scale: 'thousands' })), /Revenue/)
assert.match(renderToStaticMarkup(React.createElement(ReportFilterBar, { value: { period: 'this_month' }, onChange() {}, controls: { period: true, breakout: true, compare: true, basis: true, scale: true, showZero: true }, dimensions: { departments: [], projects: [], locations: [], classes: [] } })), /Breakout/)
assert.equal(reportStudioTemplates({ key: 'entries', label: 'Entries', category: 'ledger', description: 'Entries', from: 'entries e', orgColumn: 'e.org_id', columns: [{ key: 'posted_on', label: 'Posted on', kind: 'date', expr: 'e.posted_on' }, { key: 'status', label: 'Status', kind: 'enum', expr: 'e.status' }, { key: 'amount', label: 'Amount', kind: 'number', expr: 'e.amount' }] }).length, 4)
const scheduleFormData = new FormData()
for (const [key, value] of Object.entries({ definitionId: 'report-1', name: 'Weekly ledger', cadence: 'weekly', repeatEvery: '1', dayOfWeek: '1', hour: '7', minute: '30', timezone: 'America/Toronto', recipientUserIds: 'user-1', recipientEmails: 'finance@example.com', filters: '{"days":30}' })) scheduleFormData.set(key, value)
const parsedSchedule = parseReportScheduleForm(scheduleFormData)
assert.deepEqual(parsedSchedule.recipientUserIds, ['user-1'])
assert.deepEqual(parsedSchedule.filters, { days: 30 })
const sourceSchedule = { id: 'schedule-1', definitionId: 'report-1', name: 'Weekly ledger', active: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 7, minute: 30, dayOfWeek: 1, dayOfMonth: null, weekOfMonth: null, repeatEvery: 1, startsOn: null, endsOn: null, recipientUserIds: ['user-1'], recipientEmails: ['finance@example.com'], filters: { days: 30 }, emailSubject: null, emailMessage: null, nextRunAt: '2026-07-27T11:30:00.000Z', lastRunAt: null }
const scheduleDefinitions = [{ id: 'report-1', name: 'General ledger', category: 'Financial statements', kind: 'built_in' }]
assert.match(renderToStaticMarkup(React.createElement(ReportScheduleForm, { definitions: scheduleDefinitions, members: [{ userId: 'user-1', name: 'Ada', email: 'ada@example.com' }], initial: sourceSchedule, onSubmit() {} })), /Weekly ledger/)
assert.match(renderToStaticMarkup(React.createElement(ReportScheduleList, { schedules: [sourceSchedule], definitions: scheduleDefinitions })), /Every Monday/)
assert.match(renderToStaticMarkup(React.createElement(ReportRunHistory, { runs: [{ id: 'run-1', scheduleId: sourceSchedule.id, trigger: 'scheduled', status: 'succeeded', rowCount: 12, startedAt: '2026-07-20T11:30:00.000Z', finishedAt: '2026-07-20T11:30:04.000Z', artifact: { filename: 'ledger.pdf', sizeBytes: 1024, contentType: 'application/pdf', createdAt: '2026-07-20T11:30:04.000Z' } }] })), /ledger\.pdf/)
assert.match(renderToStaticMarkup(React.createElement(PagedTable, { rows: [{ id: '1', name: 'Ready' }], columns: [{ key: 'name', header: 'Name', cell: row => row.name }], empty: 'Empty', rowKey: row => row.id })), /Ready/)
assert.match(renderToStaticMarkup(React.createElement(SubtabNav, { tabs: [{ key: 'details', label: 'Details' }], active: 'details' })), /aria-selected="true"/)
assert.equal(renderToStaticMarkup(React.createElement(PromptRoot)), '')
const approvalAdapter = createMemoryRecordApprovalAdapter()
assert.equal(renderToStaticMarkup(React.createElement(RecordApprovalProvider, { adapter: approvalAdapter }, React.createElement(React.Fragment, null, React.createElement(ApprovalActions, { subjectKind: 'record', subjectId: 'one' }), React.createElement(ApprovalHistory, { subjectKind: 'record', subjectId: 'one' })))), '')
const attachmentAdapter = createMemoryAttachmentAdapter()
assert.match(renderToStaticMarkup(React.createElement(AttachmentPanel, { targetTable: 'records', targetId: 'one', canEdit: true, adapter: attachmentAdapter })), /Attachments/)
const recordMeta = { key: 'record', labelKey: 'records.record', category: 'entity', headerFields: [], lineFields: [], listColumns: [{ key: 'number', labelKey: 'fields.number', kind: 'reference', sortable: true, locked: true }], listFilters: [] }
const customization = createCustomizationEngine([recordMeta])
const listStore = createMemoryListViewStore({ registry: customization.registry, createId: () => 'view-1' })
const recordView = customization.defaultListView('record')
const savedView = await listStore.save({ recordType: 'record', name: 'Mine', scope: 'user', config: recordView, actor: { userId: 'user-1' } })
assert.equal((await listStore.list('record', 'user-1'))[0]?.id, savedView.id)
assert.match(renderToStaticMarkup(React.createElement(RecordListView, { meta: recordMeta, view: recordView, rows: [{ id: 'one', number: 'R-100' }], total: 1, page: 1, perPage: 25, views: [savedView], currentViewId: savedView.id, subtabs: [{ key: 'all', label: 'All', count: 1 }], activeSubtab: 'all', rowKey: row => row.id })), /R-100/)
`,
  )
  await writeFile(
    join(directory, 'smoke.ts'),
    `${typePackages.map((name, index) => `import type * as Package${index} from '${name}'`).join('\n')}
import type { PagedColumn, SubtabNavProps } from '@appkit/ui'
import type { AttachmentPanelProps } from '@appkit/storage/react'
import type { MemoryAttachmentAdapterOptions } from '@appkit/storage/memory'
import type { DesignStudioEditorProps } from '@appkit/design-studio/react'
import type { ParsedReportScheduleForm, ReportCustomQuery, ReportDrillLoader, ReportPaperData, ReportSchedule } from '@appkit/reports'
import type { ReportDrillDrawerText, ReportScheduleFormProps, ReportScheduleListProps, ReportScheduleRun, ReportStudioValue, StatementMatrixView } from '@appkit/reports/react'
import type { DrizzleListViewStoreOptions } from '@appkit/customization/drizzle'
import type { MemoryListViewStoreOptions } from '@appkit/customization/memory'
import type { RecordListViewProps } from '@appkit/customization/react'
import type { PersistedListViewScope } from '@appkit/customization/persistence-schema'
import type { PromptDialogOptions } from '@appkit/ui'
import type { RecordApprovalAdapter, RecordApprovalState } from '@appkit/workflows'
import type { ApprovalActionsProps, ApprovalHistoryProps, RecordApprovalProviderProps } from '@appkit/workflows/approval-react'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createDrizzleIamService } from '@appkit/iam/drizzle'
import type { BulkRoleAssignmentInput, IamAdminService, MemberRecord, RoleRecord } from '@appkit/iam'
import type { MemberAdminAction, MemberAdminExtension, RoleAdminExtension } from '@appkit/iam/react'
import type { ProductionFormDesignerAdapter, ProductionFormDesignerProps, ProductionFormRendererProps, ProductionFormRuntimeAdapter } from '@appkit/forms'
import type { NotificationConfigurationAdapter, NotificationPolicyInput } from '@appkit/notifications'
import type { NotificationPreferencesAdapter, NotificationSettingsProps, ProductionNotificationPreferencesProps, PushDeviceAdapter } from '@appkit/notifications/react'
import type { NotifyJobData, PushJobData } from '@appkit/jobs/notifications'
import type { EmailJobData, EnqueueEmailData } from '@appkit/jobs/email'
import type { OutboundDispatchJob } from '@appkit/jobs/outbound'
import type { PdfJobData, OnDemandPdfJobData, RenderedPdfArtifact } from '@appkit/jobs/pdf'
import type { ReportRunJobData, ReportDeliveryJobData } from '@appkit/jobs/reports'
import type { ScheduledTick, ScheduledDefinition } from '@appkit/jobs/scheduled'
import { createScheduledQueue } from '@appkit/jobs/scheduled'
import type { ScriptJobData } from '@appkit/jobs/scripts'
import type { SandboxJobData } from '@appkit/jobs/sandbox'
import type { MigrationJobData } from '@appkit/jobs/migration'
import type { CaptureJobData } from '@appkit/jobs/capture'
import { createSyncOrchestrator } from '@appkit/sync'
import type { RunSyncArgs, RunSyncResult, SyncConnectionRecord, SyncPersistence, SyncRecordChange, SyncTarget } from '@appkit/sync'
import { createMembershipAccessResolver, resolveMembershipAccess } from '@appkit/tenant'
import type { MembershipAccessDatabase, RequestContext, RequestContextArgs, TenantDatabase } from '@appkit/tenant'
${typePackages.map((_, index) => `type PackageContract${index} = typeof Package${index}`).join('\n')}
${typePackages.map((_, index) => `void (null as unknown as PackageContract${index})`).join('\n')}
void (null as unknown as PagedColumn<{ id: string }>)
void (null as unknown as SubtabNavProps)
void (null as unknown as AttachmentPanelProps)
void (null as unknown as MemoryAttachmentAdapterOptions)
void (null as unknown as DesignStudioEditorProps)
void (null as unknown as ReportPaperData)
void (null as unknown as ReportCustomQuery)
void (null as unknown as ReportDrillLoader<unknown>)
void (null as unknown as ReportDrillDrawerText)
void (null as unknown as ReportStudioValue)
void (null as unknown as StatementMatrixView)
void (null as unknown as ParsedReportScheduleForm)
void (null as unknown as ReportSchedule)
void (null as unknown as ReportScheduleFormProps)
void (null as unknown as ReportScheduleListProps)
void (null as unknown as ReportScheduleRun)
void (null as unknown as DrizzleListViewStoreOptions)
void (null as unknown as MemoryListViewStoreOptions)
void (null as unknown as RecordListViewProps<{ id: string; number: string }>)
void (null as unknown as PersistedListViewScope)
void (null as unknown as PromptDialogOptions)
void (null as unknown as RecordApprovalAdapter)
void (null as unknown as RecordApprovalState)
void (null as unknown as ApprovalActionsProps)
void (null as unknown as ApprovalHistoryProps)
void (null as unknown as RecordApprovalProviderProps)
void (null as unknown as ProductionFormRendererProps)
void (null as unknown as ProductionFormRuntimeAdapter)
void (null as unknown as ProductionFormDesignerProps)
void (null as unknown as ProductionFormDesignerAdapter)
void (null as unknown as NotificationConfigurationAdapter)
void (null as unknown as NotificationPolicyInput)
void (null as unknown as NotificationSettingsProps)
void (null as unknown as NotificationPreferencesAdapter)
void (null as unknown as ProductionNotificationPreferencesProps)
void (null as unknown as PushDeviceAdapter)
void (null as unknown as NotifyJobData)
void (null as unknown as PushJobData)
void (null as unknown as EmailJobData)
void (null as unknown as EnqueueEmailData)
void (null as unknown as OutboundDispatchJob)
void (null as unknown as PdfJobData)
void (null as unknown as OnDemandPdfJobData)
void (null as unknown as RenderedPdfArtifact)
void (null as unknown as ReportRunJobData)
void (null as unknown as ReportDeliveryJobData)
void (null as unknown as ScheduledTick)
void (null as unknown as ScheduledDefinition)
void (null as unknown as ScriptJobData)
void (null as unknown as SandboxJobData)
void (null as unknown as MigrationJobData)
void (null as unknown as CaptureJobData)
void (null as unknown as RunSyncArgs)
void (null as unknown as RunSyncResult)
void (null as unknown as SyncConnectionRecord)
void (null as unknown as SyncPersistence<unknown>)
void (null as unknown as SyncRecordChange)
void (null as unknown as SyncTarget<unknown, unknown>)
const sourceShapedSync = createSyncOrchestrator({ connectors: { get() { return null } }, persistence: null as unknown as SyncPersistence<unknown>, target: null as unknown as SyncTarget<unknown, unknown> })
void sourceShapedSync({ tenantId: 'tenant-1', connectionId: 'connection-1', trigger: 'manual' })
const organizationScriptJob: ScriptJobData = { orgId: '10000000-0000-4000-8000-000000000001', scriptId: 'script-one', kind: 'bulk', actorId: 'user-one' }
const tenantScriptJob: ScriptJobData = { tenantId: '10000000-0000-4000-8000-000000000001', scriptId: 'script-one', kind: 'scheduled' }
const organizationMigrationJob: MigrationJobData = { orgId: '10000000-0000-4000-8000-000000000001', connectionId: 'connection-one', mode: 'full_migration' }
const sourceCaptureJob: CaptureJobData = { orgId: '10000000-0000-4000-8000-000000000001', captureItemId: 'capture-one' }
const sourceReportDeliveryJob: ReportDeliveryJobData = { orgId: '10000000-0000-4000-8000-000000000001', definitionId: 'income-statement', recipients: ['owner@example.com'] }
const sourceReportRunJob: ReportRunJobData = { tenantId: '10000000-0000-4000-8000-000000000001', scheduleId: '20000000-0000-4000-8000-000000000001', runId: '30000000-0000-4000-8000-000000000001' }
declare const jobsRuntime: import('@appkit/jobs').Jobs
const customScheduledQueue = createScheduledQueue<{ kind: 'search_reindex'; tenantId: string }>(jobsRuntime, { schedules: [], validateCustomTick(data) { void data.tenantId } })
void organizationScriptJob
void tenantScriptJob
void organizationMigrationJob
void sourceCaptureJob
void sourceReportDeliveryJob
void sourceReportRunJob
void customScheduledQueue
type ApplicationRequestContext = RequestContext<{ personId: string | null; terminology?: { authority: string } }>
type ApplicationRequestArgs = RequestContextArgs<{ personId: string | null; terminology?: { authority: string } }>
declare const applicationContext: ApplicationRequestContext
declare const applicationArgs: ApplicationRequestArgs
declare const tenantDatabase: TenantDatabase
declare const postgresJsDatabase: PostgresJsDatabase<Record<string, unknown>>
declare const nodePgDatabase: NodePgDatabase<Record<string, unknown>>
async function unchangedMembershipAccessCall(database: MembershipAccessDatabase) {
  return resolveMembershipAccess(database, 'membership-1', 'active-role-1')
}
async function productionDriverMembershipAccessCall() {
  return resolveMembershipAccess(postgresJsDatabase, 'membership-1', 'active-role-1')
}
const boundMembershipAccess = createMembershipAccessResolver({ permissionCatalogue: ['records.read.all'] })
function unchangedIamCalls(service: IamAdminService, member: MemberRecord, role: RoleRecord, bulk: BulkRoleAssignmentInput) {
  void service.bulkUpdateRoleAssignments(bulk)
  void service.resendInvite(member.id)
  void service.listAuditEvents({ recordType: 'membership', recordId: member.id, sort: 'at', direction: 'desc' })
  void role.capabilities
}
const nodePgIam = createDrizzleIamService({ db: nodePgDatabase, tenantId: 'tenant-1', actor: { userId: 'user-1' } })
const postgresJsIam = createDrizzleIamService({ db: postgresJsDatabase, tenantId: 'tenant-1', actor: { userId: 'user-1' } })
const memberAction: MemberAdminAction = { key: 'reset', label: 'Reset password', async run() {} }
const memberExtension: MemberAdminExtension = { key: 'identity', label: 'Identity', render: () => null }
const roleExtension: RoleAdminExtension = { key: 'access', label: 'Access', render: () => null }
void applicationContext.personId
void applicationArgs.personId
void tenantDatabase
void unchangedMembershipAccessCall
void productionDriverMembershipAccessCall
void boundMembershipAccess
void unchangedIamCalls
void nodePgIam
void postgresJsIam
void memberAction
void memberExtension
void roleExtension
`,
  )
  await writeFile(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['smoke.ts'],
      },
      null,
      2,
    )}\n`,
  )

  await install(directory)
  await command('node', ['smoke.mjs'], directory)
  await command('pnpm', ['exec', 'tsc', '--noEmit'], directory)
  console.log('Packed Node + React consumer passed')
}

async function verifyNextConsumer() {
  const directory = join(consumersRoot, 'next')
  await command(
    'node',
    [join(root, 'packages/create-appkit/dist/index.js'), directory, '--yes', '--no-install', '--no-git'],
    root,
  )
  const manifestPath = join(directory, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (tarballs[name]) manifest.dependencies[name] = tarballs[name]
  }
  manifest.pnpm = { overrides: tarballs }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await install(directory)
  await command('pnpm', ['typecheck'], directory)
  await command('pnpm', ['build'], directory, 180_000)
  console.log('Packed create-appkit Next.js consumer passed')
}

async function install(directory) {
  await command('pnpm', ['install', '--ignore-workspace'], directory, 180_000)
}

async function command(executable, args, cwd, timeout = 120_000) {
  try {
    return await run(executable, args, { cwd, timeout, maxBuffer: 30 * 1024 * 1024 })
  } catch (error) {
    if (error && typeof error === 'object') {
      if ('stdout' in error && error.stdout) console.error(error.stdout)
      if ('stderr' in error && error.stderr) console.error(error.stderr)
    }
    throw error
  }
}
