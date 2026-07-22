import type { AuditEventRecord, MemberRecord, PermissionGroup, RoleRecord } from '@appkit/iam'
import { createMemoryIamService } from '@appkit/iam/memory'

export const DEMO_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'records',
    label: 'Records',
    description: 'Core record access and lifecycle operations.',
    permissions: [
      { key: 'records.read.all', label: 'View all records' },
      { key: 'records.read.self', label: 'View own records' },
      { key: 'records.create', label: 'Create records' },
      { key: 'records.update', label: 'Edit records' },
      { key: 'records.delete', label: 'Delete records' },
    ],
  },
  {
    key: 'insights',
    label: 'Dashboards & reports',
    description: 'Read, author, publish, and schedule analytics.',
    permissions: [
      { key: 'dashboards.read', label: 'View dashboards' },
      { key: 'dashboards.edit', label: 'Edit dashboards' },
      { key: 'reports.read', label: 'View reports' },
      { key: 'reports.create', label: 'Build reports' },
      { key: 'reports.schedule', label: 'Schedule reports' },
    ],
  },
  {
    key: 'automation',
    label: 'Automation',
    description: 'Workflows, applications, scripts, and external connections.',
    permissions: [
      { key: 'workflows.manage', label: 'Manage workflows' },
      { key: 'workflows.approve', label: 'Approve workflow gates' },
      { key: 'apps.use', label: 'Use installed apps' },
      { key: 'apps.manage', label: 'Manage apps' },
      { key: 'scripts.execute', label: 'Run scripts' },
      { key: 'scripts.manage', label: 'Manage scripts' },
      { key: 'integrations.manage', label: 'Manage integrations' },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    description: 'Workspace identity, configuration, and audit controls.',
    permissions: [
      { key: 'admin.users.manage', label: 'Manage users' },
      { key: 'admin.roles.manage', label: 'Manage roles' },
      { key: 'admin.navigation.manage', label: 'Manage navigation' },
      { key: 'admin.settings.manage', label: 'Manage setup' },
      { key: 'admin.audit.read', label: 'View audit log' },
      { key: 'admin.data.export', label: 'Export data' },
    ],
  },
]

const allPermissions = DEMO_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key))
const createdAt = new Date('2025-01-01T12:00:00.000Z')

const roles: RoleRecord[] = [
  { id: 'role-admin', key: 'administrator', name: 'Administrator', description: 'Full workspace access, including identity and setup administration.', isBuiltIn: true, permissions: allPermissions, memberCount: 2, createdAt, updatedAt: new Date('2026-07-14T16:52:00.000Z') },
  { id: 'role-operator', key: 'operator', name: 'Operator', description: 'Creates and updates operational records and runs assigned workflows.', isBuiltIn: true, permissions: ['records.read.all', 'records.create', 'records.update', 'dashboards.read', 'reports.read', 'workflows.approve', 'apps.use', 'scripts.execute'], memberCount: 6, createdAt, updatedAt: createdAt },
  { id: 'role-analyst', key: 'analyst', name: 'Analyst', description: 'Builds dashboards and reports with read-only access to workspace records.', isBuiltIn: false, permissions: ['records.read.all', 'dashboards.read', 'dashboards.edit', 'reports.read', 'reports.create', 'reports.schedule'], memberCount: 4, createdAt, updatedAt: new Date('2026-07-14T16:52:00.000Z') },
]

const PEOPLE = [
  ['Ada Lovelace', 'admin@appkit.dev', 'role-admin'],
  ['Casey Grant', 'casey@appkit.dev', 'role-operator'],
  ['Jordan Lee', 'jordan@appkit.dev', 'role-analyst'],
  ['Morgan Chen', 'morgan@appkit.dev', 'role-operator'],
  ['Riley Patel', 'riley@appkit.dev', 'role-operator'],
  ['Sam Rivera', 'sam@appkit.dev', 'role-analyst'],
  ['Taylor Brooks', 'taylor@appkit.dev', 'role-operator'],
  ['Alex Kim', 'alex@appkit.dev', 'role-operator'],
  ['Jamie Wright', 'jamie@appkit.dev', 'role-analyst'],
  ['Drew Clarke', 'drew@appkit.dev', 'role-operator'],
  ['Quinn Foster', 'quinn@appkit.dev', 'role-admin'],
  ['Avery Singh', 'avery@appkit.dev', 'role-analyst'],
] as const

const members: MemberRecord[] = PEOPLE.map(([name, email, roleId], index) => {
  const role = roles.find((candidate) => candidate.id === roleId)!
  const date = new Date(Date.UTC(2025 + Math.floor(index / 6), index % 12, 8 + index, 14))
  return {
    id: `member-${index + 1}`,
    userId: `user-${index + 1}`,
    name,
    email,
    image: null,
    status: index === 11 ? 'invited' : 'active',
    isSuperAdmin: index === 0,
    isCurrentUser: index === 0,
    localeOverride: null,
    joinedAt: index === 11 ? null : date,
    invitedAt: index === 11 ? date : null,
    createdAt: date,
    assignments: [{ id: `assignment-${index + 1}`, roleId: role.id, roleKey: role.key, roleName: role.name, scope: index % 3 === 0 ? { type: 'tenant' } : { type: 'self' } }],
    overrides: index === 2 ? [{ permission: 'reports.schedule', effect: 'deny' }] : [],
  }
})

const auditEvents: AuditEventRecord[] = [
  audit('audit-1', 'update', 'role', 'role-analyst', 'Updated Analyst permissions', { permissions: ['records.read.all', 'reports.read'] }, { permissions: roles[2]!.permissions }, '2026-07-20T16:52:00.000Z'),
  audit('audit-2', 'insert', 'membership', 'member-12', 'Invited Avery Singh', null, { email: 'avery@appkit.dev', status: 'invited', role: 'Analyst' }, '2026-07-20T16:05:00.000Z'),
  audit('audit-3', 'update', 'role_assignment', 'assignment-3', 'Narrowed Jordan Lee to own records', { scope: { type: 'tenant' } }, { scope: { type: 'self' } }, '2026-07-19T19:22:00.000Z'),
  audit('audit-4', 'update', 'dashboard_layout', 'layout-default', 'Customized workspace dashboard', { widgets: ['members', 'roles'] }, { widgets: ['members', 'roles', 'activity'] }, '2026-07-19T13:42:00.000Z'),
  audit('audit-5', 'insert', 'workflow', 'workflow-approval', 'Created purchase approval', null, { trigger: 'record.submitted', steps: 4 }, '2026-07-18T15:26:00.000Z'),
  audit('audit-6', 'update', 'integration', 'integration-export', 'Updated accounting export', { schedule: 'weekly' }, { schedule: 'daily' }, '2026-07-17T18:04:00.000Z'),
]

function audit(id: string, action: string, recordType: string, recordId: string, summary: string, before: unknown, after: unknown, at: string): AuditEventRecord {
  return { id, action, recordType, recordId, summary, before, after, at: new Date(at), actorName: 'Ada Lovelace', actorUserId: 'user-1', requestId: `req-${id}`, metadata: { source: 'admin', requestId: `req-${id}` } }
}

export const demoIamService = createMemoryIamService(
  { roles, members, auditEvents },
  {
    actor: { userId: 'user-1', name: 'Ada Lovelace', isSuperAdmin: true },
    permissionCatalogue: allPermissions,
    roleCapabilities: (role) => ({
      updateKey: !role.isBuiltIn,
      updateDetails: true,
      updatePermissions: role.key !== 'administrator',
      duplicate: true,
      delete: !role.isBuiltIn,
      reason: role.key === 'administrator'
        ? 'The root administrator permission set is locked to prevent workspace lockout.'
        : role.isBuiltIn
          ? 'Built-in role keys and deletion are protected.'
          : undefined,
    }),
  },
)
