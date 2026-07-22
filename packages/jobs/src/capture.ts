import type { JobsOptions, Processor } from 'bullmq'
import type { TenantJobScope } from './identity'
import { assertTenantJobScope } from './identity'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertQueueJobId, assertString } from './validation'

export const CAPTURE_QUEUE = 'capture'

export const CAPTURE_QUEUE_PROFILE = {
  name: CAPTURE_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 30 * 24 * 3_600 },
    removeOnFail: { age: 90 * 24 * 3_600 },
  },
  workerConcurrency: 3,
} as const

type CaptureItemIdentity =
  | { itemId: string; captureItemId?: never }
  | { captureItemId: string; itemId?: never }

export type CaptureJobData = TenantJobScope & CaptureItemIdentity & { actorId?: string }

export function captureItemId(data: CaptureJobData): string {
  const itemId = data.itemId ?? data.captureItemId
  if (!itemId || (data.itemId && data.captureItemId)) {
    throw new Error('Capture job must contain exactly one item identity.')
  }
  return itemId
}

export function assertCaptureJobData(data: CaptureJobData): void {
  assertTenantJobScope(data, 'Capture')
  assertString(captureItemId(data), 'Capture itemId', { min: 1, max: 200 })
  if (data.actorId !== undefined) assertString(data.actorId, 'Capture actorId', { min: 1, max: 200 })
}

export type CaptureQueueOptions = QueueProfileOverrides & { jobIdPrefix?: string }

export function captureJobId(data: CaptureJobData, prefix = 'capture'): string {
  assertString(prefix, 'Capture jobId prefix', { min: 1, max: 100, pattern: /^[A-Za-z0-9._|-]+$/ })
  return `${prefix}|${captureItemId(data)}`
}

export function createCaptureQueue(jobs: Jobs, options: CaptureQueueOptions = {}) {
  let queue: ReturnType<typeof createProfileQueue<CaptureJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<CaptureJobData>(jobs, CAPTURE_QUEUE_PROFILE, options)
  return {
    getQueue,
    async enqueueCapture(data: CaptureJobData, jobOptions?: JobsOptions) {
      assertCaptureJobData(data)
      const jobId = jobOptions?.jobId ?? captureJobId(data, options.jobIdPrefix)
      assertQueueJobId(jobId, 'Capture jobId')
      return getQueue().add('extract', data, { jobId: captureJobId(data, options.jobIdPrefix), ...jobOptions })
    },
    createWorker<R>(processor: Processor<CaptureJobData, R>) {
      return createProfileWorker(jobs, CAPTURE_QUEUE_PROFILE, processor, options)
    },
  }
}
