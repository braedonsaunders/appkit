import { Redis } from 'ioredis'
import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor, type WorkerOptions } from 'bullmq'

/**
 * A BullMQ + Redis harness generalized behind a factory. Producers and blocking consumers need
 * opposite retry semantics: web/scheduler publishers must fail in bounded time
 * when Redis is down (`maxRetriesPerRequest: 1`); workers must keep their
 * blocking connection alive so BullMQ resumes after an outage
 * (`maxRetriesPerRequest: null`). Both stay lazy — importing a queue must not
 * connect (production builds walk the graph without Redis running).
 */
export type Jobs = {
  getConnection: () => ConnectionOptions
  getBlockingConnection: () => ConnectionOptions
  defineQueue: <T = unknown>(name: string, defaultJobOptions?: JobsOptions) => Queue<T>
  createWorker: <T = unknown, R = unknown>(
    name: string,
    processor: Processor<T, R>,
    options?: Omit<WorkerOptions, 'connection'>,
  ) => Worker<T, R>
  closeJobConnections: () => Promise<void>
}

/**
 * Retention every `defineQueue` queue gets unless the caller overrides it.
 * BullMQ keeps finished jobs forever by default, so a bare queue with a
 * repeating job grows Redis without bound: a ten-second heartbeat in one app
 * piled up 1.74 M completed jobs (1.6 GB) before anyone noticed. The bounds
 * match the profile queues: a week of completed history (capped at 10 000),
 * a month of failures. Callers that dedupe on `jobId` beyond that window, or
 * want tighter or looser bounds, pass their own `removeOnComplete` /
 * `removeOnFail` (`false` keeps everything, as before).
 */
export const DEFAULT_QUEUE_RETENTION = {
  removeOnComplete: { age: 7 * 24 * 3_600, count: 10_000 },
  removeOnFail: { age: 30 * 24 * 3_600 },
} satisfies JobsOptions

/** The default job options `defineQueue` applies: retention first, caller options on top. */
export function defineQueueJobOptions(defaultJobOptions: JobsOptions = {}): JobsOptions {
  return { ...DEFAULT_QUEUE_RETENTION, ...defaultJobOptions }
}

export function createJobs(opts: { redisUrl: string }): Jobs {
  let producer: Redis | undefined
  let blocking: Redis | undefined

  const getConnection = (): ConnectionOptions => {
    producer ??= new Redis(opts.redisUrl, { enableReadyCheck: false, maxRetriesPerRequest: 1 })
    return producer as unknown as ConnectionOptions
  }

  const getBlockingConnection = (): ConnectionOptions => {
    blocking ??= new Redis(opts.redisUrl, { enableReadyCheck: false, maxRetriesPerRequest: null })
    return blocking as unknown as ConnectionOptions
  }

  const defineQueue = <T = unknown>(name: string, defaultJobOptions?: JobsOptions): Queue<T> =>
    new Queue<T>(name, { connection: getConnection(), defaultJobOptions: defineQueueJobOptions(defaultJobOptions) })

  const createWorker = <T = unknown, R = unknown>(
    name: string,
    processor: Processor<T, R>,
    options?: Omit<WorkerOptions, 'connection'>,
  ): Worker<T, R> => new Worker<T, R>(name, processor, { connection: getBlockingConnection(), ...options })

  async function closeJobConnections(): Promise<void> {
    const connections = [producer, blocking].filter((c): c is Redis => Boolean(c))
    producer = undefined
    blocking = undefined
    const results = await Promise.allSettled(
      connections.map(async (c) => {
        try {
          await c.quit()
        } catch (error) {
          c.disconnect(false)
          throw error
        }
      }),
    )
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason)
    if (failures.length > 0) {
      throw new AggregateError(failures, 'One or more Redis connections failed to close cleanly')
    }
  }

  return { getConnection, getBlockingConnection, defineQueue, createWorker, closeJobConnections }
}

export { Queue, Worker, type ConnectionOptions, type Processor, type WorkerOptions } from 'bullmq'
export * from './health'
export * from './rate-limit'
export * from './validation'
export * from './web-push'
export * from './notifications'
export * from './identity'
export * from './profile'
export * from './email'
export * from './outbound'
export * from './pdf'
export * from './reports'
export * from './scheduled'
export * from './scripts'
export * from './sandbox'
export * from './migration'
export * from './capture'
