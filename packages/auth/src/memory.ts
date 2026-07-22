import type {
  InviteGrantPayload,
  InviteRecord,
  InviteStore,
} from './invites'
import { evaluateInviteAccess } from './invites'

export type MemoryInviteStore = InviteStore & {
  records: Map<string, InviteRecord>
}

/** Deterministic adapter for tests, local apps, and database-free demos. */
export function createMemoryInviteStore(seed: InviteRecord[] = []): MemoryInviteStore {
  const records = new Map(seed.map((record) => [record.membershipId, structuredClone(record)]))
  return {
    records,
    async inspect(membershipId) {
      const record = records.get(membershipId)
      return record ? structuredClone(record) : null
    },
    async accept(payload: InviteGrantPayload, sessionUserId: string) {
      const record = records.get(payload.membershipId) ?? null
      const state = evaluateInviteAccess(payload, sessionUserId, record)
      if (state !== 'pending' || !record) return state
      records.set(record.membershipId, {
        ...record,
        status: 'active',
      })
      return 'active'
    },
  }
}
