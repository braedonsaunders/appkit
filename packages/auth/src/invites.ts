import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

const INVITE_GRANT_VERSION = 1
const DEFAULT_INVITE_TTL_SECONDS = 15 * 60
const MAX_GRANT_LENGTH = 4096

export type InviteGrantInput = {
  membershipId: string
  tenantId: string
  userId: string
  invitedAt: Date
}

export type InviteGrantPayload = {
  v: typeof INVITE_GRANT_VERSION
  membershipId: string
  tenantId: string
  userId: string
  invitedAt: number
  issuedAt: number
  expiresAt: number
}

export type InviteGrantVerification =
  | { ok: true; payload: InviteGrantPayload }
  | { ok: false; reason: 'invalid' | 'expired' }

export type InviteAccessState =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'tenant_unavailable'
  | 'unverified'
  | 'invalid'
  | 'expired'

export type InviteRecord = {
  membershipId: string
  tenantId: string
  tenantName: string
  userId: string
  invitedAt: Date | null
  status: 'active' | 'invited' | 'suspended'
  emailVerified: boolean
  tenantStatus: 'active' | 'suspended' | 'archived'
}

export type InviteInspection = {
  state: InviteAccessState
  tenantId: string | null
  tenantName: string | null
}

export type InviteStore = {
  /** Read-only inspection. This must never activate a membership. */
  inspect: (membershipId: string) => Promise<InviteRecord | null>
  /**
   * Atomically lock, re-evaluate, activate, and audit a pending membership.
   * The store receives the already signature-verified grant and must return the
   * final state so concurrent or superseded links cannot double-accept.
   */
  accept: (payload: InviteGrantPayload, sessionUserId: string) => Promise<InviteAccessState>
}

export type InviteServiceOptions = {
  secret: string
  store: InviteStore
  ttlSeconds?: number
  /** HKDF domain separation. Change this only when intentionally rotating formats. */
  signingContext?: string
  callbackPath?: string
}

export type InviteService = {
  ttlSeconds: number
  createInviteGrant: (input: InviteGrantInput, now?: number) => string
  verifyInviteGrant: (raw: string, now?: number) => InviteGrantVerification
  inviteCallbackPath: (grant: string) => string
  inviteGrantFromCallbackURL: (callbackURL: unknown, baseURL: string) => string | null
  acceptInviteAfterMagicLink: (rawGrant: string, sessionUserId: string) => Promise<InviteAccessState>
  inspectInviteForUser: (rawGrant: string, sessionUserId: string) => Promise<InviteInspection>
}

/**
 * The complete invitation grant flow extracted from the production runtime.
 * Better Auth's one-time magic-link token proves mailbox possession; this
 * independently signed grant binds that verified callback to exactly one
 * pending membership generation.
 */
export function createInviteService(options: InviteServiceOptions): InviteService {
  if (options.secret.length < 32) throw new Error('Invitation signing secret must contain at least 32 characters.')
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new Error('Invitation TTL must be a whole number of at least 60 seconds.')
  }
  const callbackPath = normalizeCallbackPath(options.callbackPath ?? '/invite/accept')
  const signingKey = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(options.secret),
      Buffer.alloc(0),
      Buffer.from(options.signingContext ?? 'appkit.invite.v1'),
      32,
    ),
  )
  const sign = (payload: string) => createHmac('sha256', signingKey).update(payload).digest()

  function createInviteGrant(input: InviteGrantInput, now = Date.now()): string {
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(input.invitedAt.getTime())) {
      throw new Error('Invalid invitation issuance time.')
    }
    for (const [name, value] of Object.entries({
      membershipId: input.membershipId,
      tenantId: input.tenantId,
      userId: input.userId,
    })) {
      if (!isBoundedString(value, name === 'userId' ? 200 : 100)) {
        throw new Error(`Invalid ${name}.`)
      }
    }
    const payload: InviteGrantPayload = {
      v: INVITE_GRANT_VERSION,
      membershipId: input.membershipId,
      tenantId: input.tenantId,
      userId: input.userId,
      invitedAt: input.invitedAt.getTime(),
      issuedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${encoded}.${sign(encoded).toString('base64url')}`
  }

  function verifyInviteGrant(raw: string, now = Date.now()): InviteGrantVerification {
    if (!raw || raw.length > MAX_GRANT_LENGTH || !Number.isSafeInteger(now)) {
      return { ok: false, reason: 'invalid' }
    }
    const separator = raw.lastIndexOf('.')
    if (separator <= 0 || separator === raw.length - 1) return { ok: false, reason: 'invalid' }
    const encoded = raw.slice(0, separator)
    const signature = raw.slice(separator + 1)
    let expected: Buffer
    let provided: Buffer
    try {
      expected = sign(encoded)
      provided = Buffer.from(signature, 'base64url')
    } catch {
      return { ok: false, reason: 'invalid' }
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { ok: false, reason: 'invalid' }
    }
    let payload: InviteGrantPayload | null = null
    try {
      payload = parsePayload(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')), ttlSeconds)
    } catch {
      return { ok: false, reason: 'invalid' }
    }
    if (!payload) return { ok: false, reason: 'invalid' }
    if (now < payload.issuedAt - 60_000 || now > payload.expiresAt) {
      return { ok: false, reason: 'expired' }
    }
    return { ok: true, payload }
  }

  function inviteCallbackPath(grant: string): string {
    return `${callbackPath}?${new URLSearchParams({ grant }).toString()}`
  }

  function inviteGrantFromCallbackURL(callbackURL: unknown, baseURL: string): string | null {
    if (typeof callbackURL !== 'string' || !callbackURL) return null
    try {
      const base = new URL(baseURL)
      const callback = new URL(callbackURL, base)
      if (callback.origin !== base.origin || callback.pathname !== callbackPath) return null
      return callback.searchParams.get('grant')
    } catch {
      return null
    }
  }

  async function acceptInviteAfterMagicLink(
    rawGrant: string,
    sessionUserId: string,
  ): Promise<InviteAccessState> {
    const verified = verifyInviteGrant(rawGrant)
    if (!verified.ok) return verified.reason
    return options.store.accept(verified.payload, sessionUserId)
  }

  async function inspectInviteForUser(
    rawGrant: string,
    sessionUserId: string,
  ): Promise<InviteInspection> {
    const verified = verifyInviteGrant(rawGrant)
    if (!verified.ok) return { state: verified.reason, tenantId: null, tenantName: null }
    const record = await options.store.inspect(verified.payload.membershipId)
    return {
      state: evaluateInviteAccess(verified.payload, sessionUserId, record),
      tenantId: record?.tenantId ?? null,
      tenantName: record?.tenantName ?? null,
    }
  }

  return {
    ttlSeconds,
    createInviteGrant,
    verifyInviteGrant,
    inviteCallbackPath,
    inviteGrantFromCallbackURL,
    acceptInviteAfterMagicLink,
    inspectInviteForUser,
  }
}

/** Pure state machine shared by memory and durable stores. */
export function evaluateInviteAccess(
  payload: InviteGrantPayload,
  sessionUserId: string,
  record: InviteRecord | null,
): InviteAccessState {
  if (!record || sessionUserId !== payload.userId) return 'invalid'
  if (
    record.membershipId !== payload.membershipId ||
    record.tenantId !== payload.tenantId ||
    record.userId !== payload.userId ||
    record.invitedAt?.getTime() !== payload.invitedAt
  ) {
    return 'invalid'
  }
  if (record.tenantStatus !== 'active') return 'tenant_unavailable'
  if (record.status === 'suspended') return 'suspended'
  if (record.status === 'active') return 'active'
  if (!record.emailVerified) return 'unverified'
  return 'pending'
}

/** Every resend advances the generation, even within the same clock tick. */
export function nextInviteGenerationDate(previous: Date | null, now = new Date()): Date {
  const nowMs = now.getTime()
  const previousMs = previous?.getTime() ?? -1
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(previousMs)) {
    throw new Error('Invalid invitation generation time.')
  }
  return new Date(Math.max(nowMs, previousMs + 1))
}

function parsePayload(value: unknown, ttlSeconds: number): InviteGrantPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Partial<InviteGrantPayload>
  if (
    payload.v !== INVITE_GRANT_VERSION ||
    !isBoundedString(payload.membershipId, 100) ||
    !isBoundedString(payload.tenantId, 100) ||
    !isBoundedString(payload.userId, 200) ||
    !Number.isSafeInteger(payload.invitedAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt! <= payload.issuedAt! ||
    payload.expiresAt! - payload.issuedAt! > ttlSeconds * 1000
  ) {
    return null
  }
  return payload as InviteGrantPayload
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function normalizeCallbackPath(value: string): string {
  try {
    const url = new URL(value, 'https://app.invalid')
    if (url.origin !== 'https://app.invalid' || !url.pathname.startsWith('/')) throw new Error()
    return url.pathname
  } catch {
    throw new Error('Invitation callback path must be an absolute same-origin path.')
  }
}
