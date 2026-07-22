'use client'

import * as React from 'react'
import {
  ApprovalActions,
  ApprovalHistory,
  RecordApprovalProvider,
  refreshApprovalState,
  useRecordApprovalState,
} from '@appkit/workflows/approval-react'
import {
  createMemoryRecordApprovalAdapter,
  type MemoryRecordApprovalSeed,
} from '@appkit/workflows'
import { Badge, Button, Drawer, PageHeader } from '@appkit/ui'
import { WorkflowWorkbench } from './workbench'

const subject = { subjectKind: 'project', subjectId: 'project-1042' }

function approvalSeed(): MemoryRecordApprovalSeed[] {
  const requestedAt = new Date(Date.now() - 42 * 60_000).toISOString()
  return [
    {
      ...subject,
      state: {
        approvalState: {
          status: 'pending_approval',
          pendingWith: [
            { name: 'You', gateId: 'gate-current', since: requestedAt },
            { name: 'Finance director', gateId: 'gate-finance', since: requestedAt },
          ],
          myActions: { gateId: 'gate-current' },
        },
        history: [
          {
            id: 'submitted',
            type: 'submitted',
            actor: 'Sam Rivera',
            comment: null,
            at: new Date(Date.now() - 47 * 60_000).toISOString(),
          },
          {
            id: 'requested-current',
            type: 'requested',
            actor: 'You',
            comment: null,
            at: requestedAt,
            title: 'Contract approval',
          },
          {
            id: 'requested-finance',
            type: 'requested',
            actor: 'Finance director',
            comment: null,
            at: requestedAt,
            title: 'Contract approval',
          },
        ],
      },
    },
  ]
}

export function WorkflowPage() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const adapter = React.useMemo(
    () =>
      createMemoryRecordApprovalAdapter({
        seed: approvalSeed(),
        actor: 'You',
      }),
    [],
  )

  const reset = React.useCallback(async () => {
    adapter.reset(approvalSeed())
    await refreshApprovalState()
  }, [adapter])

  return (
    <RecordApprovalProvider adapter={adapter}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6">
        <PageHeader
          title="Workflows"
          description="Create and manage event-driven automations and approval flows."
          actions={<Button onClick={() => setDrawerOpen(true)}>Open approval record</Button>}
        />
        <div className="min-h-0 flex-1">
          <WorkflowWorkbench />
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="PRJ-1042 · Central library renovation"
        description="Approval record"
        size="md"
        headerActions={<ApprovalActions {...subject} />}
        footer={<Button variant="outline" onClick={() => void reset()}>Reset approval</Button>}
      >
        <ApprovalRecord />
      </Drawer>
    </RecordApprovalProvider>
  )
}

function ApprovalRecord() {
  const state = useRecordApprovalState(subject.subjectKind, subject.subjectId)
  const status = state?.approvalState.status ?? 'pending_approval'
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <RecordField label="Status">
          <Badge variant={status === 'rejected' ? 'destructive' : status === 'approved' ? 'success' : 'warning'}>
            {status.replaceAll('_', ' ')}
          </Badge>
        </RecordField>
        <RecordField label="Owner">Sam Rivera</RecordField>
        <RecordField label="Contract value">$685,000.00</RecordField>
        <RecordField label="Region">Eastern</RecordField>
      </dl>
      <ApprovalHistory {...subject} />
    </div>
  )
}

function RecordField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  )
}
