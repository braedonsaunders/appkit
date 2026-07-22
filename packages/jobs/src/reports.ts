import type { JobsOptions, Processor } from 'bullmq'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertJsonBytes, assertString, assertUuid } from './validation'

export const REPORTS_QUEUE = 'reports'

export const REPORT_RUN_QUEUE_PROFILE = {
  name: REPORTS_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 2,
} as const

export const REPORT_DELIVERY_QUEUE_PROFILE = {
  name: REPORTS_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 7 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 3,
} as const

/** Durable scheduled-report claim used by the production scheduler/worker pair. */
export type ReportRunJobData = {
  tenantId: string
  scheduleId: string
  runId: string
}

/** Render-and-deliver report job used by definition-driven applications. */
export type ReportDeliveryJobData = {
  orgId: string
  definitionId: string
  scheduleId?: string
  recipients: string[]
  params?: Record<string, string>
}

export function assertReportRunJobData(data: ReportRunJobData): void {
  assertUuid(data.tenantId, 'Report tenantId')
  assertUuid(data.scheduleId, 'Report scheduleId')
  assertUuid(data.runId, 'Report runId')
}

export function reportRunJobId(data: ReportRunJobData): string {
  return `report-run|${data.runId}`
}

export function assertReportDeliveryJobData(data: ReportDeliveryJobData): void {
  assertUuid(data.orgId, 'Report organization identity')
  assertString(data.definitionId, 'Report definitionId', { min: 1, max: 200 })
  if (data.scheduleId !== undefined) assertString(data.scheduleId, 'Report scheduleId', { min: 1, max: 200 })
  if (!Array.isArray(data.recipients) || data.recipients.length === 0 || data.recipients.length > 1_000) {
    throw new Error('Report recipients must contain between 1 and 1000 entries.')
  }
  for (const recipient of data.recipients) assertString(recipient, 'Report recipient', { min: 1, max: 254 })
  if (data.params) {
    if (Object.keys(data.params).length > 200) throw new Error('Report params exceed the 200-field limit.')
    for (const [key, value] of Object.entries(data.params)) {
      assertString(key, 'Report param key', { min: 1, max: 200 })
      assertString(value, 'Report param value', { max: 10_000 })
    }
    assertJsonBytes(data.params, 'Report params', 256 * 1_024)
  }
}

export function createReportRunQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: ReturnType<typeof createProfileQueue<ReportRunJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<ReportRunJobData>(jobs, REPORT_RUN_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueReportRun(data: ReportRunJobData) {
      assertReportRunJobData(data)
      return getQueue().add('run', data, { jobId: reportRunJobId(data) })
    },
    createWorker<R>(processor: Processor<ReportRunJobData, R>) {
      return createProfileWorker(jobs, REPORT_RUN_QUEUE_PROFILE, processor, overrides)
    },
  }
}

export function createReportDeliveryQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: ReturnType<typeof createProfileQueue<ReportDeliveryJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<ReportDeliveryJobData>(jobs, REPORT_DELIVERY_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueReportRun(data: ReportDeliveryJobData, options?: JobsOptions) {
      assertReportDeliveryJobData(data)
      return getQueue().add('run', data, options)
    },
    createWorker<R>(processor: Processor<ReportDeliveryJobData, R>) {
      return createProfileWorker(jobs, REPORT_DELIVERY_QUEUE_PROFILE, processor, overrides)
    },
  }
}
