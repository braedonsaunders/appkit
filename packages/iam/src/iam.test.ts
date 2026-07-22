import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPermissionOverrides, permissionSetCovers } from './permissions'
import { createMemoryIamService, IamConflictError, IamProtectedRecordError } from './memory'
import { createHttpIamService, createIamHttpHandler } from './http'
import type { MemberRecord, RoleRecord } from './types'

const date = new Date('2026-01-01T00:00:00.000Z')
const role: RoleRecord = {
  id: 'role-1', key: 'admin', name: 'Administrator', description: null, isBuiltIn: true,
  permissions: ['records.*'], memberCount: 1, createdAt: date, updatedAt: date,
}
const member: MemberRecord = {
  id: 'member-1', userId: 'user-1', name: 'Admin', email: 'admin@example.com', image: null,
  status: 'active', isSuperAdmin: false, isCurrentUser: false, localeOverride: null,
  joinedAt: date, invitedAt: null, createdAt: date,
  assignments: [{ id: 'assignment-1', roleId: role.id, roleKey: role.key, roleName: role.name, scope: { type: 'tenant' } }],
  overrides: [],
}

test('permission coverage preserves wildcards and read-tier cascading', () => {
  assert.equal(permissionSetCovers(new Set(['records.*']), 'records.update'), true)
  assert.equal(permissionSetCovers(new Set(['forms.read.all']), 'forms.read.self'), true)
  assert.equal(permissionSetCovers(new Set(['forms.read.self']), 'forms.read.all'), false)
})

test('a concrete deny carves a permission out of a wildcard grant', () => {
  const result = applyPermissionOverrides(
    ['records.*'],
    [{ permission: 'records.delete', effect: 'deny' }],
    ['records.read', 'records.update', 'records.delete'],
  )
  assert.deepEqual([...result].sort(), ['records.read', 'records.update'])
})

test('memory service applies role protections, scope upserts, and audit', async () => {
  let sequence = 1
  const service = createMemoryIamService(
    { roles: [role], members: [member] },
    { now: () => date, id: () => `id-${sequence++}` },
  )
  await assert.rejects(() => service.deleteRole(role.id), IamProtectedRecordError)
  const duplicate = await service.duplicateRole(role.id, 'Operations')
  const assignment = await service.assignRole(member.id, duplicate.id, { type: 'self' })
  const updated = await service.assignRole(member.id, duplicate.id, { type: 'sites', siteIds: ['site-1'] })
  assert.equal(updated.id, assignment.id)
  assert.deepEqual(updated.scope, { type: 'sites', siteIds: ['site-1'] })
  await assert.rejects(() => service.deleteRole(duplicate.id), IamConflictError)
  assert.equal((await service.listAuditEvents()).total, 3)
})

test('member and audit facets describe the complete filtered dataset, not one page', async () => {
  const customRole: RoleRecord = { ...role, id: 'role-2', key: 'reviewer', name: 'Reviewer', isBuiltIn: false, memberCount: 0 }
  const invited: MemberRecord = { ...member, id: 'member-2', userId: 'user-2', email: 'invite@example.com', status: 'invited', joinedAt: null, invitedAt: date }
  const service = createMemoryIamService({ roles: [role, customRole], members: [member, invited] })
  await service.updateMember(member.id, { name: 'Updated admin' })
  const roles = await service.listRoles({ type: 'custom', perPage: 1 })
  assert.deepEqual(roles.facets.typeCounts, { built_in: 1, custom: 1 })
  const members = await service.listMembers({ status: 'active', perPage: 1 })
  assert.deepEqual(members.facets.statusCounts, { active: 1, invited: 1, suspended: 0 })
  const events = await service.listAuditEvents({ action: 'update', perPage: 1 })
  assert.deepEqual(events.facets.actions, ['update'])
  assert.deepEqual(events.facets.recordTypes, ['membership'])
})

test('protected role policy is enforced in the adapter, not only hidden in the UI', async () => {
  const service = createMemoryIamService(
    { roles: [role] },
    {
      roleCapabilities: (value) => ({
        updateKey: false,
        updateDetails: false,
        updatePermissions: value.key !== 'admin',
        duplicate: true,
        delete: false,
        reason: 'The root role is locked.',
      }),
    },
  )
  await assert.rejects(
    () => service.updateRole(role.id, { name: role.name, description: role.description, permissions: [] }),
    IamProtectedRecordError,
  )
  assert.deepEqual((await service.getRole(role.id))?.permissions, ['records.*'])
})

test('bulk role operations preserve source add, replace, remove, skip, and scope behavior', async () => {
  let sequence = 1
  const secondRole: RoleRecord = { ...role, id: 'role-2', key: 'reviewer', name: 'Reviewer', isBuiltIn: false, memberCount: 0 }
  const current: MemberRecord = { ...member, id: 'member-self', userId: 'user-self', email: 'self@example.com', isCurrentUser: true, assignments: [] }
  const target: MemberRecord = { ...member, id: 'member-target', userId: 'user-target', email: 'target@example.com', assignments: [] }
  const service = createMemoryIamService(
    { roles: [role, secondRole], members: [current, target] },
    { now: () => date, id: () => `bulk-${sequence++}` },
  )

  const added = await service.bulkUpdateRoleAssignments({ operation: 'add', roleId: secondRole.id, membershipIds: [current.id, target.id], scope: { type: 'self' } })
  assert.deepEqual(added.changedIds, [target.id])
  assert.deepEqual(added.skippedIds, [current.id])
  assert.deepEqual((await service.getMember(target.id))?.assignments[0]?.scope, { type: 'self' })

  await service.assignRole(target.id, role.id, { type: 'tenant' })
  await service.bulkUpdateRoleAssignments({ operation: 'replace', roleId: secondRole.id, membershipIds: [target.id], scope: { type: 'sites', siteIds: ['site-1'] } })
  const replaced = await service.getMember(target.id)
  assert.deepEqual(replaced?.assignments.map((assignment) => assignment.roleId), [secondRole.id])
  assert.deepEqual(replaced?.assignments[0]?.scope, { type: 'sites', siteIds: ['site-1'] })

  await service.bulkUpdateRoleAssignments({ operation: 'remove', roleId: secondRole.id, membershipIds: [target.id], scope: { type: 'tenant' } })
  assert.equal((await service.getMember(target.id))?.assignments.length, 0)
})

test('resending an invitation rotates its generation monotonically and redelivers it', async () => {
  const delivered: Array<{ reason: string; invitedAt: Date | null }> = []
  let now = new Date('2026-01-01T00:00:00.000Z')
  const invited: MemberRecord = { ...member, status: 'invited', joinedAt: null, invitedAt: now, assignments: [] }
  const service = createMemoryIamService(
    { roles: [role], members: [invited] },
    {
      now: () => now,
      afterInvitePersisted: async (value, reason) => { delivered.push({ reason, invitedAt: value.invitedAt }) },
    },
  )
  const resent = await service.resendInvite(invited.id)
  assert.equal(resent.invitedAt?.toISOString(), '2026-01-01T00:00:00.001Z')
  assert.deepEqual(delivered.map((value) => value.reason), ['resend'])
  now = new Date('2026-01-02T00:00:00.000Z')
  await assert.rejects(() => service.updateMember(invited.id, { status: 'active' }), IamConflictError)
})

test('runtime boundaries reject unknown permissions and malformed scopes', async () => {
  const service = createMemoryIamService(
    { roles: [role], members: [member] },
    { permissionCatalogue: ['records.read', 'records.update', 'records.delete'] },
  )
  await assert.rejects(() => service.createRole({ name: 'Unknown', permissions: ['invented.permission'] }), /Unknown permission/)
  await assert.rejects(
    () => service.assignRole(member.id, role.id, { type: 'sites', siteIds: [null] } as unknown as Parameters<typeof service.assignRole>[2]),
    /siteIds/,
  )
})

test('HTTP adapter carries the complete service contract and revives dates', async () => {
  let authorized = 0
  const service = createMemoryIamService({ roles: [role], members: [member] })
  const handler = createIamHttpHandler({
    authorize: async () => { authorized += 1 },
    resolveService: async () => service,
  })
  const client = createHttpIamService({
    endpoint: 'https://app.example.test/api/iam',
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(new Request(input, init))) as typeof fetch,
  })
  const result = await client.listRoles({ perPage: 10 })
  assert.equal(result.rows[0]?.name, 'Administrator')
  assert.ok(result.rows[0]?.createdAt instanceof Date)
  const created = await client.createRole({ name: 'Reviewer', permissions: ['records.read'] })
  assert.equal(created.name, 'Reviewer')
  assert.equal(authorized, 2)
})
