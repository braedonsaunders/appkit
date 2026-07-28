import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { createContextualSealer, createSealer, sealSecret, unsealSecret } from './index'

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

test('custom HKDF contexts isolate independently configured applications', () => {
  const sourceSecret = 'portable-application-secret-with-enough-entropy'
  const first = createSealer(sourceSecret, { hkdfInfo: 'application.one.v1' })
  const second = createSealer(sourceSecret, { hkdfInfo: 'application.two.v1' })
  const sealed = first.sealSecret('existing-provider-key')
  assert.equal(first.unsealSecret(sealed), 'existing-provider-key')
  assert.equal(second.unsealSecret(sealed), null)
})

test('contextual sealers bind ciphertext to tenant salt and record context', () => {
  const sealer = createContextualSealer(Buffer.alloc(32, 7), {
    hkdfInfo: 'application.credentials.v1',
  })
  const context = { salt: 'tenant-one', additionalData: 'connection-one:api-key' }
  const sealed = sealer.sealSecret('provider-secret', context)

  assert.equal(sealer.unsealSecret(sealed, context), 'provider-secret')
  assert.equal(
    sealer.unsealSecret(sealed, { ...context, salt: 'tenant-two' }),
    null,
  )
  assert.equal(
    sealer.unsealSecret(sealed, { ...context, additionalData: 'connection-two:api-key' }),
    null,
  )
})

test('contextual sealer is compatible with the established compact AES-GCM layout', () => {
  const source = Buffer.alloc(32, 11)
  const info = 'existing.application.credential.v1'
  const context = { salt: 'tenant-one', additionalData: 'record-one:key' }
  const sealer = createContextualSealer(source, { hkdfInfo: info })

  const legacyPayload = legacySeal('existing-secret', source, info, context.salt, context.additionalData)
  assert.equal(sealer.unsealSecret(legacyPayload, context), 'existing-secret')

  const appkitPayload = sealer.sealSecret('new-secret', context)
  assert.equal(legacyUnseal(appkitPayload, source, info, context.salt, context.additionalData), 'new-secret')
})

function legacyKey(source: Buffer, info: string, salt: string): Buffer {
  const prk = createHmac('sha256', Buffer.from(salt)).update(source).digest()
  return createHmac('sha256', prk)
    .update(Buffer.from(info))
    .update(Buffer.from([1]))
    .digest()
    .subarray(0, 32)
}

function legacySeal(plain: string, source: Buffer, info: string, salt: string, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', legacyKey(source, info, salt), iv)
  cipher.setAAD(Buffer.from(aad))
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

function legacyUnseal(payload: string, source: Buffer, info: string, salt: string, aad: string): string {
  const bytes = Buffer.from(payload, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', legacyKey(source, info, salt), bytes.subarray(1, 13))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(bytes.subarray(13, 29))
  return Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8')
}
