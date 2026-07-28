// Server-only secret sealing (AES-256-GCM). The single shared implementation
// for every tenant credential an app stores at rest — sync-connection creds,
// email/SMS/AI provider keys, API keys, outbound-integration secrets.
//
// The key is derived from APPKIT_SECRET via HKDF — no extra env var, no
// plaintext secrets in the DB. Because the derivation is fixed, a secret sealed
// by a web admin action unseals in the worker (and vice-versa) as long as both
// share the same APPKIT_SECRET. A `createSealer` factory supports explicit-key
// application profiles without coupling the package to a host application's env.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const FALLBACK_SECRET = 'appkit-dev-insecure-secret'
const HKDF_INFO = 'appkit.secret.v1'

export type SealedSecret = { ciphertext: string; nonce: string }

export type Sealer = {
  sealSecret: (plain: string) => SealedSecret
  unsealSecret: (sealed: SealedSecret) => string | null
}

export type ContextualSecretContext = {
  /** HKDF salt, normally a tenant id. */
  salt: string | Uint8Array
  /** AES-GCM additional authenticated data, normally a record/key identity. */
  additionalData?: string | Uint8Array
}

export type ContextualSealer = {
  /** Versioned base64 payload: version || nonce || auth tag || ciphertext. */
  sealSecret: (plain: string, context: ContextualSecretContext) => string
  unsealSecret: (sealed: string, context: ContextualSecretContext) => string | null
}

/** Build a sealer from an explicit source secret (HKDF-derived AES-256 key). */
export function createSealer(
  sourceSecret: string,
  options: { hkdfInfo?: string } = {},
): Sealer {
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(sourceSecret),
      Buffer.alloc(0),
      Buffer.from(options.hkdfInfo ?? HKDF_INFO),
      32,
    ),
  )

  function sealSecret(plain: string): SealedSecret {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      ciphertext: Buffer.concat([enc, tag]).toString('base64'),
      nonce: iv.toString('base64'),
    }
  }

  function unsealSecret(sealed: SealedSecret): string | null {
    try {
      const raw = Buffer.from(sealed.ciphertext, 'base64')
      const iv = Buffer.from(sealed.nonce, 'base64')
      const tag = raw.subarray(raw.length - 16)
      const enc = raw.subarray(0, raw.length - 16)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    } catch {
      return null
    }
  }

  return { sealSecret, unsealSecret }
}

/**
 * Build a compact contextual sealer for tenant/record-bound credentials.
 *
 * This entry exists for applications whose persisted ciphertext must derive a
 * different data key per tenant and bind the payload to a record identity.
 * It also lets an existing application move its established versioned compact
 * ciphertext into AppKit without rewriting live secrets.
 */
export function createContextualSealer(
  sourceSecret: string | Uint8Array,
  options: {
    hkdfInfo?: string
    sourceEncoding?: BufferEncoding
    version?: number
  } = {},
): ContextualSealer {
  const source = typeof sourceSecret === 'string'
    ? Buffer.from(sourceSecret, options.sourceEncoding ?? 'utf8')
    : Buffer.from(sourceSecret)
  if (source.length === 0) throw new Error('Contextual sealer source secret cannot be empty.')
  const info = Buffer.from(options.hkdfInfo ?? HKDF_INFO)
  const version = options.version ?? 1
  if (!Number.isInteger(version) || version < 0 || version > 255) {
    throw new Error('Contextual sealer version must be an integer from 0 through 255.')
  }

  function deriveKey(context: ContextualSecretContext): Buffer {
    const salt = bytes(context.salt)
    if (salt.length === 0) throw new Error('Contextual sealer salt cannot be empty.')
    return Buffer.from(hkdfSync('sha256', source, salt, info, 32))
  }

  function sealSecret(plain: string, context: ContextualSecretContext): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', deriveKey(context), iv)
    const additionalData = optionalBytes(context.additionalData)
    if (additionalData) cipher.setAAD(additionalData)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([
      Buffer.from([version]),
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]).toString('base64')
  }

  function unsealSecret(sealed: string, context: ContextualSecretContext): string | null {
    try {
      const payload = Buffer.from(sealed, 'base64')
      if (payload.length < 29 || payload[0] !== version) return null
      const iv = payload.subarray(1, 13)
      const tag = payload.subarray(13, 29)
      const encrypted = payload.subarray(29)
      const decipher = createDecipheriv('aes-256-gcm', deriveKey(context), iv)
      const additionalData = optionalBytes(context.additionalData)
      if (additionalData) decipher.setAAD(additionalData)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
      return null
    }
  }

  return { sealSecret, unsealSecret }
}

// --- Env-backed default (the common path) ----------------------------------

function sourceSecret(): string {
  const secret = process.env.APPKIT_SECRET
  if (secret && (process.env.NODE_ENV !== 'production' || secret.length >= 32)) return secret
  // Never let a real deployment seal secrets under a publicly-known key: the
  // ciphertext would be trivially decryptable by anyone with the source. Local
  // dev (NODE_ENV !== 'production') keeps the convenience fallback.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[appkit/crypto] APPKIT_SECRET must contain at least 32 characters in production to seal tenant secrets. ' +
        'Set it to the same value across every service sharing this database.',
    )
  }
  return FALLBACK_SECRET
}

// Derived lazily so importing this module never throws at load time (the guard
// only fires when a secret is actually sealed/unsealed) and so a test can set
// the env before first use.
let cached: Sealer | null = null
let cachedSource: string | null = null
function sealer(): Sealer {
  const source = sourceSecret()
  if (!cached || cachedSource !== source) {
    cached = createSealer(source)
    cachedSource = source
  }
  return cached
}

export function sealSecret(plain: string): SealedSecret {
  return sealer().sealSecret(plain)
}

export function unsealSecret(sealed: SealedSecret): string | null {
  return sealer().unsealSecret(sealed)
}

function bytes(value: string | Uint8Array): Buffer {
  return typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
}

function optionalBytes(value: string | Uint8Array | undefined): Buffer | null {
  return value === undefined ? null : bytes(value)
}
