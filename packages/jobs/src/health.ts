import { Redis } from 'ioredis'

const DEFAULT_TIMEOUT_MS = 3_000

/** Probe Redis through an isolated, bounded connection suitable for readiness. */
export async function assertRedisReady(options: { url: string; timeoutMs?: number }): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error('Redis readiness timeout must be between 100 and 30000 ms')
  const client = new Redis(options.url, {
    lazyConnect: true,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
  client.on('error', () => undefined)
  try {
    await client.connect()
    const response = await client.ping()
    if (response !== 'PONG') throw new Error('Redis returned an unexpected readiness response')
  } finally {
    client.disconnect(false)
  }
}
