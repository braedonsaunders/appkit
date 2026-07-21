import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

export type DomainEventRequestSignerOptions = {
  maxClockSkewMs?: number
  keyInfo?: string
}

export function createDomainEventRequestSigner(
  secret: string,
  options: DomainEventRequestSignerOptions = {},
) {
  if (secret.length < 32) throw new Error('Domain event request signing requires a 32+ character secret')
  const maxClockSkewMs = Math.max(1_000, options.maxClockSkewMs ?? 5 * 60_000)
  const signingKey = Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(secret),
    Buffer.from(options.keyInfo ?? 'appkit-domain-events'),
    Buffer.from('worker-to-application-v1'),
    32,
  ))

  function sign(eventId: string, timestamp: string): string {
    return createHmac('sha256', signingKey).update(`${timestamp}.${eventId}`).digest('base64url')
  }

  function verify(
    eventId: string,
    timestamp: string | null,
    signature: string | null,
    now: Date = new Date(),
  ): boolean {
    const sentAt = timestamp ? Number(timestamp) : Number.NaN
    if (!Number.isFinite(sentAt) || Math.abs(now.getTime() - sentAt) > maxClockSkewMs) return false
    if (!signature || !timestamp) return false
    const expected = Buffer.from(sign(eventId, timestamp), 'utf8')
    const actual = Buffer.from(signature, 'utf8')
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  return { sign, verify }
}

function defaultSigner() {
  const secret = process.env.APPKIT_SECRET
  if (!secret) throw new Error('APPKIT_SECRET is required for internal domain event requests')
  return createDomainEventRequestSigner(secret)
}

export function signDomainEventRequest(eventId: string, timestamp: string): string {
  return defaultSigner().sign(eventId, timestamp)
}

export function verifyDomainEventRequest(
  eventId: string,
  timestamp: string | null,
  signature: string | null,
  now: Date = new Date(),
): boolean {
  return defaultSigner().verify(eventId, timestamp, signature, now)
}
