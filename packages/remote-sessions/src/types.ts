export type RemoteProtocol = 'rdp' | 'vnc' | 'ssh' | 'winrm' | 'powershell-ssh' | 'telnet'
export const REMOTE_PROTOCOLS: readonly RemoteProtocol[] = ['rdp', 'vnc', 'ssh', 'winrm', 'powershell-ssh', 'telnet']
export type RemoteSurfaceKind = 'computer' | 'terminal'
export type RemoteControlScope = 'observe' | 'control'
export type RemoteSessionStatus = 'opening' | 'connected' | 'idle' | 'closed' | 'failed'

export interface RemoteTarget {
  id: string
  tenantId: string
  name: string
  host: string
  port: number
  protocol: RemoteProtocol
  credentialRef?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface RemoteSession {
  id: string
  tenantId: string
  targetId: string
  runId: string | null
  personId: string | null
  kind: RemoteSurfaceKind
  protocol: RemoteProtocol
  status: RemoteSessionStatus
  providerSessionId: string | null
  openedAt: string
  connectedAt: string | null
  closedAt: string | null
  lastActivityAt: string
  lastError: string | null
}

export interface RemoteLease {
  id: string
  tenantId: string
  sessionId: string
  holder: string
  purpose: string
  scope: RemoteControlScope
  exclusive: boolean
  grantedAt: string
  expiresAt: string
  fence: number
}

export type RemoteSessionEventDetail =
  | { kind: 'session_opened'; surface: RemoteSurfaceKind; protocol: RemoteProtocol }
  | { kind: 'session_connected'; providerSessionId: string }
  | { kind: 'session_failed'; message: string }
  | { kind: 'session_closed'; reason: 'completed' | 'cancelled' | 'operator' | 'provider_lost' }
  | { kind: 'lease_granted'; leaseId: string; holder: string; scope: RemoteControlScope; fence: number }
  | { kind: 'lease_released'; leaseId: string; reason: 'released' | 'expired' | 'revoked' }
  | { kind: 'handover_started'; leaseId: string; actor: string | null; scope: RemoteControlScope }
  | { kind: 'handover_ended'; leaseId: string; actor: string | null; durationMs: number }
  | { kind: 'command_started'; commandId: string; command: string; protocol: RemoteProtocol }
  | { kind: 'command_output'; commandId: string; stream: 'stdout' | 'stderr'; text: string }
  | { kind: 'command_completed'; commandId: string; exitCode: number | null; signal: string | null }
  | { kind: 'control_started'; actionId: string; action: RemoteComputerAction['action']; label: string | null }
  | { kind: 'control_completed'; actionId: string; ok: boolean; message: string | null }
  | { kind: 'frame'; frameId: string; mimeType: string; width: number; height: number }

export type RemoteSessionEvent = RemoteSessionEventDetail & {
  id: string
  tenantId: string
  sessionId: string
  seq: number
  at: string
}

export interface RemoteViewerConnection {
  /** A short-lived, audience-bound URL. Applications should prefer same-origin exchange routes. */
  url: string
  expiresAt: string
}

export interface RemoteProviderOpenRequest {
  session: RemoteSession
  target: RemoteTarget
  credential: string | null
  scope: RemoteControlScope
  signal: AbortSignal
}

export interface RemoteProviderOpenResult {
  providerSessionId: string
}

export interface RemoteCommandRequest {
  commandId: string
  session: RemoteSession
  target: RemoteTarget
  credential: string | null
  command: string
  cwd?: string
  signal: AbortSignal
}

export type RemoteCommandChunk =
  | { kind: 'stdout' | 'stderr'; text: string }
  | { kind: 'exit'; exitCode: number | null; signal: string | null }

export type RemoteComputerAction =
  | { action: 'snapshot'; label?: string }
  | { action: 'click' | 'double_click'; x: number; y: number; label?: string }
  | { action: 'drag'; fromX: number; fromY: number; toX: number; toY: number; durationMs?: number; label?: string }
  | { action: 'scroll'; x: number; y: number; direction: 'up' | 'down'; amount?: number; label?: string }
  | { action: 'type'; text: string; label?: string }
  | { action: 'key'; key: string; label?: string }
  | { action: 'wait'; durationMs?: number; label?: string }

export interface RemoteComputerActionResult {
  ok: boolean
  message?: string
  frame?: { mimeType: string; data: string; width?: number; height?: number }
}

export interface RemoteSessionProvider {
  open(request: RemoteProviderOpenRequest): Promise<RemoteProviderOpenResult>
  viewer(request: {
    session: RemoteSession
    lease: RemoteLease
    target: RemoteTarget
    credential: string | null
    signal: AbortSignal
  }): Promise<RemoteViewerConnection>
  command?(request: RemoteCommandRequest): AsyncIterable<RemoteCommandChunk>
  control?(request: { session: RemoteSession; target: RemoteTarget; credential: string | null; action: RemoteComputerAction; signal: AbortSignal }): Promise<RemoteComputerActionResult>
  close(request: { session: RemoteSession; target: RemoteTarget; credential: string | null; reason: string; signal: AbortSignal }): Promise<void>
}

export interface RemoteSessionStore {
  createSession(session: RemoteSession): Promise<void>
  updateSession(session: RemoteSession): Promise<void>
  getSession(tenantId: string, sessionId: string): Promise<RemoteSession | null>
  appendLease(lease: RemoteLease): Promise<void>
  getLease(tenantId: string, leaseId: string): Promise<RemoteLease | null>
  appendEvent(event: RemoteSessionEvent): Promise<void>
  eventsAfter(tenantId: string, sessionId: string, afterSeq: number, limit: number): Promise<RemoteSessionEvent[]>
  nextEventSeq(tenantId: string, sessionId: string): Promise<number>
  nextFence(tenantId: string, sessionId: string): Promise<number>
  isLeaseActive(tenantId: string, leaseId: string, now: string): Promise<boolean>
  /** Atomically returns true once for a grant id and false for every replay. */
  consumeGrant(tenantId: string, grantId: string, expiresAt: string): Promise<boolean>
}

export interface RemoteSessionPolicy {
  allowOpen(input: { session: RemoteSession; target: RemoteTarget; scope: RemoteControlScope }): Promise<boolean> | boolean
  allowCommand(input: { session: RemoteSession; target: RemoteTarget; command: string }): Promise<boolean> | boolean
  allowViewer(input: { session: RemoteSession; lease: RemoteLease; target: RemoteTarget }): Promise<boolean> | boolean
}

export interface RemoteViewerGrantClaims {
  tenantId: string
  sessionId: string
  leaseId: string
  holder: string
  scope: RemoteControlScope
  grantId: string
  issuedAt: number
  expiresAt: number
}
