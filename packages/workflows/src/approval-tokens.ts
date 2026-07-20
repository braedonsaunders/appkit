import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WorkflowDecision } from './runtime'

export const APPROVAL_TOKEN_TTL_MS = 72 * 3_600_000
const TOKEN_DOMAIN = 'appkit-workflow-email-action:v1'
export type ApprovalTokenClaims = {
  gateId: string
  decision: WorkflowDecision
  assigneeId: string
  expiresAt: number
}

export function createApprovalTokenCodec(options: {
  secret: string
  baseUrl?: string
  actionPath?: string
  now?: () => number
}) {
  if (!options.secret)
    throw new Error('A workflow approval token secret is required')
  const now = options.now ?? Date.now
  const sign = (payload: string) =>
    createHmac('sha256', options.secret)
      .update(`${TOKEN_DOMAIN}|${payload}`)
      .digest('hex')
  const create = (
    claims: Omit<ApprovalTokenClaims, 'expiresAt'> & { expiresAt?: number },
  ) => {
    const payload = [
      claims.gateId,
      claims.decision,
      claims.assigneeId,
      claims.expiresAt ?? now() + APPROVAL_TOKEN_TTL_MS,
    ].join('|')
    return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
  }
  const verify = (token: string): ApprovalTokenClaims | null => {
    const dot = token.lastIndexOf('.')
    if (dot <= 0) return null
    let payload: string
    try {
      payload = Buffer.from(token.slice(0, dot), 'base64url').toString()
    } catch {
      return null
    }
    const given = Buffer.from(token.slice(dot + 1))
    const expected = Buffer.from(sign(payload))
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return null
    const [gateId, decision, assigneeId, rawExpiry] = payload.split('|')
    const expiresAt = Number(rawExpiry)
    if (
      !gateId ||
      !assigneeId ||
      (decision !== 'approved' && decision !== 'rejected') ||
      !Number.isFinite(expiresAt) ||
      now() > expiresAt
    )
      return null
    return { gateId, decision, assigneeId, expiresAt }
  }
  const urls = (gateId: string, assigneeId: string) => {
    if (!options.baseUrl)
      throw new Error('A baseUrl is required to create approval URLs')
    const base = options.baseUrl.replace(/\/+$/, '')
    const path = options.actionPath ?? '/api/workflows/email-action'
    const make = (decision: WorkflowDecision) =>
      `${base}${path}?token=${encodeURIComponent(create({ gateId, assigneeId, decision }))}`
    return { approveUrl: make('approved'), rejectUrl: make('rejected') }
  }
  return { create, verify, urls }
}
