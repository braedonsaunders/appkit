import type { DashboardLayout, InsightCardDraft } from '@appkit/dashboard'

export const DEMO_TENANT = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Acme Inc',
  slug: 'acme',
} as const

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000002',
  membershipId: '00000000-0000-4000-8000-000000000003',
  name: 'Ada Lovelace',
  email: 'admin@appkit.dev',
  isSuperAdmin: true,
} as const

export type DemoMember = {
  id: string
  name: string
  email: string
  role: 'Admin' | 'Member' | 'Analyst'
  roleKey: 'admin' | 'member' | 'analyst'
  active: boolean
  createdAt: Date
}

const member = (
  sequence: number,
  name: string,
  email: string,
  role: DemoMember['role'],
  roleKey: DemoMember['roleKey'],
  createdAt: string,
): DemoMember => ({
  id: `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  name,
  email,
  role,
  roleKey,
  active: true,
  createdAt: new Date(createdAt),
})

export const DEMO_MEMBERS: readonly DemoMember[] = [
  member(1, 'Ada Lovelace', 'admin@appkit.dev', 'Admin', 'admin', '2025-01-08T14:00:00.000Z'),
  member(2, 'Casey Grant', 'casey@appkit.dev', 'Member', 'member', '2025-01-14T16:30:00.000Z'),
  member(3, 'Jordan Lee', 'jordan@appkit.dev', 'Analyst', 'analyst', '2025-03-03T12:15:00.000Z'),
  member(4, 'Morgan Chen', 'morgan@appkit.dev', 'Member', 'member', '2025-06-21T18:05:00.000Z'),
  member(5, 'Riley Patel', 'riley@appkit.dev', 'Member', 'member', '2025-06-11T13:20:00.000Z'),
  member(6, 'Sam Rivera', 'sam@appkit.dev', 'Analyst', 'analyst', '2025-06-07T15:40:00.000Z'),
  member(7, 'Taylor Brooks', 'taylor@appkit.dev', 'Member', 'member', '2026-01-16T11:10:00.000Z'),
  member(8, 'Alex Kim', 'alex@appkit.dev', 'Member', 'member', '2026-03-02T17:55:00.000Z'),
  member(9, 'Jamie Wright', 'jamie@appkit.dev', 'Analyst', 'analyst', '2026-03-19T14:25:00.000Z'),
  member(10, 'Drew Clarke', 'drew@appkit.dev', 'Member', 'member', '2026-05-09T19:45:00.000Z'),
  member(11, 'Quinn Foster', 'quinn@appkit.dev', 'Member', 'member', '2026-07-18T12:35:00.000Z'),
  member(12, 'Avery Singh', 'avery@appkit.dev', 'Analyst', 'analyst', '2026-07-06T16:05:00.000Z'),
]

export const DEMO_ROLES = [
  { key: 'admin', name: 'Admin', createdAt: new Date('2025-01-01T12:00:00.000Z') },
  { key: 'analyst', name: 'Analyst', createdAt: new Date('2025-01-01T12:00:00.000Z') },
  { key: 'member', name: 'Member', createdAt: new Date('2025-01-01T12:00:00.000Z') },
] as const

export type DemoAuditEvent = {
  id: string
  action: string
  entityType: string
  summary: string
  createdAt: Date
}

const audit = (
  sequence: number,
  action: string,
  entityType: string,
  summary: string,
  createdAt: string,
): DemoAuditEvent => ({
  id: `20000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  action,
  entityType,
  summary,
  createdAt: new Date(createdAt),
})

export const DEMO_AUDIT_EVENTS: readonly DemoAuditEvent[] = [
  audit(1, 'update', 'dashboard_layout', 'Customized personal dashboard', '2026-07-20T13:42:00.000Z'),
  audit(2, 'publish', 'insight_card', 'Published Membership growth', '2026-07-20T12:18:00.000Z'),
  audit(3, 'update', 'integration', 'Updated accounting export', '2026-07-19T18:04:00.000Z'),
  audit(4, 'create', 'workflow', 'Created purchase approval', '2026-07-19T15:26:00.000Z'),
  audit(5, 'invite', 'membership', 'Invited Avery Singh', '2026-07-18T16:05:00.000Z'),
  audit(6, 'update', 'form', 'Published site inspection v4', '2026-07-18T13:31:00.000Z'),
  audit(7, 'create', 'report', 'Created monthly operations report', '2026-07-17T17:12:00.000Z'),
  audit(8, 'send', 'notification', 'Delivered weekly digest', '2026-07-17T12:00:00.000Z'),
  audit(9, 'update', 'customization', 'Added project priority field', '2026-07-16T19:22:00.000Z'),
  audit(10, 'run', 'sync', 'Completed inventory sync', '2026-07-16T14:08:00.000Z'),
  audit(11, 'approve', 'workflow_gate', 'Approved supplier onboarding', '2026-07-15T20:17:00.000Z'),
  audit(12, 'create', 'design_document', 'Created work order template', '2026-07-15T11:43:00.000Z'),
  audit(13, 'update', 'role', 'Updated Analyst permissions', '2026-07-14T16:52:00.000Z'),
  audit(14, 'export', 'report', 'Exported quarterly activity PDF', '2026-07-14T13:09:00.000Z'),
]

export const DEMO_INSIGHT_CARDS: readonly InsightCardDraft[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Members by role',
    description: 'Current workspace membership grouped by assigned role.',
    query: {
      source: 'members',
      dimensions: [{ field: 'role' }],
      measures: [{ fn: 'count' }],
      filters: [],
      limit: 100,
    },
    visualization: 'donut',
    visualizationSettings: {},
    status: 'published',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    name: 'Membership growth',
    description: 'Team members grouped by the month they joined.',
    query: {
      source: 'members',
      dimensions: [{ field: 'joined_at', bin: 'month' }],
      measures: [{ fn: 'count' }],
      filters: [],
      limit: 100,
    },
    visualization: 'line',
    visualizationSettings: { showValues: true },
    status: 'published',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    name: 'Recent audit activity',
    description: 'The latest workspace events from the append-only audit trail.',
    query: { source: 'audit', measures: [], dimensions: [], filters: [], limit: 20 },
    visualization: 'table',
    visualizationSettings: {},
    status: 'published',
  },
]

export const DEMO_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'metric:members', x: 0, y: 0, w: 3, h: 2 },
    { id: 'metric:roles', x: 3, y: 0, w: 3, h: 2 },
    { id: 'metric:auth', x: 6, y: 0, w: 3, h: 2 },
    { id: 'metric:audit', x: 9, y: 0, w: 3, h: 2 },
    { id: 'card:30000000-0000-4000-8000-000000000001', x: 0, y: 2, w: 6, h: 5 },
    { id: 'card:30000000-0000-4000-8000-000000000002', x: 6, y: 2, w: 6, h: 5 },
    { id: 'panel:quick-actions', x: 0, y: 7, w: 4, h: 5 },
    { id: 'panel:platform', x: 4, y: 7, w: 8, h: 5 },
  ],
}

export function cloneDemoCards(): InsightCardDraft[] {
  return [...structuredClone(DEMO_INSIGHT_CARDS)]
}
