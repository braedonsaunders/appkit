import type { WorkflowDecision, WorkflowQuorum } from './runtime'

export type ApprovalEventType =
  | 'submitted'
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'delegated'

export interface PendingWithEntry {
  name: string
  gateId?: string
  /** ISO timestamp the assignment has been waiting since. */
  since: string
}

export interface ApprovalHistoryEntry {
  id: string
  type: ApprovalEventType
  /** Display name of the actor, or the assignee for a request event. */
  actor: string | null
  comment: string | null
  /** ISO timestamp. */
  at: string
  title?: string
  delegated?: boolean
}

export interface RecordApprovalState {
  approvalState: {
    status: string
    pendingWith: PendingWithEntry[]
    myActions: { gateId?: string } | null
  }
  history: ApprovalHistoryEntry[]
}

export type RecordApprovalSubject = {
  subjectKind: string
  subjectId: string
}

export type RecordApprovalDecisionInput = RecordApprovalSubject & {
  gateId: string
  decision: WorkflowDecision
  comment?: string
}

export type RecordApprovalDecisionResult =
  | { outcome: 'already-decided' }
  | { outcome: 'waiting' }
  | { outcome: WorkflowDecision }

/** Application boundary for record status, viewer authorization, and decisions. */
export interface RecordApprovalAdapter {
  load(subject: RecordApprovalSubject, signal?: AbortSignal): Promise<RecordApprovalState | null>
  decide(input: RecordApprovalDecisionInput): Promise<RecordApprovalDecisionResult>
}

export class RecordApprovalRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RecordApprovalRequestError'
    this.status = status
  }
}

export interface HttpRecordApprovalAdapterOptions {
  stateEndpoint?: string
  decisionEndpoint?: string
  fetcher?: typeof fetch
}

/**
 * Source-compatible HTTP adapter. Its defaults preserve the production route
 * and request body contract while allowing hosts to relocate both endpoints.
 */
export function createHttpRecordApprovalAdapter({
  stateEndpoint = '/api/flows/record-state',
  decisionEndpoint = '/api/flows/gates/decide',
  fetcher = globalThis.fetch,
}: HttpRecordApprovalAdapterOptions = {}): RecordApprovalAdapter {
  return {
    async load({ subjectKind, subjectId }, signal) {
      const query = new URLSearchParams({ subjectKind, subjectId })
      const response = await fetcher(`${stateEndpoint}?${query}`, { signal })
      if (response.status === 404) return null
      const data = await readJson(response)
      if (!response.ok) {
        throw new RecordApprovalRequestError(readError(data, 'Unable to load approval state.'), response.status)
      }
      return data as RecordApprovalState
    },
    async decide({ gateId, decision, comment }) {
      const response = await fetcher(decisionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId, decision, comment }),
      })
      const data = await readJson(response)
      if (response.status === 409) return { outcome: 'already-decided' }
      if (!response.ok) {
        throw new RecordApprovalRequestError(readError(data, 'Unable to record approval decision.'), response.status)
      }
      if (isRecord(data) && data.resumed === null) return { outcome: 'waiting' }
      return { outcome: decision }
    },
  }
}

export interface MemoryRecordApprovalSeed extends RecordApprovalSubject {
  state: RecordApprovalState
  /** Gate-group quorum used to project the next record state. Defaults to all. */
  quorum?: WorkflowQuorum
}

export interface MemoryRecordApprovalAdapterOptions {
  seed?: readonly MemoryRecordApprovalSeed[]
  actor?: string | null
  now?: () => Date
  createId?: () => string
}

export interface MemoryRecordApprovalAdapter extends RecordApprovalAdapter {
  reset(seed: readonly MemoryRecordApprovalSeed[]): void
  inspect(subject: RecordApprovalSubject): RecordApprovalState | null
}

/** Browser-local implementation with the same state transitions as the HTTP seam. */
export function createMemoryRecordApprovalAdapter({
  seed = [],
  actor = 'Current user',
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
}: MemoryRecordApprovalAdapterOptions = {}): MemoryRecordApprovalAdapter {
  const states = new Map<string, { state: RecordApprovalState; quorum: WorkflowQuorum }>()

  function reset(next: readonly MemoryRecordApprovalSeed[]) {
    states.clear()
    for (const item of next) {
      states.set(subjectKey(item), { state: cloneState(item.state), quorum: item.quorum ?? 'all' })
    }
  }

  reset(seed)

  return {
    reset,
    inspect(subject) {
      const entry = states.get(subjectKey(subject))
      return entry ? cloneState(entry.state) : null
    },
    async load(subject) {
      const entry = states.get(subjectKey(subject))
      return entry ? cloneState(entry.state) : null
    },
    async decide(input) {
      const entry = states.get(subjectKey(input))
      const state = entry?.state
      const actionGateId = state?.approvalState.myActions?.gateId
      const pending = state?.approvalState.pendingWith.find((entry) => entry.gateId === input.gateId)
      if (!state || !pending || actionGateId !== input.gateId) return { outcome: 'already-decided' }

      state.approvalState.pendingWith = state.approvalState.pendingWith.filter(
        (entry) => entry.gateId !== input.gateId,
      )
      state.approvalState.myActions = null
      state.history.push({
        id: createId(),
        type: input.decision,
        actor,
        comment: input.comment ?? null,
        at: now().toISOString(),
        title: state.history.findLast(
          (entry) => entry.type === 'requested' && entry.actor === pending.name,
        )?.title,
      })

      if (
        input.decision === 'approved' &&
        entry.quorum === 'all' &&
        state.approvalState.pendingWith.length > 0
      ) return { outcome: 'waiting' }
      state.approvalState.pendingWith = []
      state.approvalState.status = input.decision
      return { outcome: input.decision }
    },
  }
}

function subjectKey(subject: RecordApprovalSubject) {
  return `${subject.subjectKind}\u0000${subject.subjectId}`
}

function cloneState(state: RecordApprovalState): RecordApprovalState {
  return structuredClone(state)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function readError(data: unknown, fallback: string) {
  return isRecord(data) && typeof data.error === 'string' ? data.error : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
