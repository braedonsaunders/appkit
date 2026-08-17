import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followDurableCursor, type DurableCursorSource } from './cursor'

test('cursor follower drains durable pages before waiting for a wake', async () => {
  const rows = [
    { cursor: 1, event: 'one' },
    { cursor: 2, event: 'two' },
    { cursor: 3, event: 'three' },
  ]
  let wakes = 0
  const source: DurableCursorSource<number, string> = {
    async readAfter({ cursor, limit }) {
      return rows.filter((row) => row.cursor > (cursor ?? 0)).slice(0, limit)
    },
    async waitForWake({ signal }) {
      wakes += 1
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason)
        }, { once: true })
      })
    },
  }
  const controller = new AbortController()
  const seen: string[] = []
  for await (const row of followDurableCursor({
    source,
    batchSize: 2,
    pollMs: 50,
    signal: controller.signal,
  })) {
    seen.push(row.event)
    if (seen.length === 3) controller.abort()
  }
  assert.deepEqual(seen, ['one', 'two', 'three'])
  assert.equal(wakes, 0)
})

test('cursor follower treats wake signals as hints and backfills new durable rows', async () => {
  const rows = [{ cursor: 'a', event: 'first' }]
  let wake: (() => void) | null = null
  const source: DurableCursorSource<string, string> = {
    async readAfter({ cursor }) {
      const start = cursor === null ? 0 : rows.findIndex((row) => row.cursor === cursor) + 1
      return rows.slice(start)
    },
    waitForWake({ signal }) {
      return new Promise<void>((resolve, reject) => {
        wake = resolve
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
  }
  const controller = new AbortController()
  const seen: string[] = []
  const following = (async () => {
    for await (const row of followDurableCursor({ source, pollMs: 10_000, signal: controller.signal })) {
      seen.push(row.event)
      if (seen.length === 1) {
        rows.push({ cursor: 'b', event: 'second' })
        queueMicrotask(() => wake?.())
      } else controller.abort()
    }
  })()
  await following
  assert.deepEqual(seen, ['first', 'second'])
})
