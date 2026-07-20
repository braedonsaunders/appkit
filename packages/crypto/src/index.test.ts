import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSealer, sealSecret, unsealSecret } from './index'

test('seal → unseal round-trips (env-backed default)', () => {
  const sealed = sealSecret('tw_auth_token_123')
  assert.notEqual(sealed.ciphertext, 'tw_auth_token_123')
  assert.equal(unsealSecret(sealed), 'tw_auth_token_123')
})

test('each seal uses a fresh nonce', () => {
  const a = sealSecret('same')
  const b = sealSecret('same')
  assert.notEqual(a.nonce, b.nonce)
  assert.notEqual(a.ciphertext, b.ciphertext)
})

test('tampered ciphertext / nonce unseals to null (GCM auth)', () => {
  const sealed = sealSecret('secret')
  assert.equal(unsealSecret({ ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA' }), null)
  assert.equal(unsealSecret({ ...sealed, nonce: Buffer.from('123456789012').toString('base64') }), null)
  assert.equal(unsealSecret({ ciphertext: 'garbage', nonce: 'garbage' }), null)
})

test('a different source secret cannot unseal', () => {
  const a = createSealer('secret-a-secret-a-secret-a-secret-a')
  const b = createSealer('secret-b-secret-b-secret-b-secret-b')
  const sealed = a.sealSecret('cross-check')
  assert.equal(b.unsealSecret(sealed), null)
  assert.equal(a.unsealSecret(sealed), 'cross-check')
})

test('unicode round-trips', () => {
  const s = createSealer('unicode-test-secret-unicode-test-secret')
  const sealed = s.sealSecret('pässwörd — 密码 🔐')
  assert.equal(s.unsealSecret(sealed), 'pässwörd — 密码 🔐')
})

test('empty strings round-trip', () => {
  const s = createSealer('empty-test-secret-empty-test-secret')
  assert.equal(s.unsealSecret(s.sealSecret('')), '')
})

test('the env-backed sealer rejects missing and weak production secrets', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalSecret = process.env.APPKIT_SECRET
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.APPKIT_SECRET
    assert.throws(
      () => sealSecret('value'),
      /APPKIT_SECRET must contain at least 32 characters in production/,
    )

    process.env.APPKIT_SECRET = 'too-short'
    assert.throws(
      () => sealSecret('value'),
      /APPKIT_SECRET must contain at least 32 characters in production/,
    )
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalSecret === undefined) delete process.env.APPKIT_SECRET
    else process.env.APPKIT_SECRET = originalSecret
  }
})
