import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemorySuperadminService } from './memory'
import { SuperadminConflictError, SuperadminGuardError, SuperadminNotFoundError } from './service'

const date = new Date('2026-01-01T00:00:00.000Z')
const future = new Date('2026-02-01T00:00:00.000Z')

const owner = { id: 'user-owner', name: 'Owner', email: 'owner@example.com', isSuperAdmin: true }
const member = { id: 'user-member', name: 'Member', email: 'member@example.com' }

test('creating a user hashes the password and grants a sign-in credential', async () => {
  const { service, persistence } = createMemorySuperadminService(
    { users: [owner], credentials: { [owner.id]: 'plain:owner' } },
    { now: () => date, hashPassword: async (password) => `hashed:${password}` },
  )
  const created = await service.createUser({ name: 'New Person', email: 'New@Example.com', password: 'secret-123' })
  assert.equal(created.email, 'new@example.com')
  assert.equal(created.hasCredential, true)
  assert.equal(persistence.state.credentials.get(created.id), 'hashed:secret-123')
  await assert.rejects(
    () => service.createUser({ name: 'Duplicate', email: 'new@example.com', password: 'secret-123' }),
    SuperadminConflictError,
  )
  await assert.rejects(
    () => service.createUser({ name: 'Short', email: 'short@example.com', password: 'tiny' }),
    /at least 8 characters/,
  )
})

test('the last active super admin can be neither deactivated nor demoted', async () => {
  const { service } = createMemorySuperadminService({ users: [owner, member] })
  await assert.rejects(() => service.updateUser(owner.id, { isActive: false }), SuperadminGuardError)
  await assert.rejects(() => service.updateUser(owner.id, { isSuperAdmin: false }), SuperadminGuardError)
  // Renames and verification changes remain allowed on the last super admin.
  const renamed = await service.updateUser(owner.id, { name: 'Renamed Owner' })
  assert.equal(renamed.name, 'Renamed Owner')
})

test('a super admin can stand down once another active super admin exists', async () => {
  const { service } = createMemorySuperadminService({ users: [owner, member] })
  await service.updateUser(member.id, { isSuperAdmin: true })
  const demoted = await service.updateUser(owner.id, { isSuperAdmin: false })
  assert.equal(demoted.isSuperAdmin, false)
  // The guard now protects the remaining super admin instead.
  await assert.rejects(() => service.updateUser(member.id, { isActive: false }), SuperadminGuardError)
})

test('deactivation revokes every live session so access ends immediately', async () => {
  const { service, persistence } = createMemorySuperadminService({
    users: [owner, { ...member, isSuperAdmin: false }],
    sessions: [
      { id: 'session-1', userId: member.id, expiresAt: future },
      { id: 'session-2', userId: member.id, expiresAt: future },
      { id: 'session-owner', userId: owner.id, expiresAt: future },
    ],
  })
  const updated = await service.updateUser(member.id, { isActive: false })
  assert.equal(updated.isActive, false)
  assert.equal(updated.activeSessionCount, 0)
  assert.equal(persistence.state.sessions.has('session-1'), false)
  assert.equal(persistence.state.sessions.has('session-owner'), true)
})

test('revoking your own sessions is flagged in the result, never silent', async () => {
  const { service } = createMemorySuperadminService(
    {
      users: [owner],
      sessions: [
        { id: 'session-current', userId: owner.id, expiresAt: future },
        { id: 'session-other', userId: owner.id, expiresAt: future },
      ],
    },
    { actor: { userId: owner.id, sessionId: 'session-current' } },
  )
  const result = await service.revokeUserSessions(owner.id)
  assert.equal(result.revokedCount, 2)
  assert.equal(result.revokedCurrentSession, true)
})

test('revoking a single session reports whether it was the current one', async () => {
  const { service } = createMemorySuperadminService(
    {
      users: [owner, member],
      sessions: [
        { id: 'session-current', userId: owner.id, expiresAt: future },
        { id: 'session-member', userId: member.id, expiresAt: future },
      ],
    },
    { actor: { userId: owner.id, sessionId: 'session-current' } },
  )
  assert.deepEqual(await service.revokeSession('session-member'), {
    revokedCount: 1,
    revokedCurrentSession: false,
  })
  assert.deepEqual(await service.revokeSession('session-current'), {
    revokedCount: 1,
    revokedCurrentSession: true,
  })
  await assert.rejects(() => service.revokeSession('session-member'), SuperadminNotFoundError)
})

test('listing reports credential and session presence with facets over the full set', async () => {
  const { service } = createMemorySuperadminService(
    {
      users: [owner, member, { id: 'user-idle', name: 'Idle', email: 'idle@example.com', isActive: false }],
      credentials: { [owner.id]: 'plain:owner' },
      sessions: [
        { id: 'session-live', userId: owner.id, createdAt: date, expiresAt: future },
        { id: 'session-expired', userId: member.id, createdAt: date, expiresAt: new Date(date.getTime() - 1000) },
      ],
    },
    { now: () => new Date('2026-01-15T00:00:00.000Z') },
  )
  const listed = await service.listUsers({ perPage: 1, sort: 'name', direction: 'asc' })
  assert.equal(listed.total, 3)
  assert.deepEqual(listed.facets.statusCounts, { active: 2, inactive: 1 })
  assert.equal(listed.facets.superAdmins, 1)
  const ownerRow = (await service.listUsers({ q: 'owner' })).rows[0]
  assert.equal(ownerRow?.hasCredential, true)
  assert.equal(ownerRow?.activeSessionCount, 1)
  assert.equal(ownerRow?.lastSeenAt?.toISOString(), date.toISOString())
  const memberRow = (await service.listUsers({ q: 'member' })).rows[0]
  assert.equal(memberRow?.hasCredential, false)
  assert.equal(memberRow?.activeSessionCount, 0)
  assert.equal(memberRow?.lastSeenAt?.toISOString(), date.toISOString())
})

test('session listing is live-only and annotates the operator session', async () => {
  const { service } = createMemorySuperadminService(
    {
      users: [owner],
      sessions: [
        { id: 'session-live', userId: owner.id, expiresAt: future, ipAddress: '10.0.0.1', userAgent: 'TestBrowser' },
        { id: 'session-expired', userId: owner.id, expiresAt: new Date(0) },
      ],
    },
    { now: () => date, actor: { userId: owner.id, sessionId: 'session-live' } },
  )
  const listed = await service.listSessions()
  assert.equal(listed.total, 1)
  assert.equal(listed.rows[0]?.id, 'session-live')
  assert.equal(listed.rows[0]?.isCurrentSession, true)
  assert.equal(listed.rows[0]?.userEmail, 'owner@example.com')
})

test('password management validates the target and the password', async () => {
  const { service, persistence } = createMemorySuperadminService(
    { users: [owner] },
    { hashPassword: async (password) => `hashed:${password}` },
  )
  await assert.rejects(() => service.setPassword('missing', 'long-enough-password'), SuperadminNotFoundError)
  await assert.rejects(() => service.setPassword(owner.id, 'tiny'), /at least 8 characters/)
  const updated = await service.setPassword(owner.id, 'rotated-password')
  assert.equal(updated.hasCredential, true)
  assert.equal(persistence.state.credentials.get(owner.id), 'hashed:rotated-password')
})
