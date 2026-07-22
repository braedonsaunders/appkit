'use client'

import * as React from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Send,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge, Button, promptDialog, toast, type PromptDialogOptions } from '@appkit/ui'
import {
  createHttpRecordApprovalAdapter,
  type ApprovalEventType,
  type ApprovalHistoryEntry,
  type RecordApprovalAdapter,
  type RecordApprovalState,
  type RecordApprovalSubject,
} from './record-approval'
import type { WorkflowDecision } from './runtime'

export interface ApprovalFlowLabels {
  approve: string
  reject: string
  rejectTitle: string
  rejectReasonLabel: string
  pendingWith(names: string): string
  alreadyDecided: string
  decisionFailed: string
  waitingOthers: string
  approved: string
  rejected: string
  historyTitle: string
  event(type: ApprovalEventType): string
  delegatedBadge: string
  escalatedBadge: string
}

export interface ApprovalFeedback {
  info(message: string): void
  success(message: string): void
  error(message: string): void
}

export interface RecordApprovalProviderProps {
  adapter: RecordApprovalAdapter
  children: React.ReactNode
  labels?: Partial<ApprovalFlowLabels>
  locale?: string
  feedback?: ApprovalFeedback
  /** Host refresh seam, for example an App Router `router.refresh`. */
  onRefresh?: () => void | Promise<void>
}

const defaultLabels: ApprovalFlowLabels = {
  approve: 'Approve',
  reject: 'Reject',
  rejectTitle: 'Reject approval',
  rejectReasonLabel: 'Reason for rejection',
  pendingWith: (names) => `Pending with ${names}`,
  alreadyDecided: 'This approval was already decided.',
  decisionFailed: 'The approval decision could not be saved.',
  waitingOthers: 'Decision saved. Waiting for the other approvers.',
  approved: 'Approved',
  rejected: 'Rejected',
  historyTitle: 'Approvals',
  event: (type) =>
    ({
      submitted: 'Submitted',
      requested: 'Approval requested',
      approved: 'Approved',
      rejected: 'Rejected',
      escalated: 'Escalated',
      delegated: 'Delegated',
    })[type],
  delegatedBadge: 'Delegated',
  escalatedBadge: 'Escalated',
}

const defaultFeedback: ApprovalFeedback = {
  info: (message) => toast.info(message),
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
}

const defaultAdapter = createHttpRecordApprovalAdapter()

type ApprovalContextValue = {
  adapter: RecordApprovalAdapter
  labels: ApprovalFlowLabels
  locale: string
  feedback: ApprovalFeedback
  onRefresh?: () => void | Promise<void>
}

const ApprovalContext = React.createContext<ApprovalContextValue>({
  adapter: defaultAdapter,
  labels: defaultLabels,
  locale: 'en',
  feedback: defaultFeedback,
})

export function RecordApprovalProvider({
  adapter,
  children,
  labels,
  locale = 'en',
  feedback = defaultFeedback,
  onRefresh,
}: RecordApprovalProviderProps) {
  const value = React.useMemo<ApprovalContextValue>(
    () => ({ adapter, labels: { ...defaultLabels, ...labels }, locale, feedback, onRefresh }),
    [adapter, labels, locale, feedback, onRefresh],
  )
  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>
}

export type RecordApprovalSnapshot = {
  state: RecordApprovalState | null
  loading: boolean
  error: Error | null
}

type ApprovalStateStore = {
  adapter: RecordApprovalAdapter
  subject: RecordApprovalSubject
  subscribe(listener: () => void): () => void
  getSnapshot(): RecordApprovalSnapshot
  refresh(): Promise<void>
}

const initialSnapshot: RecordApprovalSnapshot = { state: null, loading: false, error: null }
const storesByAdapter = new WeakMap<RecordApprovalAdapter, Map<string, ApprovalStateStore>>()
const activeStores = new Set<ApprovalStateStore>()

function getStore(adapter: RecordApprovalAdapter, subject: RecordApprovalSubject): ApprovalStateStore {
  let adapterStores = storesByAdapter.get(adapter)
  if (!adapterStores) {
    adapterStores = new Map()
    storesByAdapter.set(adapter, adapterStores)
  }
  const key = `${subject.subjectKind}\u0000${subject.subjectId}`
  const existing = adapterStores.get(key)
  if (existing) return existing

  let snapshot = initialSnapshot
  let loaded = false
  let pending: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const store: ApprovalStateStore = {
    adapter,
    subject: { ...subject },
    subscribe(listener) {
      listeners.add(listener)
      activeStores.add(store)
      if (!loaded && !pending) void store.refresh()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          activeStores.delete(store)
          adapterStores.delete(key)
        }
      }
    },
    getSnapshot: () => snapshot,
    async refresh() {
      if (pending) return pending
      snapshot = { ...snapshot, loading: true, error: null }
      emit()
      pending = adapter
        .load(subject)
        .then((state) => {
          loaded = true
          snapshot = { state, loading: false, error: null }
        })
        .catch((error: unknown) => {
          loaded = true
          snapshot = {
            state: snapshot.state,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }
        })
        .finally(() => {
          pending = null
          emit()
        })
      return pending
    },
  }
  adapterStores.set(key, store)
  return store
}

/** Re-fetches every mounted record approval surface, preserving the source API. */
export async function refreshApprovalState() {
  await Promise.all([...activeStores].map((store) => store.refresh()))
}

export function useRecordApprovalStateResult(
  subjectKind: string,
  subjectId: string,
  adapterOverride?: RecordApprovalAdapter,
): RecordApprovalSnapshot {
  const context = React.useContext(ApprovalContext)
  const adapter = adapterOverride ?? context.adapter
  const store = React.useMemo(
    () => getStore(adapter, { subjectKind, subjectId }),
    [adapter, subjectKind, subjectId],
  )
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => initialSnapshot)
}

/** Source-compatible state hook. Use the result variant when loading/error UI is needed. */
export function useRecordApprovalState(
  subjectKind: string,
  subjectId: string,
  adapterOverride?: RecordApprovalAdapter,
): RecordApprovalState | null {
  return useRecordApprovalStateResult(subjectKind, subjectId, adapterOverride).state
}

export interface ApprovalActionsProps extends RecordApprovalSubject {
  adapter?: RecordApprovalAdapter
  labels?: Partial<ApprovalFlowLabels>
  requestReason?: (options: PromptDialogOptions) => Promise<string | null>
  onRefresh?: () => void | Promise<void>
}

export function ApprovalActions({
  subjectKind,
  subjectId,
  adapter: adapterOverride,
  labels: labelOverrides,
  requestReason = promptDialog,
  onRefresh,
}: ApprovalActionsProps) {
  const context = React.useContext(ApprovalContext)
  const adapter = adapterOverride ?? context.adapter
  const labels = { ...context.labels, ...labelOverrides }
  const snapshot = useRecordApprovalStateResult(subjectKind, subjectId, adapter)
  const store = React.useMemo(
    () => getStore(adapter, { subjectKind, subjectId }),
    [adapter, subjectKind, subjectId],
  )
  const [busy, setBusy] = React.useState(false)

  const decide = React.useCallback(
    async (decision: WorkflowDecision) => {
      const gateId = snapshot.state?.approvalState.myActions?.gateId
      if (!gateId) return
      let comment: string | undefined
      if (decision === 'rejected') {
        const reason = await requestReason({
          title: labels.rejectTitle,
          label: labels.rejectReasonLabel,
          confirmLabel: labels.reject,
        })
        if (!reason) return
        comment = reason
      }

      setBusy(true)
      try {
        const result = await adapter.decide({ subjectKind, subjectId, gateId, decision, comment })
        if (result.outcome === 'already-decided') context.feedback.info(labels.alreadyDecided)
        else if (result.outcome === 'waiting') context.feedback.success(labels.waitingOthers)
        else context.feedback.success(result.outcome === 'approved' ? labels.approved : labels.rejected)
        await store.refresh()
        await (onRefresh ?? context.onRefresh)?.()
      } catch (error) {
        context.feedback.error(error instanceof Error && error.message ? error.message : labels.decisionFailed)
      } finally {
        setBusy(false)
      }
    },
    [adapter, context, labels, onRefresh, requestReason, snapshot.state, store, subjectId, subjectKind],
  )

  const state = snapshot.state
  if (!state || (!state.approvalState.myActions && state.approvalState.pendingWith.length === 0)) return null

  if (state.approvalState.myActions) {
    return (
      <>
        <Button
          disabled={busy}
          onClick={() => void decide('approved')}
          className="bg-success text-success-fg hover:bg-success/90 active:bg-success/80"
        >
          {labels.approve}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void decide('rejected')}>
          {labels.reject}
        </Button>
      </>
    )
  }

  const names = state.approvalState.pendingWith.map((pending) => pending.name).join(', ')
  const text = labels.pendingWith(names)
  return (
    <span
      className="inline-flex max-w-64 items-center gap-1.5 truncate rounded-full border border-warning/30 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning"
      title={text}
    >
      <Users className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  )
}

const eventIcon: Record<ApprovalEventType, React.ComponentType<{ className?: string }>> = {
  submitted: Send,
  requested: UserPlus,
  approved: CheckCircle2,
  rejected: XCircle,
  escalated: ArrowUpRight,
  delegated: UserCheck,
}

const eventTone: Record<ApprovalEventType, string> = {
  submitted: 'text-fg-muted',
  requested: 'text-fg-muted',
  approved: 'text-success',
  rejected: 'text-danger',
  escalated: 'text-warning',
  delegated: 'text-fg-muted',
}

export interface ApprovalHistoryProps extends RecordApprovalSubject {
  adapter?: RecordApprovalAdapter
  labels?: Partial<ApprovalFlowLabels>
  locale?: string
  defaultOpen?: boolean
}

export function ApprovalHistory({
  subjectKind,
  subjectId,
  adapter,
  labels: labelOverrides,
  locale,
  defaultOpen = true,
}: ApprovalHistoryProps) {
  const context = React.useContext(ApprovalContext)
  const labels = { ...context.labels, ...labelOverrides }
  const state = useRecordApprovalState(subjectKind, subjectId, adapter)
  const [open, setOpen] = React.useState(defaultOpen)
  const history = state?.history ?? []
  if (history.length === 0) return null

  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-hover"
      >
        <Chevron className="size-4 text-fg-subtle" aria-hidden="true" />
        {labels.historyTitle}
        <span className="text-xs font-normal text-fg-subtle">{history.length}</span>
      </button>
      {open ? (
        <ol className="divide-y divide-border-subtle border-t border-border">
          {history.map((entry) => (
            <ApprovalHistoryRow
              key={entry.id}
              entry={entry}
              labels={labels}
              locale={locale ?? context.locale}
            />
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function ApprovalHistoryRow({
  entry,
  labels,
  locale,
}: {
  entry: ApprovalHistoryEntry
  labels: ApprovalFlowLabels
  locale: string
}) {
  const Icon = eventIcon[entry.type]
  return (
    <li className="flex items-start gap-2.5 px-3 py-2">
      <Icon className={`mt-0.5 size-4 shrink-0 ${eventTone[entry.type]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-fg">{labels.event(entry.type)}</span>
          {entry.actor ? <span className="text-fg-muted">{entry.actor}</span> : null}
          {entry.title ? <span className="truncate text-xs text-fg-subtle">{entry.title}</span> : null}
          {entry.delegated ? <Badge variant="outline">{labels.delegatedBadge}</Badge> : null}
          {entry.type === 'escalated' ? <Badge variant="warning">{labels.escalatedBadge}</Badge> : null}
          <span
            className="ml-auto shrink-0 text-xs text-fg-subtle"
            title={new Date(entry.at).toLocaleString(locale)}
          >
            {formatApprovalRelativeTime(entry.at, locale)}
          </span>
        </div>
        {entry.comment ? (
          <p className={`mt-0.5 text-xs ${entry.type === 'rejected' ? 'text-danger' : 'text-fg-muted'}`}>
            {entry.comment}
          </p>
        ) : null}
      </div>
    </li>
  )
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

export function formatApprovalRelativeTime(iso: string, locale: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000
  if (Number.isNaN(seconds)) return ''
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(Math.round(seconds), 'second')
}
