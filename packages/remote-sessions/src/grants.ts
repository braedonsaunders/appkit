import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { RemoteControlScope, RemoteViewerGrantClaims } from './types'

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function isScope(value: unknown): value is RemoteControlScope {
  return value === 'observe' || value === 'control'
}

export function issueRemoteViewerGrant(input: Omit<RemoteViewerGrantClaims, 'grantId' | 'issuedAt' | 'expiresAt'> & {
  ttlMs: number
}, secret: string, now = Date.now): string {
  if (secret.length < 32) throw new Error('Remote viewer grant secret must contain at least 32 characters.')
  const issuedAt = now()
  const claims: RemoteViewerGrantClaims = {
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    leaseId: input.leaseId,
    holder: input.holder,
    scope: input.scope,
    grantId: randomUUID(),
    issuedAt,
    expiresAt: issuedAt + Math.max(10_000, Math.min(input.ttlMs, 15 * 60_000)),
  }
  const payload = encode(JSON.stringify(claims))
  return `${payload}.${signature(payload, secret)}`
}

export function verifyRemoteViewerGrant(token: string, secret: string, now = Date.now): RemoteViewerGrantClaims {
  const [payload, supplied, extra] = token.split('.')
  if (!payload || !supplied || extra) throw new Error('Remote viewer grant is malformed.')
  const expected = signature(payload, secret)
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Remote viewer grant signature is invalid.')
  let raw: unknown
  try { raw = JSON.parse(decode(payload)) } catch { throw new Error('Remote viewer grant payload is invalid.') }
  if (!raw || typeof raw !== 'object') throw new Error('Remote viewer grant payload is invalid.')
  const claims = raw as Partial<RemoteViewerGrantClaims>
  if (
    typeof claims.tenantId !== 'string' || typeof claims.sessionId !== 'string' ||
    typeof claims.leaseId !== 'string' || typeof claims.holder !== 'string' ||
    typeof claims.grantId !== 'string' || typeof claims.issuedAt !== 'number' ||
    typeof claims.expiresAt !== 'number' || !isScope(claims.scope)
  ) throw new Error('Remote viewer grant claims are invalid.')
  if (claims.expiresAt <= now()) throw new Error('Remote viewer grant has expired.')
  return claims as RemoteViewerGrantClaims
}
