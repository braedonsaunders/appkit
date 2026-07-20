export type WorkflowDecision = 'approved' | 'rejected'
export type WorkflowGateStatus =
  | 'pending'
  | WorkflowDecision
  | 'cancelled'
  | 'escalated'
export type WorkflowQuorum = 'any' | 'all'
export type WorkflowRunStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type WorkflowAction = {
  kind: 'action'
  key: string
  type: string
  input?: Record<string, unknown>
}
export type WorkflowGate = {
  kind: 'gate'
  key: string
  assigneeIds: string[]
  quorum?: WorkflowQuorum
  input?: Record<string, unknown>
  onApprove?: WorkflowPlan
  onReject?: WorkflowPlan
}
export type WorkflowStep = WorkflowAction | WorkflowGate
export type WorkflowPlan = { steps: WorkflowStep[] }

export type WorkflowRun = {
  id: string
  tenantId: string
  workflowKey: string
  subjectType: string
  subjectId: string
  status: WorkflowRunStatus
  context: Record<string, unknown>
  error?: string
}
export type WorkflowGateRecord = {
  id: string
  runId: string
  gateKey: string
  assigneeId: string
  quorum: WorkflowQuorum
  status: WorkflowGateStatus
  gate: WorkflowGate
  decidedAt?: Date
}

export type WorkflowActionHandler = (args: {
  run: WorkflowRun
  action: WorkflowAction
  signal?: AbortSignal
}) => Promise<unknown>
export type WorkflowActionRegistry = Readonly<
  Record<string, WorkflowActionHandler>
>

/** Durable seam: the host owns transactions, locking, and tenancy. */
export interface WorkflowStore {
  createRun(input: Omit<WorkflowRun, 'id' | 'status'>): Promise<WorkflowRun>
  getRun(runId: string): Promise<WorkflowRun | null>
  setRunStatus(
    runId: string,
    status: WorkflowRunStatus,
    error?: string,
  ): Promise<void>
  /** Atomically flips waiting → running. Exactly one concurrent gate decision may resume. */
  claimRunResume(runId: string): Promise<boolean>
  claimAction(runId: string, actionKey: string): Promise<boolean>
  completeAction(
    runId: string,
    actionKey: string,
    output: unknown,
  ): Promise<void>
  failAction(runId: string, actionKey: string, error: string): Promise<void>
  createGateGroup(
    runId: string,
    gate: WorkflowGate,
  ): Promise<WorkflowGateRecord[]>
  listGateGroup(runId: string, gateKey: string): Promise<WorkflowGateRecord[]>
  decideGate(
    gateId: string,
    assigneeId: string,
    decision: WorkflowDecision,
  ): Promise<WorkflowGateRecord | null>
  cancelGates(gateIds: readonly string[]): Promise<void>
}

export interface WorkflowPlanner<TEvent = unknown> {
  plan(event: TEvent): Promise<{
    workflowKey: string
    subjectType: string
    subjectId: string
    context?: Record<string, unknown>
    plan: WorkflowPlan
  } | null>
}

export type WorkflowRuntime = {
  store: WorkflowStore
  actions: WorkflowActionRegistry
  signal?: AbortSignal
}

export async function dispatchWorkflow<TEvent>(
  runtime: WorkflowRuntime,
  tenantId: string,
  planner: WorkflowPlanner<TEvent>,
  event: TEvent,
): Promise<WorkflowRun | null> {
  const planned = await planner.plan(event)
  if (!planned) return null
  const run = await runtime.store.createRun({
    tenantId,
    workflowKey: planned.workflowKey,
    subjectType: planned.subjectType,
    subjectId: planned.subjectId,
    context: planned.context ?? {},
  })
  await executeWorkflowPlan(runtime, run, planned.plan)
  return await runtime.store.getRun(run.id)
}

export async function executeWorkflowPlan(
  runtime: WorkflowRuntime,
  run: WorkflowRun,
  plan: WorkflowPlan,
): Promise<void> {
  await runtime.store.setRunStatus(run.id, 'running')
  try {
    for (const step of plan.steps) {
      if (runtime.signal?.aborted)
        throw runtime.signal.reason instanceof Error
          ? runtime.signal.reason
          : new Error('Workflow aborted')
      if (step.kind === 'gate') {
        if (step.assigneeIds.length === 0)
          throw new Error(`Gate ${step.key} has no assignees`)
        await runtime.store.createGateGroup(run.id, step)
        await runtime.store.setRunStatus(run.id, 'waiting')
        return
      }
      const handler = runtime.actions[step.type]
      if (!handler)
        throw new Error(
          `No workflow action handler registered for ${step.type}`,
        )
      if (!(await runtime.store.claimAction(run.id, step.key))) continue
      try {
        const output = await handler({
          run,
          action: step,
          signal: runtime.signal,
        })
        await runtime.store.completeAction(run.id, step.key, output)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await runtime.store.failAction(run.id, step.key, message)
        throw error
      }
    }
    await runtime.store.setRunStatus(run.id, 'completed')
  } catch (error) {
    await runtime.store.setRunStatus(
      run.id,
      'failed',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

export async function decideWorkflowGate(
  runtime: WorkflowRuntime,
  args: {
    gateId: string
    assigneeId: string
    decision: WorkflowDecision
    gate?: WorkflowGate
    canDecide?: (assigneeId: string) => boolean | Promise<boolean>
  },
): Promise<'waiting' | WorkflowDecision> {
  if (args.canDecide && !(await args.canDecide(args.assigneeId)))
    throw new Error('Not authorized to decide this workflow gate')
  const decided = await runtime.store.decideGate(
    args.gateId,
    args.assigneeId,
    args.decision,
  )
  if (!decided)
    throw new Error('Workflow gate is unavailable or already decided')
  const siblings = await runtime.store.listGateGroup(
    decided.runId,
    decided.gateKey,
  )
  const outcome = resolveQuorumOutcome(decided.quorum, args.decision, siblings)
  if (!outcome.resume) return 'waiting'
  await runtime.store.cancelGates(outcome.cancelIds)
  if (!(await runtime.store.claimRunResume(decided.runId)))
    return outcome.resume
  const run = await runtime.store.getRun(decided.runId)
  if (!run) throw new Error('Workflow run no longer exists')
  const gate = args.gate ?? decided.gate
  await executeWorkflowPlan(
    runtime,
    run,
    outcome.resume === 'approved'
      ? (gate.onApprove ?? { steps: [] })
      : (gate.onReject ?? { steps: [] }),
  )
  return outcome.resume
}

export function resolveQuorumOutcome(
  quorum: WorkflowQuorum,
  decision: WorkflowDecision,
  siblings: readonly Pick<WorkflowGateRecord, 'id' | 'status'>[],
): { resume: WorkflowDecision | null; cancelIds: string[] } {
  const cancellable = siblings
    .filter(
      (sibling) =>
        sibling.status === 'pending' || sibling.status === 'escalated',
    )
    .map((sibling) => sibling.id)
  if (quorum === 'any') return { resume: decision, cancelIds: cancellable }
  if (decision === 'rejected')
    return { resume: 'rejected', cancelIds: cancellable }
  if (siblings.some((sibling) => sibling.status === 'pending'))
    return { resume: null, cancelIds: [] }
  return {
    resume: siblings.some((sibling) => sibling.status === 'rejected')
      ? 'rejected'
      : 'approved',
    cancelIds: cancellable,
  }
}

/** Deterministic in-memory reference store for tests, previews, and edge runtimes. */
export function createMemoryWorkflowStore(): WorkflowStore & {
  runs: Map<string, WorkflowRun>
  gates: Map<string, WorkflowGateRecord>
  actionOutputs: Map<string, unknown>
} {
  const runs = new Map<string, WorkflowRun>()
  const gates = new Map<string, WorkflowGateRecord>()
  const actionOutputs = new Map<string, unknown>()
  const claimed = new Set<string>()
  return {
    runs,
    gates,
    actionOutputs,
    async createRun(input) {
      const run: WorkflowRun = {
        ...input,
        id: crypto.randomUUID(),
        status: 'running',
      }
      runs.set(run.id, run)
      return run
    },
    async getRun(id) {
      return runs.get(id) ?? null
    },
    async setRunStatus(id, status, error) {
      const run = runs.get(id)
      if (!run) throw new Error('Workflow run not found')
      runs.set(id, { ...run, status, ...(error ? { error } : {}) })
    },
    async claimRunResume(id) {
      const run = runs.get(id)
      if (!run || run.status !== 'waiting') return false
      runs.set(id, { ...run, status: 'running' })
      return true
    },
    async claimAction(runId, key) {
      const ref = `${runId}:${key}`
      if (claimed.has(ref)) return false
      claimed.add(ref)
      return true
    },
    async completeAction(runId, key, output) {
      actionOutputs.set(`${runId}:${key}`, output)
    },
    async failAction(runId, key, error) {
      const ref = `${runId}:${key}`
      actionOutputs.set(ref, { error })
      claimed.delete(ref)
    },
    async createGateGroup(runId, gate) {
      const existing = [...gates.values()].filter(
        (row) => row.runId === runId && row.gateKey === gate.key,
      )
      if (existing.length) return existing
      return gate.assigneeIds.map((assigneeId) => {
        const row: WorkflowGateRecord = {
          id: crypto.randomUUID(),
          runId,
          gateKey: gate.key,
          assigneeId,
          quorum: gate.quorum ?? 'any',
          status: 'pending',
          gate,
        }
        gates.set(row.id, row)
        return row
      })
    },
    async listGateGroup(runId, gateKey) {
      return [...gates.values()].filter(
        (row) => row.runId === runId && row.gateKey === gateKey,
      )
    },
    async decideGate(id, assigneeId, decision) {
      const row = gates.get(id)
      if (!row || row.assigneeId !== assigneeId || row.status !== 'pending')
        return null
      const decided = { ...row, status: decision, decidedAt: new Date() }
      gates.set(id, decided)
      return decided
    },
    async cancelGates(ids) {
      for (const id of ids) {
        const row = gates.get(id)
        if (row && (row.status === 'pending' || row.status === 'escalated'))
          gates.set(id, { ...row, status: 'cancelled' })
      }
    },
  }
}
