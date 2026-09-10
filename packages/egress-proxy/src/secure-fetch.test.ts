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

// --- the ceiling times silence, not length ----------------------------------
//
// Streaming the body moved the moment the exchange settles from "headers
// arrived" to "body ended", which silently turned one armed timer into a hard
// cap on the whole transfer. A healthy model answer is slow by nature: a live
// agent step was destroyed at exactly 600000 ms with tokens still arriving and
// the reply half-written, and it was reported to the reader as a timeout.
//
// So `onProgress` is the contract the timer hangs off: every chunk refreshes it.
test('a body that keeps arriving refreshes the idle ceiling', async () => {
  const upstream = source()
  const WINDOW = 40
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      expired = true
    }, WINDOW)
  }

  const { body } = createBoundedBodyStream(upstream, 1024, () => clearTimeout(timer), touch)
  const reader = body.getReader()
  touch()

  // Four windows' worth of elapsed time, never more than one window of silence.
  for (const token of ['a', 'b', 'c', 'd', 'e']) {
    await sleep(WINDOW * 0.6)
    upstream.write(token)
    await reader.read()
  }
  assert.equal(expired, false, 'a response that is still delivering is not a timeout')

  // And silence still ends it.
  await sleep(WINDOW * 2)
  assert.equal(expired, true, 'a body that stops mid-transfer still trips the ceiling')
})

test('the transport arms that ceiling from the body, not once per request', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('./secure-fetch.ts', import.meta.url)), 'utf8')
  const once = src.slice(src.indexOf('function requestOnce'))

  assert.match(once, /createBoundedBodyStream\([\s\S]*?settle,\s*touch,/, 'the stream refreshes the timer')
  assert.match(
    once,
    /timed out after \$\{timeoutMs\} ms without progress/,
    'and the message says what actually expired',
  )
  // A second `setTimeout` here would be a second, unrefreshed deadline.
  assert.equal((once.match(/setTimeout\(/g) ?? []).length, 1, 'exactly one timer, and it is the refreshed one')
})
