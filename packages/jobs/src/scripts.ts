import type { JobsOptions, Processor } from 'bullmq'
import type { TenantJobScope } from './identity'
import { assertTenantJobScope } from './identity'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertString } from './validation'

export const SCRIPTS_QUEUE = 'scripts'

export const SCRIPTS_QUEUE_PROFILE = {
  name: SCRIPTS_QUEUE,
  defaultJobOptions: {
    // Authored scripts are not idempotent by contract and must never auto-retry.
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 4,
} as const

export type ScriptJobData = TenantJobScope & {
  scriptId: string
  kind: 'scheduled' | 'bulk'
  actorId?: string
}

export function assertScriptJobData(data: ScriptJobData): void {
  assertTenantJobScope(data, 'Script')
  assertString(data.scriptId, 'Script scriptId', { min: 1, max: 200 })
  if (data.kind !== 'scheduled' && data.kind !== 'bulk') throw new Error('Script job kind is invalid.')
  if (data.actorId !== undefined) assertString(data.actorId, 'Script actorId', { min: 1, max: 200 })
}

export function createScriptsQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: ReturnType<typeof createProfileQueue<ScriptJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<ScriptJobData>(jobs, SCRIPTS_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueScriptRun(data: ScriptJobData, options?: JobsOptions) {
      assertScriptJobData(data)
      return getQueue().add(data.kind, data, options)
    },
    createWorker<R>(processor: Processor<ScriptJobData, R>) {
      return createProfileWorker(jobs, SCRIPTS_QUEUE_PROFILE, processor, overrides)
    },
  }
}
