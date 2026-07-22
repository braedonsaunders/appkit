import { Queue, type JobsOptions, type Processor, type Worker } from 'bullmq'
import type { Jobs } from './index'

export type QueueProfile = {
  name: string
  defaultJobOptions: JobsOptions
  workerConcurrency: number
}

export type QueueProfileOverrides = {
  name?: string
  workerConcurrency?: number
}

export function createProfileQueue<T>(
  jobs: Jobs,
  profile: QueueProfile,
  overrides: QueueProfileOverrides = {},
): Queue<T> {
  return new Queue<T>(overrides.name ?? profile.name, {
    connection: jobs.getConnection(),
    defaultJobOptions: profile.defaultJobOptions,
  })
}

export function createProfileWorker<T, R = unknown>(
  jobs: Jobs,
  profile: QueueProfile,
  processor: Processor<T, R>,
  overrides: QueueProfileOverrides = {},
): Worker<T, R> {
  return jobs.createWorker<T, R>(overrides.name ?? profile.name, processor, {
    concurrency: overrides.workerConcurrency ?? profile.workerConcurrency,
  })
}
