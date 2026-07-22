import type { JobsOptions, Processor } from 'bullmq'
import type { TenantJobScope } from './identity'
import { assertTenantJobScope } from './identity'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertString } from './validation'

export const MIGRATION_QUEUE = 'migration'

export const MIGRATION_QUEUE_PROFILE = {
  name: MIGRATION_QUEUE,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 120_000 },
    removeOnComplete: { age: 30 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 2,
} as const

export type MigrationJobData = TenantJobScope & {
  connectionId: string
  mode: 'full_migration' | 'mirror' | 'attachments'
  triggeredBy?: string
}

export function assertMigrationJobData(data: MigrationJobData): void {
  assertTenantJobScope(data, 'Migration')
  assertString(data.connectionId, 'Migration connectionId', { min: 1, max: 200 })
  if (!['full_migration', 'mirror', 'attachments'].includes(data.mode)) {
    throw new Error('Migration mode is invalid.')
  }
  if (data.triggeredBy !== undefined) assertString(data.triggeredBy, 'Migration triggeredBy', { min: 1, max: 200 })
}

export function createMigrationQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: ReturnType<typeof createProfileQueue<MigrationJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<MigrationJobData>(jobs, MIGRATION_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueMigration(data: MigrationJobData, options?: JobsOptions) {
      assertMigrationJobData(data)
      return getQueue().add(data.mode, data, options)
    },
    createWorker<R>(processor: Processor<MigrationJobData, R>) {
      return createProfileWorker(jobs, MIGRATION_QUEUE_PROFILE, processor, overrides)
    },
  }
}
