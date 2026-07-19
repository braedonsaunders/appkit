import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuth, hashPassword, verifyPassword } from './index'

test('password hash round-trips and rejects wrong passwords', () => {
  const stored = hashPassword('correct horse battery staple')
  assert.ok(stored.includes(':'))
  assert.equal(verifyPassword('correct horse battery staple', stored), true)
  assert.equal(verifyPassword('wrong', stored), false)
  assert.equal(verifyPassword('correct horse battery staple', 'garbage'), false)
})

test('each hash uses a fresh salt', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'))
})

const auth = createAuth({ sessionSecret: 'test-secret', ttlSeconds: 3600 })

test('session token round-trips to the user id', () => {
  const token = auth.makeSessionToken('user-123')
  assert.equal(auth.verifySessionToken(token), 'user-123')
})

test('tampered / malformed tokens are rejected', () => {
  const token = auth.makeSessionToken('user-123')
  assert.equal(auth.verifySessionToken(token + 'x'), null) // bad signature
  assert.equal(auth.verifySessionToken(token.replace('user-123', 'user-999')), null) // swapped subject
  assert.equal(auth.verifySessionToken('a.b'), null) // wrong shape
  assert.equal(auth.verifySessionToken(undefined), null)
  assert.equal(auth.verifySessionToken(''), null)
})

test('a different secret cannot verify the token', () => {
  const token = auth.makeSessionToken('user-123')
  const other = createAuth({ sessionSecret: 'different-secret' })
  assert.equal(other.verifySessionToken(token), null)
})

test('expired tokens are rejected', () => {
  const past = createAuth({ sessionSecret: 'test-secret', ttlSeconds: -10 })
  assert.equal(past.verifySessionToken(past.makeSessionToken('user-123')), null)
})

test('cookie options are httpOnly + lax + rooted', () => {
  const opts = auth.sessionCookieOptions()
  assert.equal(opts.name, 'appkit_session')
  assert.equal(opts.httpOnly, true)
  assert.equal(opts.sameSite, 'lax')
  assert.equal(opts.path, '/')
  assert.equal(auth.clearSessionCookie().maxAge, 0)
})
