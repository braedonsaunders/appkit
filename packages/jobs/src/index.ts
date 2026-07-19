import { Redis } from 'ioredis'
import { Queue, Worker, type ConnectionOptions, type Processor, type WorkerOptions } from 'bullmq'

/**
 * A BullMQ + Redis harness (connection pattern copied from the beaconhs jobs
 * package, generalized into a factory). Producers and blocking consumers need
 * opposite retry semantics: web/scheduler publishers must fail in bounded time
 * when Redis is down (`maxRetriesPerRequest: 1`); workers must keep their
 * blocking connection alive so BullMQ resumes after an outage
 * (`maxRetriesPerRequest: null`). Both stay lazy — importing a queue must not
 * connect (production builds walk the graph without Redis running).
 */
export type Jobs = {
  getConnection: () => ConnectionOptions
  getBlockingConnection: () => ConnectionOptions
  defineQueue: <T = unknown>(name: string) => Queue<T>
  createWorker: <T = unknown>(
    name: string,
    processor: Processor<T>,
    options?: Omit<WorkerOptions, 'connection'>,
  ) => Worker<T>
  closeJobConnections: () => Promise<void>
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

  const defineQueue = <T = unknown>(name: string): Queue<T> =>
    new Queue<T>(name, { connection: getConnection() })

  const createWorker = <T = unknown>(
    name: string,
    processor: Processor<T>,
    options?: Omit<WorkerOptions, 'connection'>,
  ): Worker<T> => new Worker<T>(name, processor, { connection: getBlockingConnection(), ...options })

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
