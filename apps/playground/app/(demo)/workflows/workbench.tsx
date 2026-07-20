'use client'

import * as React from 'react'
import type { AutomationGraph } from '@appkit/forms-core/safety-automation'
import type { FlowSubjectProfile } from '@appkit/forms-core/safety-flow-subjects'
import {
  FlowsCanvas,
  type FlowSummary,
  type RecipientOptions,
  type WorkflowStudioAdapter,
} from '@appkit/workflows/react'

const profile: FlowSubjectProfile = {
  subjectType: 'module',
  subjectKey: 'projects',
  label: 'Projects',
  triggers: ['on_create', 'on_submit', 'status_change', 'scheduled', 'manual'],
  actions: ['send_email', 'notify_role', 'set_field', 'change_status', 'duplicate_record', 'export_pdf'],
  statusValues: ['draft', 'submitted', 'in_review', 'approved', 'active', 'closed'],
  fields: [
    { key: 'name', label: 'Project name', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'enum', writable: true },
    { key: 'contract_value', label: 'Contract value', kind: 'number', writable: true },
    { key: 'start_date', label: 'Start date', kind: 'date', writable: true },
    { key: 'owner_id', label: 'Owner', kind: 'person' },
    { key: 'region', label: 'Region', kind: 'text', writable: true },
  ],
}

const recipientOptions: RecipientOptions = {
  people: [
    { id: 'person-alex', name: 'Alex Morgan' },
    { id: 'person-sam', name: 'Sam Rivera' },
  ],
  roles: [
    { key: 'project_managers', name: 'Project managers' },
    { key: 'executives', name: 'Executives' },
    { key: 'administrators', name: 'Administrators' },
  ],
  departments: [],
  personGroups: [],
  contacts: [],
  obligations: [],
  spreadsheetTemplates: [],
}

const initialFlows: FlowSummary[] = [
  {
    id: 'contract-approval',
    name: 'Contract approval',
    enabled: true,
    graph: {
      schemaVersion: 1,
      nodes: [
        {
          id: 'submitted',
          position: { x: 40, y: 120 },
          data: { kind: 'trigger', trigger: { trigger: 'on_submit' } },
        },
        {
          id: 'threshold',
          position: { x: 340, y: 120 },
          data: {
            kind: 'condition',
            label: 'Contract value threshold',
            rule: { op: 'gt', field: 'contract_value', value: 500000 },
          },
        },
        {
          id: 'approval',
          position: { x: 650, y: 40 },
          data: {
            kind: 'gate',
            gate: {
              title: 'Executive approval',
              assignee: { type: 'role', role: 'executives' },
              signatureRequired: true,
            },
          },
        },
        {
          id: 'activate-approved',
          position: { x: 960, y: 40 },
          data: { kind: 'action', action: { action: 'change_status', to: 'active' } },
        },
        {
          id: 'activate-standard',
          position: { x: 650, y: 230 },
          data: { kind: 'action', action: { action: 'change_status', to: 'active' } },
        },
      ],
      edges: [
        { id: 'submitted-threshold', source: 'submitted', target: 'threshold', sourceHandle: 'next' },
        { id: 'threshold-approval', source: 'threshold', target: 'approval', sourceHandle: 'then' },
        { id: 'threshold-standard', source: 'threshold', target: 'activate-standard', sourceHandle: 'else' },
        { id: 'approval-active', source: 'approval', target: 'activate-approved', sourceHandle: 'approve' },
      ],
    },
  },
  {
    id: 'deadline-reminders',
    name: 'Deadline reminders',
    enabled: true,
    graph: {
      schemaVersion: 1,
      nodes: [
        {
          id: 'weekday-morning',
          position: { x: 100, y: 120 },
          data: { kind: 'trigger', trigger: { trigger: 'scheduled', cron: '0 8 * * 1-5', tz: 'America/Toronto' } },
        },
        {
          id: 'notify-managers',
          position: { x: 430, y: 120 },
          data: {
            kind: 'action',
            action: {
              action: 'notify_role',
              role: 'project_managers',
              message: 'Review upcoming project deadlines and outstanding work.',
              channel: 'in_app',
            },
          },
        },
      ],
      edges: [
        { id: 'schedule-notify', source: 'weekday-morning', target: 'notify-managers', sourceHandle: 'next' },
      ],
    },
  },
  {
    id: 'project-handoff',
    name: 'Project handoff',
    enabled: false,
    graph: {
      schemaVersion: 1,
      nodes: [
        {
          id: 'approved',
          position: { x: 100, y: 120 },
          data: { kind: 'trigger', trigger: { trigger: 'status_change', from: 'approved', to: 'active' } },
        },
        {
          id: 'handoff-email',
          position: { x: 430, y: 120 },
          data: {
            kind: 'action',
            action: {
              action: 'send_email',
              to: [{ type: 'role', role: 'project_managers' }],
              mode: 'inline',
              subject: 'Project {{name}} is ready for handoff',
              bodyTemplate: 'The project is active. Open the project to review the handoff package.',
              attachPdf: true,
            },
          },
        },
      ],
      edges: [
        { id: 'active-handoff', source: 'approved', target: 'handoff-email', sourceHandle: 'next' },
      ],
    },
  },
]

export function WorkflowWorkbench() {
  const flows = React.useRef(new Map(initialFlows.map((flow) => [flow.id, structuredClone(flow)])))

  const adapter = React.useMemo<WorkflowStudioAdapter>(
    () => ({
      async create(_subject, name) {
        const id = globalThis.crypto.randomUUID()
        flows.current.set(id, {
          id,
          name,
          enabled: false,
          graph: { schemaVersion: 1, nodes: [], edges: [] },
        })
        return { ok: true, id }
      },
      async remove(id) {
        flows.current.delete(id)
        return { ok: true }
      },
      async rename(id, name) {
        const flow = flows.current.get(id)
        if (!flow) return { ok: false, error: 'Flow not found.' }
        flows.current.set(id, { ...flow, name })
        return { ok: true }
      },
      async save(id, graph: AutomationGraph) {
        const flow = flows.current.get(id)
        if (!flow) return { ok: false, error: 'Flow not found.' }
        flows.current.set(id, { ...flow, graph: structuredClone(graph) })
        return { ok: true }
      },
      async setEnabled(id, enabled) {
        const flow = flows.current.get(id)
        if (!flow) return { ok: false, error: 'Flow not found.' }
        flows.current.set(id, { ...flow, enabled })
        return { ok: true }
      },
    }),
    [],
  )

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <FlowsCanvas
        profile={profile}
        emailTemplates={[]}
        recipientOptions={recipientOptions}
        flows={initialFlows}
        canEdit
        adapter={adapter}
        embedded
      />
    </div>
  )
}
