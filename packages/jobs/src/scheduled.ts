import type { JobsOptions, Processor } from 'bullmq'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertUuid } from './validation'

export const SCHEDULED_QUEUE = 'scheduled'

export const SCHEDULED_QUEUE_PROFILE = {
  name: SCHEDULED_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 24 * 3_600 },
    removeOnFail: { age: 7 * 24 * 3_600 },
  },
  workerConcurrency: 5,
} as const

export type ScheduledTick =
  | { kind: 'form_session_overdue_scan' }
  | { kind: 'report_schedule_scan' }
  | { kind: 'compliance_scan' }
  | { kind: 'escalation_scan' }
  | { kind: 'digest_scan' }
  | { kind: 'scheduled_flow_scan' }
  | { kind: 'sync_scan' }
  | { kind: 'sync_run'; tenantId: string; connectionId: string; trigger: 'scheduled' | 'manual' }
  | { kind: 'db_maintenance'; trigger?: 'scheduled' | 'manual' }
  | { kind: 'domain_event_outbox_scan' }
  | { kind: 'storage_object_deletion_scan' }
  | { kind: 'office_render_reconcile' }

const SCHEDULED_KINDS = new Set<ScheduledTick['kind']>([
  'form_session_overdue_scan',
  'report_schedule_scan',
  'compliance_scan',
  'escalation_scan',
  'digest_scan',
  'scheduled_flow_scan',
  'sync_scan',
  'sync_run',
  'db_maintenance',
  'domain_event_outbox_scan',
  'storage_object_deletion_scan',
  'office_render_reconcile',
])

export function isProductionScheduledTick(data: { kind: string }): data is ScheduledTick {
  return SCHEDULED_KINDS.has(data.kind as ScheduledTick['kind'])
}

export function assertScheduledTick(data: ScheduledTick): void {
  if (!data || typeof data !== 'object' || !SCHEDULED_KINDS.has(data.kind)) {
    throw new Error('Scheduled job kind is invalid.')
  }
  if (data.kind === 'sync_run') {
    assertUuid(data.tenantId, 'Sync tenantId')
    assertUuid(data.connectionId, 'Sync connectionId')
    if (data.trigger !== 'scheduled' && data.trigger !== 'manual') throw new Error('Sync trigger is invalid.')
  } else if (data.kind === 'db_maintenance') {
    if (data.trigger !== undefined && data.trigger !== 'scheduled' && data.trigger !== 'manual') {
      throw new Error('Database maintenance trigger is invalid.')
    }
  }
}

function omitJobId(options?: JobsOptions): JobsOptions {
  if (!options) return {}
  const normalized = { ...options }
  delete normalized.jobId
  return normalized
}

export function scheduledJobOptions(data: ScheduledTick, options?: JobsOptions): JobsOptions | undefined {
  if (data.kind === 'sync_run') {
    return {
      ...options,
      jobId: `sync-run|${data.tenantId}|${data.connectionId}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  }
  if (data.kind === 'db_maintenance') {
    return { ...omitJobId(options), deduplication: { id: 'db-maintenance' } }
  }
  return options
}

export type ScheduledDefinition<TTick extends { kind: string } = ScheduledTick> = {
  name: string
  data: TTick
  pattern: string
  jobId: string
  repeatKey: string
}

export const PRODUCTION_SCHEDULES: readonly ScheduledDefinition[] = [
  { name: 'tick:form_session', data: { kind: 'form_session_overdue_scan' }, pattern: '* * * * *', jobId: 'tick:form_session_overdue', repeatKey: 'tick-form-session-overdue' },
  { name: 'tick:reports', data: { kind: 'report_schedule_scan' }, pattern: '*/5 * * * *', jobId: 'tick:reports', repeatKey: 'tick-reports' },
  { name: 'tick:compliance_scan', data: { kind: 'compliance_scan' }, pattern: '* * * * *', jobId: 'tick:compliance_scan', repeatKey: 'tick-compliance-scan' },
  { name: 'tick:escalation', data: { kind: 'escalation_scan' }, pattern: '30 6 * * *', jobId: 'tick:escalation', repeatKey: 'tick-escalation' },
  { name: 'tick:digest', data: { kind: 'digest_scan' }, pattern: '5 * * * *', jobId: 'tick:digest', repeatKey: 'tick-digest' },
  { name: 'tick:scheduled_flow', data: { kind: 'scheduled_flow_scan' }, pattern: '* * * * *', jobId: 'tick:scheduled_flow', repeatKey: 'tick-scheduled-flow' },
  { name: 'tick:sync_scan', data: { kind: 'sync_scan' }, pattern: '*/15 * * * *', jobId: 'tick:sync_scan', repeatKey: 'tick-sync-scan' },
  { name: 'tick:db_maintenance', data: { kind: 'db_maintenance', trigger: 'scheduled' }, pattern: '30 3 * * *', jobId: 'tick:db_maintenance', repeatKey: 'tick-db-maintenance' },
  { name: 'tick:domain_event_outbox', data: { kind: 'domain_event_outbox_scan' }, pattern: '* * * * *', jobId: 'tick:domain_event_outbox', repeatKey: 'tick-domain-event-outbox' },
  { name: 'tick:storage_object_deletion', data: { kind: 'storage_object_deletion_scan' }, pattern: '* * * * *', jobId: 'tick:storage_object_deletion', repeatKey: 'tick-storage-object-deletion' },
  { name: 'tick:office_render_reconcile', data: { kind: 'office_render_reconcile' }, pattern: '*/5 * * * *', jobId: 'tick:office_render_reconcile', repeatKey: 'tick-office-render-reconcile' },
]

export type ExistingRepeatableJob = { key: string; name?: string; pattern?: string | null }

export function unconfiguredScheduleKeys(
  repeatables: readonly ExistingRepeatableJob[],
  schedules: readonly ScheduledDefinition<{ kind: string }>[] = PRODUCTION_SCHEDULES,
): string[] {
  return repeatables
    .filter((job) => schedules.every((expected) => job.key !== expected.repeatKey || job.name !== expected.name || job.pattern !== expected.pattern))
    .map((job) => job.key)
}

export type ScheduledQueueOptions<TCustom extends { kind: string } = never> = QueueProfileOverrides & {
  schedules?: readonly ScheduledDefinition<ScheduledTick | TCustom>[]
  validateCustomTick?: (data: TCustom) => void
}

export function createScheduledQueue<TCustom extends { kind: string } = never>(
  jobs: Jobs,
  options: ScheduledQueueOptions<TCustom> = {},
) {
  type Tick = ScheduledTick | TCustom
  let queue: ReturnType<typeof createProfileQueue<Tick>> | undefined
  const schedules = options.schedules ?? PRODUCTION_SCHEDULES
  const getQueue = () => queue ??= createProfileQueue<Tick>(jobs, SCHEDULED_QUEUE_PROFILE, options)

  async function enqueueScheduled(name: string, data: Tick, jobOptions?: JobsOptions) {
    if (!name || name.length > 100) throw new Error('Scheduled job name is invalid.')
    if (isProductionScheduledTick(data)) assertScheduledTick(data)
    else if (options.validateCustomTick) options.validateCustomTick(data as TCustom)
    else throw new Error('Scheduled custom job kind requires a validator.')
    return getQueue().add(name, data, isProductionScheduledTick(data) ? scheduledJobOptions(data, jobOptions) : jobOptions)
  }

  async function registerSchedules() {
    const target = getQueue()
    const repeatables = await target.getRepeatableJobs()
    for (const key of unconfiguredScheduleKeys(repeatables, schedules)) {
      await target.removeRepeatableByKey(key)
    }
    for (const schedule of schedules) {
      await enqueueScheduled(schedule.name, schedule.data, {
        repeat: { pattern: schedule.pattern, key: schedule.repeatKey },
        jobId: schedule.jobId,
      })
    }
  }

  return {
    getQueue,
    enqueueScheduled,
    registerSchedules,
    createWorker<R>(processor: Processor<Tick, R>) {
      return createProfileWorker(jobs, SCHEDULED_QUEUE_PROFILE, processor, options)
    },
  }
}
