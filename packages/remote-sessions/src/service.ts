import { randomUUID } from 'node:crypto'
import type {
  RemoteCommandChunk,
  RemoteComputerAction,
  RemoteComputerActionResult,
  RemoteControlScope,
  RemoteLease,
  RemoteSession,
  RemoteSessionEvent,
  RemoteSessionEventDetail,
  RemoteSessionPolicy,
  RemoteSessionProvider,
  RemoteSessionStore,
  RemoteTarget,
  RemoteViewerConnection,
} from './types'

export interface RemoteSessionServiceOptions {
  store: RemoteSessionStore
  provider: RemoteSessionProvider
  policy: RemoteSessionPolicy
  resolveCredential?: (target: RemoteTarget) => Promise<string | null>
  resolveTarget?: (tenantId: string, targetId: string) => Promise<RemoteTarget | null>
  now?: () => Date
  idFactory?: () => string
}

export interface RemoteSessionService {
  open(input: { target: RemoteTarget; runId?: string; personId?: string; kind: 'computer' | 'terminal'; scope?: RemoteControlScope; signal?: AbortSignal }): Promise<RemoteSession>
  lease(input: { tenantId: string; sessionId: string; holder: string; purpose: string; scope: RemoteControlScope; ttlMs?: number }): Promise<RemoteLease>
  viewer(input: { tenantId: string; sessionId: string; leaseId: string; signal?: AbortSignal }): Promise<RemoteViewerConnection>
  command(input: { tenantId: string; sessionId: string; command: string; cwd?: string; signal?: AbortSignal }): Promise<{ commandId: string; exitCode: number | null; signal: string | null }>
  control(input: { tenantId: string; sessionId: string; action: RemoteComputerAction; signal?: AbortSignal }): Promise<{ actionId: string; result: RemoteComputerActionResult }>
  release(input: { tenantId: string; leaseId: string; reason?: 'released' | 'expired' | 'revoked' }): Promise<void>
  close(input: { tenantId: string; sessionId: string; reason?: 'completed' | 'cancelled' | 'operator' | 'provider_lost'; signal?: AbortSignal }): Promise<void>
}

export function createRemoteSessionService(options: RemoteSessionServiceOptions): RemoteSessionService {
  const now = options.now ?? (() => new Date())
  const id = options.idFactory ?? randomUUID
  const targets = new Map<string, RemoteTarget>()
  const abort = (signal?: AbortSignal) => signal ?? new AbortController().signal
  const timestamp = () => now().toISOString()

  async function append(session: RemoteSession, detail: RemoteSessionEventDetail): Promise<void> {
    const next = await options.store.nextEventSeq(session.tenantId, session.id)
    const event: RemoteSessionEvent = { ...detail, id: id(), tenantId: session.tenantId, sessionId: session.id, seq: next, at: timestamp() }
    await options.store.appendEvent(event)
  }

  async function load(tenantId: string, sessionId: string): Promise<{ session: RemoteSession; target: RemoteTarget }> {
    const session = await options.store.getSession(tenantId, sessionId)
    if (!session) throw new Error(`Remote session ${sessionId} was not found.`)
    const target = targets.get(`${tenantId}:${session.targetId}`) ?? await options.resolveTarget?.(tenantId, session.targetId)
    if (!target) throw new Error(`Remote target ${session.targetId} is unavailable to this service.`)
    return { session, target }
  }

  return {
    async open(input) {
      if (input.target.tenantId.trim() === '') throw new Error('Remote target tenant is required.')
      const openedAt = timestamp()
      const session: RemoteSession = {
        id: id(), tenantId: input.target.tenantId, targetId: input.target.id,
        runId: input.runId ?? null, personId: input.personId ?? null, kind: input.kind,
        protocol: input.target.protocol, status: 'opening', providerSessionId: null,
        openedAt, connectedAt: null, closedAt: null, lastActivityAt: openedAt, lastError: null,
      }
      const scope = input.scope ?? 'control'
      if (!(await options.policy.allowOpen({ session, target: input.target, scope }))) throw new Error('Remote session policy refused this connection.')
      targets.set(`${session.tenantId}:${session.targetId}`, structuredClone(input.target))
      await options.store.createSession(session)
      await append(session, { kind: 'session_opened', surface: input.kind, protocol: input.target.protocol })
      try {
        const credential = await options.resolveCredential?.(input.target) ?? null
        const opened = await options.provider.open({ session, target: input.target, credential, scope, signal: abort(input.signal) })
        const connected: RemoteSession = { ...session, status: 'connected', providerSessionId: opened.providerSessionId, connectedAt: timestamp(), lastActivityAt: timestamp() }
        await options.store.updateSession(connected)
        await append(connected, { kind: 'session_connected', providerSessionId: opened.providerSessionId })
        return connected
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failed: RemoteSession = { ...session, status: 'failed', lastError: message, lastActivityAt: timestamp() }
        await options.store.updateSession(failed)
        await append(failed, { kind: 'session_failed', message })
        throw error
      }
    },
    async lease(input) {
      const { session } = await load(input.tenantId, input.sessionId)
      if (session.status === 'closed' || session.status === 'failed') throw new Error('Closed remote sessions cannot be leased.')
      const fence = await options.store.nextFence(input.tenantId, input.sessionId)
      const lease: RemoteLease = {
        id: id(), tenantId: input.tenantId, sessionId: input.sessionId, holder: input.holder,
        purpose: input.purpose, scope: input.scope, exclusive: input.scope === 'control',
        grantedAt: timestamp(), expiresAt: new Date(now().getTime() + Math.max(10_000, Math.min(input.ttlMs ?? 15 * 60_000, 60 * 60_000))).toISOString(), fence,
      }
      await options.store.appendLease(lease)
      await append(session, { kind: 'lease_granted', leaseId: lease.id, holder: lease.holder, scope: lease.scope, fence })
      return lease
    },
    async viewer(input) {
      const { session, target } = await load(input.tenantId, input.sessionId)
      const lease = await options.store.getLease(input.tenantId, input.leaseId)
      if (!lease || lease.sessionId !== session.id || !(await options.store.isLeaseActive(input.tenantId, lease.id, timestamp()))) throw new Error('Remote viewer lease is no longer active.')
      if (!(await options.policy.allowViewer({ session, lease, target }))) throw new Error('Remote viewer policy refused this connection.')
      const credential = await options.resolveCredential?.(target) ?? null
      return options.provider.viewer({ session, lease, target, credential, signal: abort(input.signal) })
    },
    async command(input) {
      const { session, target } = await load(input.tenantId, input.sessionId)
      if (!options.provider.command) throw new Error('This remote session provider does not support terminal commands.')
      if (!(await options.policy.allowCommand({ session, target, command: input.command }))) throw new Error('Remote command policy refused this command.')
      const commandId = id()
      await append(session, { kind: 'command_started', commandId, command: input.command, protocol: target.protocol })
      const credential = await options.resolveCredential?.(target) ?? null
      let exitCode: number | null = null
      let exitSignal: string | null = null
      for await (const chunk of options.provider.command({ commandId, session, target, credential, command: input.command, cwd: input.cwd, signal: abort(input.signal) })) {
        const normalized: RemoteCommandChunk = chunk
        if (normalized.kind === 'exit') { exitCode = normalized.exitCode; exitSignal = normalized.signal }
        else await append(session, { kind: 'command_output', commandId, stream: normalized.kind, text: normalized.text })
      }
      await append(session, { kind: 'command_completed', commandId, exitCode, signal: exitSignal })
      return { commandId, exitCode, signal: exitSignal }
    },
    async control(input) {
      const { session, target } = await load(input.tenantId, input.sessionId)
      if (!options.provider.control) throw new Error('This remote session provider does not support computer control.')
      const actionId = id()
      await append(session, { kind: 'control_started', actionId, action: input.action.action, label: input.action.label ?? null })
      const credential = await options.resolveCredential?.(target) ?? null
      const result = await options.provider.control({ session, target, credential, action: input.action, signal: abort(input.signal) })
      await append(session, { kind: 'control_completed', actionId, ok: result.ok, message: result.message ?? null })
      if (result.frame) {
        await append(session, { kind: 'frame', frameId: actionId, mimeType: result.frame.mimeType, width: result.frame.width ?? 0, height: result.frame.height ?? 0 })
      }
      return { actionId, result }
    },
    async release(input) {
      const lease = await options.store.getLease(input.tenantId, input.leaseId)
      if (!lease) throw new Error(`Remote lease ${input.leaseId} was not found.`)
      if (!(await options.store.isLeaseActive(input.tenantId, lease.id, timestamp()))) return
      const { session } = await load(input.tenantId, lease.sessionId)
      await append(session, { kind: 'lease_released', leaseId: lease.id, reason: input.reason ?? 'released' })
    },
    async close(input) {
      const { session, target } = await load(input.tenantId, input.sessionId)
      if (session.status === 'closed') return
      const credential = await options.resolveCredential?.(target) ?? null
      await options.provider.close({ session, target, credential, reason: input.reason ?? 'completed', signal: abort(input.signal) })
      const closed: RemoteSession = { ...session, status: 'closed', closedAt: timestamp(), lastActivityAt: timestamp() }
      await options.store.updateSession(closed)
      await append(closed, { kind: 'session_closed', reason: input.reason ?? 'completed' })
    },
  }
}
