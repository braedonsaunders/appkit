import { createHash, randomBytes } from 'node:crypto'

const DEFAULT_PREFIX = 'appkit'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Mint a new API credential. Returns the plaintext token (show once) + its
 *  stored hash. Format: `<prefix>_live_<43 url-safe chars>` (256-bit secret). */
export function generateApiKey(opts?: { prefix?: string }): { token: string; hash: string } {
  const prefix = opts?.prefix ?? DEFAULT_PREFIX
  const secret = randomBytes(32).toString('base64url') // 43 chars
  const token = `${prefix}_live_${secret}`
  return { token, hash: hashToken(token) }
}

/** Parse the exact credential format from `Authorization: Bearer …`. Length-
 *  bounded BEFORE hashing so the lookup can't be turned into unbounded work. */
export function parseBearerToken(req: Request, opts?: { prefix?: string }): string | null {
  const prefix = opts?.prefix ?? DEFAULT_PREFIX
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header || header.length > 128) return null
  const re = new RegExp(`^Bearer (${prefix}_live_[A-Za-z0-9_-]{43})$`)
  return re.exec(header)?.[1] ?? null
}
