import type { JobsOptions, Processor } from 'bullmq'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import { assertString, assertUuid } from './validation'

export const SANDBOX_QUEUE = 'sandbox'

export const SANDBOX_QUEUE_PROFILE = {
  name: SANDBOX_QUEUE,
  defaultJobOptions: {
    // Clone/refresh operations can leave partial state and are not safe to retry blindly.
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 1,
} as const

type SandboxSourceIdentity =
  | { productionTenantId: string; productionOrgId?: never }
  | { productionOrgId: string; productionTenantId?: never }

export type SandboxJobData =
  | (SandboxSourceIdentity & {
      op: 'create'
      name: string
      tier: 'dev' | 'masked' | 'full' | 'as_of'
      masked: boolean
      asOfPeriodId?: string | null
      createdBy?: string | null
    })
  | { op: 'refresh'; sandboxId: string; keepCustomizations: boolean }
  | { op: 'reset'; sandboxId: string }
  | { op: 'delete'; sandboxId: string }

export function assertSandboxJobData(data: SandboxJobData): void {
  if (data.op === 'create') {
    const sourceId = data.productionTenantId ?? data.productionOrgId
    if (!sourceId || (data.productionTenantId && data.productionOrgId)) {
      throw new Error('Sandbox create must contain exactly one production tenant identity.')
    }
    assertUuid(sourceId, 'Sandbox production tenant identity')
    assertString(data.name, 'Sandbox name', { min: 1, max: 200 })
    if (!['dev', 'masked', 'full', 'as_of'].includes(data.tier)) throw new Error('Sandbox tier is invalid.')
    if (data.asOfPeriodId != null) assertString(data.asOfPeriodId, 'Sandbox asOfPeriodId', { min: 1, max: 200 })
    if (data.createdBy != null) assertString(data.createdBy, 'Sandbox createdBy', { min: 1, max: 200 })
    return
  }
  assertUuid(data.sandboxId, 'Sandbox sandboxId')
}

export function createSandboxQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: ReturnType<typeof createProfileQueue<SandboxJobData>> | undefined
  const getQueue = () => queue ??= createProfileQueue<SandboxJobData>(jobs, SANDBOX_QUEUE_PROFILE, overrides)
  return {
    getQueue,
    async enqueueSandboxOp(data: SandboxJobData, options?: JobsOptions) {
      assertSandboxJobData(data)
      return getQueue().add(data.op, data, options)
    },
    createWorker<R>(processor: Processor<SandboxJobData, R>) {
      return createProfileWorker(jobs, SANDBOX_QUEUE_PROFILE, processor, overrides)
    },
  }
}
