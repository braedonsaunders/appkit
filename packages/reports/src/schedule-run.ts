export type ReportRunTrigger = 'scheduled' | 'manual'

export type ReportRunSnapshot<Definition = unknown, Filters = Record<string, unknown>> = {
  scheduleName: string
  definition: Definition
  filters: Filters
  recipientUserIds: string[]
  recipientEmails: string[]
  emailSubject?: string | null
  emailMessage?: string | null
  runAsTenantUserId?: string | null
  runAsRoleId?: string | null
}

export type ReportScheduleRunContext<Definition = unknown, Filters = Record<string, unknown>> = {
  tenantId: string
  scheduleId: string
  scheduleName: string
  definition: Definition
  filters: Filters
  recipientUserIds: readonly string[]
  recipientEmails: readonly string[]
  emailSubject?: string | null
  emailMessage?: string | null
  runAsTenantUserId?: string | null
  runAsRoleId?: string | null
}

export type ReportRunStore<Definition = unknown, Filters = Record<string, unknown>> = {
  loadContext(scheduleId: string): Promise<ReportScheduleRunContext<Definition, Filters> | null>
  insert(input: {
    tenantId: string
    scheduleId: string
    scheduledFor: Date
    trigger: ReportRunTrigger
    requestSnapshot: ReportRunSnapshot<Definition, Filters>
    status: 'queued'
  }): Promise<{ id: string } | null>
  find(scheduleId: string, scheduledFor: Date): Promise<{ id: string; trigger: ReportRunTrigger } | null>
}

export type ClaimedReportRun = { id: string; scheduledFor: Date; created: boolean }

/**
 * Creates the durable execution record before queue publication. Scheduled
 * occurrences are idempotent at (scheduleId, scheduledFor); manual requests
 * remain distinct even when requested in the same millisecond.
 */
export async function claimReportRun<Definition = unknown, Filters = Record<string, unknown>>(
  store: ReportRunStore<Definition, Filters>,
  input: { scheduleId: string; scheduledFor: Date; trigger: ReportRunTrigger },
): Promise<ClaimedReportRun> {
  const context = await store.loadContext(input.scheduleId)
  if (!context) throw new Error(`Report schedule ${input.scheduleId} was not found`)
  const requestSnapshot: ReportRunSnapshot<Definition, Filters> = {
    scheduleName: context.scheduleName,
    definition: structuredClone(context.definition),
    filters: structuredClone(context.filters),
    recipientUserIds: [...context.recipientUserIds],
    recipientEmails: [...context.recipientEmails],
    emailSubject: context.emailSubject,
    emailMessage: context.emailMessage,
    runAsTenantUserId: context.runAsTenantUserId,
    runAsRoleId: context.runAsRoleId,
  }
  let scheduledFor = input.scheduledFor
  for (;;) {
    const inserted = await store.insert({
      tenantId: context.tenantId,
      scheduleId: context.scheduleId,
      scheduledFor,
      trigger: input.trigger,
      requestSnapshot,
      status: 'queued',
    })
    if (inserted) return { id: inserted.id, scheduledFor, created: true }
    const existing = await store.find(context.scheduleId, scheduledFor)
    if (!existing) throw new Error('Report run conflict was not visible after insertion')
    if (input.trigger === 'scheduled' && existing.trigger === 'scheduled') return { id: existing.id, scheduledFor, created: false }
    scheduledFor = new Date(scheduledFor.getTime() + 1)
  }
}
