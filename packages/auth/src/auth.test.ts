import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { createAppkitAuth, createLazyAuth } from './server'
import { createInviteService, nextInviteGenerationDate } from './invites'
import { createMemoryInviteStore } from './memory'

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters'
const invitedAt = new Date('2026-07-21T12:00:00.000Z')
const record = {
  membershipId: 'membership-1',
  tenantId: 'tenant-1',
  tenantName: 'Northwind',
  userId: 'user-1',
  invitedAt,
  status: 'invited' as const,
  emailVerified: true,
  tenantStatus: 'active' as const,
}

test('signed invitation grants round-trip, reject tampering, and bind exact callbacks', async () => {
  const store = createMemoryInviteStore([record])
  const service = createInviteService({ secret: SECRET, store })
  const now = Date.parse('2026-07-21T12:01:00.000Z')
  const grant = service.createInviteGrant(record, now)
  assert.equal(service.verifyInviteGrant(grant, now).ok, true)
  assert.equal(service.verifyInviteGrant(`${grant}x`, now).ok, false)
  const callback = service.inviteCallbackPath(grant)
  assert.equal(
    service.inviteGrantFromCallbackURL(callback, 'https://app.example.test'),
    grant,
  )
  assert.equal(
    service.inviteGrantFromCallbackURL(
      `https://evil.example.test/invite/accept?grant=${encodeURIComponent(grant)}`,
      'https://app.example.test',
    ),
    null,
  )
})

test('magic-link acceptance activates only the bound, verified invitation generation', async () => {
  const store = createMemoryInviteStore([record])
  const service = createInviteService({ secret: SECRET, store })
  const now = Date.now()
  const grant = service.createInviteGrant(record, now)
  assert.equal(await service.acceptInviteAfterMagicLink(grant, 'other-user'), 'invalid')
  assert.equal(await service.acceptInviteAfterMagicLink(grant, record.userId), 'active')
  assert.equal(store.records.get(record.membershipId)?.status, 'active')
  assert.equal((await service.inspectInviteForUser(grant, record.userId)).state, 'active')
})

test('resends always advance the invitation generation', () => {
  const first = new Date('2026-07-21T12:00:00.000Z')
  assert.equal(nextInviteGenerationDate(first, first).getTime(), first.getTime() + 1)
})

test('auth runtime uses durable mapped tables and a lazy singleton', async () => {
  const pool = new Pool({ connectionString: 'postgresql://app:secret@127.0.0.1:1/appkit' })
  const factory = () =>
    createAppkitAuth({
      database: pool,
      baseURL: 'https://app.example.test',
      secret: SECRET,
      appName: 'Example',
      sendEmail: async () => {},
    })
  const getAuth = createLazyAuth(factory)
  const first = getAuth()
  assert.equal(getAuth(), first)
  assert.equal(first.options.user?.modelName, 'users')
  assert.equal(first.options.session?.modelName, 'sessions')
  assert.equal(first.options.account?.modelName, 'accounts')
  assert.equal(first.options.verification?.modelName, 'verifications')
  await pool.end()
})

test('weak secrets and credential-bearing base URLs fail closed', () => {
  const pool = new Pool()
  assert.throws(
    () => createAppkitAuth({ database: pool, baseURL: 'https://app.test', secret: 'weak', appName: 'Example', sendEmail: async () => {} }),
    /at least 32/,
  )
  assert.throws(
    () => createAppkitAuth({ database: pool, baseURL: 'https://user:secret@app.test', secret: SECRET, appName: 'Example', sendEmail: async () => {} }),
    /without credentials/,
  )
})
