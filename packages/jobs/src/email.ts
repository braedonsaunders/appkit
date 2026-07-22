import { createHash } from 'node:crypto'
import type { JobsOptions, Processor } from 'bullmq'
import {
  normalizeEmailDeliveryInput,
  type EmailAttachmentPayload,
} from '@appkit/email-render/delivery-input'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'

export const EMAIL_QUEUE = 'emails'

export const EMAIL_QUEUE_PROFILE = {
  name: EMAIL_QUEUE,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 10,
} as const

export type EmailAttachment = EmailAttachmentPayload

export type EmailJobData<TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  /** Optional application identity used to resolve a tenant-owned provider. */
  tenantId?: string
  /** Compatible identity spelling used by organization-based applications. */
  orgId?: string
  /** One recipient per durable job prevents address disclosure between users. */
  to: string
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
  meta?: TMeta
}

export type EnqueueEmailData<TMeta extends Record<string, unknown> = Record<string, unknown>> =
  Omit<EmailJobData<TMeta>, 'to'> & { to: string | string[] }

export type EmailQueueJob<TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  name: 'send'
  data: EmailJobData<TMeta>
  opts?: JobsOptions
}

function fanoutOptions(options: JobsOptions | undefined, recipient: string): JobsOptions | undefined {
  if (!options?.jobId) return options
  const digest = createHash('sha256')
    .update(options.jobId)
    .update('\0')
    .update(recipient.toLowerCase())
    .digest('hex')
  return { ...options, jobId: `email-fanout|${digest}` }
}

/** Build one private durable job per normalized recipient without opening Redis. */
export function buildEmailQueueJobs<TMeta extends Record<string, unknown>>(
  data: EnqueueEmailData<TMeta>,
  options?: JobsOptions,
): EmailQueueJob<TMeta>[] {
  const normalized = normalizeEmailDeliveryInput(data)
  return normalized.to.map((recipient) => ({
    name: 'send',
    data: { ...data, ...normalized, to: recipient },
    opts: normalized.to.length === 1 ? options : fanoutOptions(options, recipient),
  }))
}

export function createEmailQueue<TMeta extends Record<string, unknown> = Record<string, unknown>>(
  jobs: Jobs,
  overrides: QueueProfileOverrides = {},
) {
  let queue: ReturnType<typeof createProfileQueue<EmailJobData<TMeta>>> | undefined
  const getQueue = () => queue ??= createProfileQueue<EmailJobData<TMeta>>(jobs, EMAIL_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueEmail(data: EnqueueEmailData<TMeta>, options?: JobsOptions) {
      const definitions = buildEmailQueueJobs(data, options)
      const target = getQueue()
      if (definitions.length === 1) {
        const job = definitions[0]!
        return [await target.add(job.name, job.data, job.opts)]
      }
      return target.addBulk(definitions)
    },
    createWorker<R>(processor: Processor<EmailJobData<TMeta>, R>) {
      return createProfileWorker(jobs, EMAIL_QUEUE_PROFILE, processor, overrides)
    },
  }
}
