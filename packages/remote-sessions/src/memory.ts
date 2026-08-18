import type { RemoteLease, RemoteSession, RemoteSessionEvent, RemoteSessionStore } from './types'

export function createMemoryRemoteSessionStore(now: () => number = Date.now): RemoteSessionStore {
  const sessions = new Map<string, RemoteSession>()
  const leases = new Map<string, RemoteLease>()
  const events = new Map<string, RemoteSessionEvent[]>()
  const fences = new Map<string, number>()
  const eventSequences = new Map<string, number>()
  const releasedLeases = new Set<string>()
  const grants = new Map<string, number>()
  const key = (tenantId: string, id: string) => `${tenantId}:${id}`

  return {
    async createSession(session) {
      const id = key(session.tenantId, session.id)
      if (sessions.has(id)) throw new Error(`Remote session ${session.id} already exists.`)
      sessions.set(id, structuredClone(session))
    },
    async updateSession(session) {
      const id = key(session.tenantId, session.id)
      if (!sessions.has(id)) throw new Error(`Remote session ${session.id} does not exist.`)
      sessions.set(id, structuredClone(session))
    },
    async getSession(tenantId, sessionId) {
      const session = sessions.get(key(tenantId, sessionId))
      return session ? structuredClone(session) : null
    },
    async appendLease(lease) {
      const id = key(lease.tenantId, lease.id)
      if (leases.has(id)) throw new Error(`Remote lease ${lease.id} already exists.`)
      leases.set(id, structuredClone(lease))
    },
    async getLease(tenantId, leaseId) {
      const lease = leases.get(key(tenantId, leaseId))
      return lease ? structuredClone(lease) : null
    },
    async appendEvent(event) {
      const id = key(event.tenantId, event.sessionId)
      const current = events.get(id) ?? []
      if (current.some((candidate) => candidate.id === event.id || candidate.seq === event.seq)) {
        throw new Error(`Remote event ${event.id} conflicts with immutable history.`)
      }
      current.push(structuredClone(event))
      current.sort((left, right) => left.seq - right.seq)
      events.set(id, current)
      if (event.kind === 'lease_released') releasedLeases.add(key(event.tenantId, event.leaseId))
    },
    async eventsAfter(tenantId, sessionId, afterSeq, limit) {
      return (events.get(key(tenantId, sessionId)) ?? [])
        .filter((event) => event.seq > afterSeq)
        .slice(0, Math.max(1, limit))
        .map((event) => structuredClone(event))
    },
    async nextEventSeq(tenantId, sessionId) {
      const id = key(tenantId, sessionId)
      const next = (eventSequences.get(id) ?? 0) + 1
      eventSequences.set(id, next)
      return next
    },
    async nextFence(tenantId, sessionId) {
      const id = key(tenantId, sessionId)
      const next = (fences.get(id) ?? 0) + 1
      fences.set(id, next)
      return next
    },
    async isLeaseActive(tenantId, leaseId, timestamp) {
      const lease = leases.get(key(tenantId, leaseId))
      return Boolean(lease && !releasedLeases.has(key(tenantId, leaseId)) && new Date(lease.expiresAt).getTime() > new Date(timestamp).getTime())
    },
    async consumeGrant(tenantId, grantId, expiresAt) {
      const timestamp = now()
      for (const [id, expiry] of grants) if (expiry <= timestamp) grants.delete(id)
      const id = key(tenantId, grantId)
      if (grants.has(id) || new Date(expiresAt).getTime() <= timestamp) return false
      grants.set(id, new Date(expiresAt).getTime())
      return true
    },
  }
}
