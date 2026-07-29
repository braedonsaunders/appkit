import { createHash } from 'node:crypto'
import { isSafeAgentTool, type AgentToolManifest } from './manifest'
import type { AgentToolAction, AgentToolApproval } from './store'

/**
 * What happens when an agent asks to install or run a tool.
 *
 * - `deny` — refused outright, no request filed.
 * - `approval` — always asks a human.
 * - `allow_safe` — proceeds for low-risk, network-isolated tools; asks for the rest.
 * - `allow_all` — proceeds.
 */
export type AgentToolPolicyMode = 'deny' | 'approval' | 'allow_safe' | 'allow_all'

export interface AgentToolPolicy {
  /** Governs adding a tool to the host. */
  install: AgentToolPolicyMode
  /** Governs running one. */
  execute: AgentToolPolicyMode
  /** How long an unanswered request stays actionable. */
  pendingTtlMs: number
  /** How long an answered grant remains usable before it must be asked again. */
  grantTtlMs: number
  /** How many executions one approved grant permits. */
  grantUses: number
}

export const DEFAULT_AGENT_TOOL_POLICY: AgentToolPolicy = {
  install: 'approval',
  execute: 'allow_safe',
  pendingTtlMs: 24 * 60 * 60 * 1000,
  grantTtlMs: 60 * 60 * 1000,
  grantUses: 1,
}

export type AgentToolGateOutcome =
  /** Proceed. `approval` is present when a grant authorized it. */
  | { decision: 'allow'; approval?: AgentToolApproval }
  /** Refused by policy or by a human. Asking again changes nothing. */
  | { decision: 'deny'; reason: string; approval?: AgentToolApproval }
  /** A human has been asked. The caller stops and reports the pending request. */
  | { decision: 'await_approval'; approval: AgentToolApproval; reason: string }

/**
 * A stable digest of exactly what is being requested. Two requests share a
 * scope only when they are the same question, so a grant issued for
 * `rg --json needle` never silently covers `rg --files -0`.
 */
export function agentToolScope(input: {
  action: AgentToolAction
  toolId: string
  /** Command and argv for an execution; version for an install. */
  detail: Record<string, unknown>
  approvalScope?: 'exact-argv' | 'command'
}): string {
  const detail = input.approvalScope === 'command'
    ? { command: input.detail.command ?? null }
    : input.detail
  const canonical = JSON.stringify([input.action, input.toolId, stableValue(detail)])
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

/** Whether a pending request has sat unanswered past its window. */
export function isPendingApprovalExpired(approval: AgentToolApproval, now: Date): boolean {
  return approval.status === 'pending' && new Date(approval.expiresAt).getTime() <= now.getTime()
}

/**
 * Whether an approved grant is still good. A grant that has run out of time or
 * uses is spent — this is what keeps a single "yes" from authorizing a tool
 * forever.
 */
export function isGrantUsable(approval: AgentToolApproval, now: Date): boolean {
  if (approval.status !== 'approved') return false
  if (approval.grantExpiresAt && new Date(approval.grantExpiresAt).getTime() <= now.getTime()) {
    return false
  }
  return approval.usesRemaining === undefined || approval.usesRemaining > 0
}

/** The terminal status a spent grant should be written back as. */
export function spentGrantStatus(
  approval: AgentToolApproval,
  now: Date,
): 'expired' | 'exhausted' {
  if (approval.grantExpiresAt && new Date(approval.grantExpiresAt).getTime() <= now.getTime()) {
    return 'expired'
  }
  return 'exhausted'
}

/**
 * Decide an action against policy alone, before any stored grant is consulted.
 * `'ask'` means the runtime should look for a usable grant and file a request
 * if it finds none.
 */
export function evaluateAgentToolPolicy(input: {
  mode: AgentToolPolicyMode
  manifest: AgentToolManifest
  action: AgentToolAction
}): { outcome: 'allow' | 'deny' | 'ask'; reason: string } {
  switch (input.mode) {
    case 'deny':
      return {
        outcome: 'deny',
        reason: `Policy does not permit ${input.action} for managed tools.`,
      }
    case 'allow_all':
      return { outcome: 'allow', reason: 'Policy permits this without review.' }
    case 'allow_safe':
      return isSafeAgentTool(input.manifest)
        ? {
            outcome: 'allow',
            reason: 'Low-risk, network-isolated tool permitted without review.',
          }
        : {
            outcome: 'ask',
            reason: input.manifest.requiresNetwork
              ? `${input.manifest.name} reaches the network, so it needs review.`
              : `${input.manifest.name} is ${input.manifest.risk} risk, so it needs review.`,
          }
    case 'approval':
      return { outcome: 'ask', reason: `Policy requires review for every ${input.action}.` }
  }
}
