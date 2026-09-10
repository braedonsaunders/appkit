import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { createBoundedBodyStream } from './secure-fetch'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A Node response stream stands in for the real one; no TLS, no sockets. */
function source(): PassThrough & { destroyedWith: () => Error | null } {
  const stream = new PassThrough()
  let reason: Error | null = null
  const destroy = stream.destroy.bind(stream)
  stream.destroy = ((error?: Error) => {
    reason = error ?? reason
    return destroy(error)
  }) as typeof stream.destroy
  return Object.assign(stream, { destroyedWith: () => reason })
}

test('a body is readable as it arrives, not after it ends', async () => {
  const upstream = source()
  let settled = 0
  const { body } = createBoundedBodyStream(upstream, 1024, () => {
    settled += 1
  })

  const reader = body.getReader()
  const seen: { text: string; beforeEnd: boolean }[] = []
  let ended = false

  const producer = (async () => {
    for (const token of ['data: a\n\n', 'data: b\n\n', 'data: c\n\n']) {
      await sleep(20)
      upstream.write(token)
    }
    await sleep(20)
    ended = true
    upstream.end()
  })()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    seen.push({ text: Buffer.from(value).toString(), beforeEnd: !ended })
  }
  await producer

  assert.equal(seen.length, 3, 'every chunk arrived separately')
  assert.deepEqual(
    seen.map((chunk) => chunk.text),
    ['data: a\n\n', 'data: b\n\n', 'data: c\n\n'],
  )
  assert.ok(
    seen.every((chunk) => chunk.beforeEnd),
    'each chunk was delivered while the upstream response was still open — the point of the exercise',
  )
  assert.equal(settled, 1, 'the exchange settles exactly once, when the body ends')
})

test('the size ceiling still refuses an oversized body, mid-stream', async () => {
  const upstream = source()
  const { body } = createBoundedBodyStream(upstream, 8, () => {})
  const reader = body.getReader()

  upstream.write('12345')
  const first = await reader.read()
  assert.equal(Buffer.from(first.value!).toString(), '12345', 'bytes under the ceiling pass through')

  upstream.write('67890')
  await assert.rejects(
    () => reader.read(),
    /Outbound response exceeded 8 bytes\./,
    'passing the ceiling errors the body the caller is reading',
  )
  assert.match(
    upstream.destroyedWith()?.message ?? '',
    /exceeded 8 bytes/,
    'and the socket is destroyed rather than left draining',
  )
})

test('an upstream failure reaches the reader', async () => {
  const upstream = source()
  let settled = 0
  const { body } = createBoundedBodyStream(upstream, 1024, () => {
    settled += 1
  })
  const reader = body.getReader()

  upstream.write('partial')
  assert.equal(Buffer.from((await reader.read()).value!).toString(), 'partial')
  upstream.emit('error', new Error('socket hang up'))

  await assert.rejects(() => reader.read(), /socket hang up/)
  assert.equal(settled, 1, 'a failed exchange releases its timeout too')
})

test('a caller that stops reading stops the transfer', async () => {
  const upstream = source()
  let settled = 0
  const { body } = createBoundedBodyStream(upstream, 1024, () => {
    settled += 1
  })
  const reader = body.getReader()

  upstream.write('first')
  await reader.read()
  await reader.cancel()

  assert.equal(upstream.destroyed, true, 'the upstream response is torn down')
  assert.equal(settled, 1, 'and the exchange is settled')
})

test('a transport failure after the headers is reported through `fail`', async () => {
  const upstream = source()
  const { body, fail } = createBoundedBodyStream(upstream, 1024, () => {})
  const reader = body.getReader()

  upstream.write('working')
  await reader.read()
  fail(new Error('Outbound request timed out after 600000 ms.'))

  await assert.rejects(() => reader.read(), /timed out after 600000 ms/)
  assert.equal(upstream.destroyed, true)
})
