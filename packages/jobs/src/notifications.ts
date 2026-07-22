import { createHash } from 'node:crypto'
import { Queue, type JobsOptions } from 'bullmq'
import type { Jobs } from './index'
import {
  assertIdentifier,
  assertJsonBytes,
  assertOptionalString,
  assertQueueJobId,
  assertRelativeAppPath,
  assertString,
  assertUuid,
} from './validation'

/** Source-compatible job data for the production multi-channel dispatcher. */
export type NotifyJobData = {
  tenantId: string
  userIds: string[]
  category: string
  type: string
  title: string
  body?: string
  linkPath?: string
  data?: Record<string, unknown>
  isCritical?: boolean
  channels?: ('in_app' | 'email' | 'push' | 'sms')[]
}

export type PushJobData = {
  tenantId: string
  userId: string
  subscriptionId: string
  title: string
  body?: string
  linkPath?: string
}

export type NotificationQueueJob<T> = { name: string; data: T; opts: JobsOptions }

const MAX_USERS_PER_JOB = 250
const MAX_USERS_PER_ENQUEUE = 100_000
const MAX_JOBS_PER_ADD_BULK = 40
const CHANNELS = new Set<NonNullable<NotifyJobData['channels']>[number]>(['in_app', 'email', 'push', 'sms'])

export function normalizeNotifyJobData(data: NotifyJobData): NotifyJobData {
  assertUuid(data.tenantId, 'Notification tenantId')
  if (!Array.isArray(data.userIds)) throw new Error('Notification userIds must be an array.')
  const userIds = [...new Set(data.userIds.map((id) => id.trim()).filter(Boolean))]
  if (userIds.length === 0 || userIds.length > MAX_USERS_PER_ENQUEUE) throw new Error(`Notification userIds must contain between 1 and ${MAX_USERS_PER_ENQUEUE} recipients.`)
  for (const id of userIds) assertString(id, 'Notification userId', { min: 1, max: 200 })
  assertIdentifier(data.category, 'Notification category', 100)
  assertIdentifier(data.type, 'Notification type', 150)
  assertString(data.title, 'Notification title', { min: 1, max: 500 })
  assertOptionalString(data.body, 'Notification body', 20_000)
  assertRelativeAppPath(data.linkPath, 'Notification linkPath')
  assertJsonBytes(data.data ?? {}, 'Notification data', 64 * 1_024)
  if (data.channels && (data.channels.length === 0 || data.channels.length > CHANNELS.size || data.channels.some((channel) => !CHANNELS.has(channel)))) throw new Error('Notification channels are invalid.')
  return { ...data, userIds, channels: data.channels ? [...new Set(data.channels)] : undefined }
}

export function buildNotifyQueueJobs(data: NotifyJobData, options: JobsOptions = {}): NotificationQueueJob<NotifyJobData>[] {
  const normalized = normalizeNotifyJobData(data)
  assertQueueJobId(options.jobId, 'Notification jobId')
  if (normalized.userIds.length <= MAX_USERS_PER_JOB) return [{ name: 'dispatch', data: normalized, opts: options }]
  const jobs: NotificationQueueJob<NotifyJobData>[] = []
  for (let offset = 0; offset < normalized.userIds.length; offset += MAX_USERS_PER_JOB) {
    const userIds = normalized.userIds.slice(offset, offset + MAX_USERS_PER_JOB)
    const jobId = options.jobId ? `notification-batch|${createHash('sha256').update(`${normalized.tenantId}\0${options.jobId}\0${userIds.join('\0')}`).digest('hex')}` : undefined
    jobs.push({ name: 'dispatch', data: { ...normalized, userIds }, opts: { ...options, ...(jobId ? { jobId } : {}) } })
  }
  return jobs
}

export function assertPushJobData(data: PushJobData): void {
  assertUuid(data.tenantId, 'Push tenantId')
  assertString(data.userId, 'Push userId', { min: 1, max: 200 })
  assertUuid(data.subscriptionId, 'Push subscriptionId')
  assertString(data.title, 'Push title', { min: 1, max: 500 })
  assertOptionalString(data.body, 'Push body', 20_000)
  assertRelativeAppPath(data.linkPath, 'Push linkPath')
}

/**
 * Bind the two production notification queues to an application-owned Jobs
 * runtime. Queue construction remains lazy, so importing this module never
 * contacts Redis during builds or server-component analysis.
 */
export function createNotificationQueues(jobs: Jobs) {
  let notifyQueue: Queue<NotifyJobData> | undefined
  let pushQueue: Queue<PushJobData> | undefined
  const getNotifyQueue = () => notifyQueue ??= new Queue<NotifyJobData>('notifications', {
    connection: jobs.getConnection(),
    defaultJobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 5_000 }, removeOnComplete: { age: 24 * 3_600 }, removeOnFail: { age: 7 * 24 * 3_600 } },
  })
  const getPushQueue = () => pushQueue ??= new Queue<PushJobData>('push', {
    connection: jobs.getConnection(),
    defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: { age: 24 * 3_600 }, removeOnFail: { age: 30 * 24 * 3_600 } },
  })
  return {
    async enqueueNotification(data: NotifyJobData, options?: JobsOptions) {
      const queue = getNotifyQueue()
      const definitions = buildNotifyQueueJobs(data, options)
      if (definitions.length === 1) return queue.add(definitions[0]!.name, definitions[0]!.data, definitions[0]!.opts)
      const added = []
      for (let offset = 0; offset < definitions.length; offset += MAX_JOBS_PER_ADD_BULK) added.push(...await queue.addBulk(definitions.slice(offset, offset + MAX_JOBS_PER_ADD_BULK)))
      return added
    },
    async enqueuePush(data: PushJobData, jobId: string) {
      assertPushJobData(data)
      assertQueueJobId(jobId, 'Push jobId')
      return getPushQueue().add('send', data, { jobId })
    },
  }
}
