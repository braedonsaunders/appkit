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
  status: 'active', isSuperAdmin: true, isCurrentUser: true, localeOverride: null,
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
