import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
import { createGuestAgentCore, runGuestAgent, type GuestAgentHandlers } from './guest-agent'
import { encodeFrame, FrameDecoder, type GuestResponse } from './protocol'

function stubHandlers(overrides: Partial<GuestAgentHandlers> = {}): GuestAgentHandlers & {
  calls: string[]
} {
  const calls: string[] = []
  const record = (name: string) => {
    calls.push(name)
  }
  return {
    calls,
    exec: overrides.exec ?? (async (call) => {
      record(`exec:${call.command}`)
      return { exitCode: 0, signal: null, stdout: 'ok', stderr: '', truncated: false }
    }),
    jobStart: overrides.jobStart ?? (async () => {
      record('jobStart')
      return { jobId: 'job-1' }
    }),
    jobSignal: overrides.jobSignal ?? (async () => record('jobSignal')),
    screenStart: overrides.screenStart ?? (async () => record('screenStart')),
    screenStop: overrides.screenStop ?? (async () => record('screenStop')),
    observe: overrides.observe ?? (async () => {
      record('observe')
      return { png: '', width: 1, height: 1, a11y: null, windows: [], focused: null }
    }),
    input: overrides.input ?? (async () => record('input')),
    a11yInvoke: overrides.a11yInvoke ?? (async () => record('a11yInvoke')),
    launch: overrides.launch ?? (async () => record('launch')),
    clipboardRead: overrides.clipboardRead ?? (async () => {
      record('clipboardRead')
      return { text: 'copied' }
    }),
    clipboardWrite: overrides.clipboardWrite ?? (async () => record('clipboardWrite')),
    framesStart: overrides.framesStart ?? (async () => record('framesStart')),
    framesStop: overrides.framesStop ?? (async () => record('framesStop')),
    videoStart: overrides.videoStart ?? (async () => record('videoStart')),
    videoStop: overrides.videoStop ?? (async () => record('videoStop')),
    handoverBegin: overrides.handoverBegin ?? (async () => {
      record('handoverBegin')
      return { url: 'https://relay.example/handover' }
    }),
    handoverEnd: overrides.handoverEnd ?? (async () => record('handoverEnd')),
    capabilities: overrides.capabilities ?? (async () => {
      record('capabilities')
      return { virtioGpu: true }
    }),
  }
}

function decodeResponses(frames: Buffer[]): GuestResponse[] {
  const decoder = new FrameDecoder()
  return frames.flatMap((frame) => decoder.push(frame)) as GuestResponse[]
}

test('dispatches a well-formed request to its handler and frames the result', async () => {
  const handlers = stubHandlers()
  const core = createGuestAgentCore(handlers)
  const responses = decodeResponses(
    await core.handleChunk(encodeFrame({ id: 'r1', op: 'exec', command: '/usr/bin/uname' })),
  )
  assert.deepEqual(responses, [{
    id: 'r1',
    ok: true,
    result: { exitCode: 0, signal: null, stdout: 'ok', stderr: '', truncated: false },
  }])
  assert.deepEqual(handlers.calls, ['exec:/usr/bin/uname'])
})

test('a malformed request gets an error response and never reaches a handler', async () => {
  const handlers = stubHandlers()
  const core = createGuestAgentCore(handlers)
  const responses = decodeResponses(
    await core.handleChunk(encodeFrame({ id: 'r2', op: 'melt-the-cpu' })),
  )
  assert.equal(responses.length, 1)
  assert.equal(responses[0]?.ok, false)
  assert.equal(responses[0]?.id, 'r2')
  assert.deepEqual(handlers.calls, [])
})

test('an oversized frame is fatal rather than resynchronized', async () => {
  const core = createGuestAgentCore(stubHandlers(), { maxFrameBytes: 32 })
  const header = Buffer.alloc(4)
  header.writeUInt32BE(1_000_000, 0)
  await assert.rejects(core.handleChunk(header), /declared a 1000000-byte frame/)
})

test('a handler failure becomes an error response instead of crashing the agent', async () => {
  const handlers = stubHandlers({
    clipboardRead: async () => {
      throw new Error('wl-paste is not running')
    },
  })
  const core = createGuestAgentCore(handlers)
  const responses = decodeResponses(
    await core.handleChunk(encodeFrame({ id: 'r3', op: 'clipboard-read' })),
  )
  assert.deepEqual(responses, [{ id: 'r3', ok: false, error: 'wl-paste is not running' }])

  const after = decodeResponses(await core.handleChunk(encodeFrame({ id: 'r4', op: 'ping' })))
  assert.deepEqual(after, [{ id: 'r4', ok: true, result: { pong: true } }])
})

test('requests split across chunks are answered in order', async () => {
  const core = createGuestAgentCore(stubHandlers())
  const stream = Buffer.concat([
    encodeFrame({ id: 'a', op: 'ping' }),
    encodeFrame({ id: 'b', op: 'capabilities' }),
  ])
  const frames: Buffer[] = []
  for (let offset = 0; offset < stream.byteLength; offset += 5) {
    frames.push(...await core.handleChunk(stream.subarray(offset, offset + 5)))
  }
  const responses = decodeResponses(frames)
  assert.deepEqual(responses.map((response) => response.id), ['a', 'b'])
  assert.deepEqual(responses.map((response) => response.ok), [true, true])
})

test('runGuestAgent answers over the stream and destroys it on a framing violation', async () => {
  const stream = new PassThrough()
  const written: Buffer[] = []
  const originalWrite = stream.write.bind(stream)
  stream.write = ((chunk: Buffer) => {
    written.push(Buffer.from(chunk))
    return true
  }) as typeof stream.write

  const agent = runGuestAgent({ stream, handlers: stubHandlers(), maxFrameBytes: 1024 })
  originalWrite(encodeFrame({ id: 'p', op: 'ping' }))
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
  const responses = decodeResponses(written)
  assert.deepEqual(responses, [{ id: 'p', ok: true, result: { pong: true } }])

  agent.sendEvent({ event: 'job-exit', jobId: 'j1', exitCode: 0, signal: null })
  assert.equal(written.length, 2)

  let streamError: Error | null = null
  stream.on('error', (error) => {
    streamError = error
  })
  const poison = Buffer.alloc(4)
  poison.writeUInt32BE(1_000_000, 0)
  originalWrite(poison)
  await agent.closed
  assert.equal(stream.destroyed, true)
  assert.match(String(streamError), /declared a 1000000-byte frame/)
})
