import { Redis } from 'ioredis'

export type RateLimitInput = { key: string; limit: number; windowSeconds: number }
export type RateLimitStatus = { allowed: boolean; count: number; remaining: number; resetAt: Date }
export type RateLimiter = {
  consume: (input: RateLimitInput) => Promise<RateLimitStatus>
  status: (input: RateLimitInput) => Promise<RateLimitStatus>
  recordFailure: (input: RateLimitInput) => Promise<RateLimitStatus>
  reset: (input: Pick<RateLimitInput, 'key' | 'windowSeconds'>) => Promise<void>
  close: () => Promise<void>
}

const INCREMENT_WITH_EXPIRY = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`

function assertWindow(input: Pick<RateLimitInput, 'key' | 'windowSeconds'>): void {
  if (typeof input.key !== 'string' || !input.key || input.key.length > 512 || /[\u0000-\u001f\u007f]/.test(input.key)) throw new Error('Rate-limit key is invalid or exceeds 512 characters.')
  if (!Number.isSafeInteger(input.windowSeconds) || input.windowSeconds < 1 || input.windowSeconds > 365 * 24 * 3_600) throw new Error('Rate-limit windowSeconds must be a positive bounded integer.')
}

function assertInput(input: RateLimitInput): void {
  assertWindow(input)
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 10_000_000) throw new Error('Rate-limit limit must be a positive bounded integer.')
}

function bucket(windowSeconds: number, now = Date.now()) { return Math.floor(now / (windowSeconds * 1_000)) }
function counterKey(key: string, windowSeconds: number, now = Date.now()) { return `rate-limit:${Buffer.from(key).toString('base64url')}:${bucket(windowSeconds, now)}` }
function result(input: RateLimitInput, count: number, inclusive: boolean, now: number): RateLimitStatus {
  return { allowed: inclusive ? count <= input.limit : count < input.limit, count, remaining: Math.max(0, input.limit - count), resetAt: new Date((bucket(input.windowSeconds, now) + 1) * input.windowSeconds * 1_000) }
}

export function createRateLimiter(options: { redisUrl: string }): RateLimiter {
  let client: Redis | null = null
  let connecting: Promise<void> | null = null
  async function redis() {
    if (!client) {
      client = new Redis(options.redisUrl, { connectTimeout: 1_000, enableOfflineQueue: false, lazyConnect: true, maxRetriesPerRequest: 1 })
      // Command callers receive failures; this prevents an idle EventEmitter
      // error from becoming an unrelated unhandled process error.
      client.on('error', () => undefined)
    }
    if (client.status === 'wait') connecting ??= client.connect().finally(() => { connecting = null })
    if (connecting) await connecting
    return client
  }
  async function increment(key: string, seconds: number) { return Number(await (await redis()).eval(INCREMENT_WITH_EXPIRY, 1, key, seconds)) }
  return {
    async consume(input) { assertInput(input); const now = Date.now(); return result(input, await increment(counterKey(input.key, input.windowSeconds, now), input.windowSeconds), true, now) },
    async status(input) { assertInput(input); const now = Date.now(); const raw = await (await redis()).get(counterKey(input.key, input.windowSeconds, now)); return result(input, raw ? Number(raw) : 0, false, now) },
    async recordFailure(input) { assertInput(input); const now = Date.now(); return result(input, await increment(counterKey(input.key, input.windowSeconds, now), input.windowSeconds), false, now) },
    async reset(input) { assertWindow(input); await (await redis()).del(counterKey(input.key, input.windowSeconds)) },
    async close() { const current = client; client = null; connecting = null; if (current) await current.quit() },
  }
}
