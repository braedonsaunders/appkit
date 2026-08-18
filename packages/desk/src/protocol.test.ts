import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import {
  DeskProtocolError,
  encodeFrame,
  FrameDecoder,
  parseExecResult,
  parseGuestRequest,
  parseHostBoundMessage,
  parseObservation,
} from './protocol'

test('frames survive arbitrary chunk boundaries and preserve message order', () => {
  const first = encodeFrame({ id: 'a', op: 'ping' })
  const second = encodeFrame({ id: 'b', op: 'observe' })
  const stream = Buffer.concat([first, second])
  const decoder = new FrameDecoder()

  const received: unknown[] = []
  for (let offset = 0; offset < stream.byteLength; offset += 3) {
    received.push(...decoder.push(stream.subarray(offset, offset + 3)))
  }
  assert.deepEqual(received, [
    { id: 'a', op: 'ping' },
    { id: 'b', op: 'observe' },
  ])
})

test('a declared frame length beyond the bound is rejected before any body arrives', () => {
  const decoder = new FrameDecoder({ maxFrameBytes: 16 })
  const header = Buffer.alloc(4)
  header.writeUInt32BE(1_000_000, 0)
  assert.throws(() => decoder.push(header), /declared a 1000000-byte frame/)
})

test('a frame whose body is not JSON is a fatal protocol violation', () => {
  const body = Buffer.from('not json at all', 'utf8')
  const frame = Buffer.alloc(4 + body.byteLength)
  frame.writeUInt32BE(body.byteLength, 0)
  body.copy(frame, 4)
  assert.throws(() => new FrameDecoder().push(frame), /not valid JSON/)
})

test('encoding refuses to produce a frame beyond the bound', () => {
  assert.throws(() => encodeFrame({ data: 'x'.repeat(64) }, 16), /Refusing to encode/)
})

test('guest requests parse strictly and unknown ops are rejected', () => {
  const exec = parseGuestRequest({
    id: 'req-1',
    op: 'exec',
    command: '/usr/bin/uname',
    args: ['-a'],
    env: { LANG: 'C' },
    timeoutMs: 5_000,
  })
  assert.equal(exec.op, 'exec')

  const handover = parseGuestRequest({ id: 'req-2', op: 'handover-begin', ttlMs: 60_000, scope: 'control' })
  assert.equal(handover.op, 'handover-begin')

  assert.throws(() => parseGuestRequest({ id: 'req-3', op: 'format-disk' }), /Unknown request op/)
  assert.throws(() => parseGuestRequest({ op: 'ping' }), DeskProtocolError)
  assert.throws(() => parseGuestRequest({ id: 'bad id!', op: 'ping' }), /URL-safe/)
  assert.throws(() => parseGuestRequest({ id: 'r', op: 'exec' }), /command/)
  assert.throws(
    () => parseGuestRequest({ id: 'r', op: 'exec', command: '/bin/sh', env: { 'BAD-NAME': 'x' } }),
    /Invalid environment variable name/,
  )
  assert.throws(
    () => parseGuestRequest({ id: 'r', op: 'screen-start', width: -1, height: 900 }),
    /width/,
  )
  assert.throws(
    () => parseGuestRequest({ id: 'r', op: 'input', input: { type: 'hover', x: 1, y: 1 } }),
    /Unknown input type/,
  )
  assert.deepEqual(
    parseGuestRequest({ id: 'r', op: 'input', input: { type: 'click', x: 1, y: 2, button: 'left', clicks: 2 } }),
    { id: 'r', op: 'input', input: { type: 'click', x: 1, y: 2, button: 'left', clicks: 2 } },
  )
  assert.throws(
    () => parseGuestRequest({ id: 'r', op: 'input', input: { type: 'click', x: 1, y: 2, button: 'left', clicks: 3 } }),
    /clicks must be 1 or 2/,
  )
  assert.throws(
    () => parseGuestRequest({ id: 'r', op: 'handover-begin', ttlMs: 1, scope: 'everything' }),
    /scope/,
  )
})

test('argument lists and environments are bounded', () => {
  assert.throws(
    () => parseGuestRequest({
      id: 'r',
      op: 'exec',
      command: '/bin/echo',
      args: Array.from({ length: 300 }, () => 'x'),
    }),
    /at most 256/,
  )
  assert.throws(
    () => parseGuestRequest({
      id: 'r',
      op: 'exec',
      command: '/bin/echo',
      env: Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`V${index}`, 'x'])),
    }),
    /at most 128/,
  )
})

test('host-bound messages parse responses and events, rejecting everything else', () => {
  assert.deepEqual(parseHostBoundMessage({ id: 'a', ok: true, result: { pong: true } }), {
    id: 'a',
    ok: true,
    result: { pong: true },
  })
  assert.deepEqual(parseHostBoundMessage({ id: 'a', ok: false, error: 'nope' }), {
    id: 'a',
    ok: false,
    error: 'nope',
  })
  const frame = parseHostBoundMessage({ event: 'frame', seq: 1, width: 10, height: 10, data: 'aGk=' })
  assert.ok('event' in frame && frame.event === 'frame')
  const exit = parseHostBoundMessage({ event: 'job-exit', jobId: 'j1', exitCode: 0, signal: null })
  assert.ok('event' in exit && exit.event === 'job-exit')

  assert.throws(() => parseHostBoundMessage({ id: 'a', ok: 'yes' }), /ok must be a boolean/)
  assert.throws(() => parseHostBoundMessage({ event: 'surprise' }), /Unknown event/)
  assert.throws(() => parseHostBoundMessage('nonsense'), DeskProtocolError)
})

test('a frame without a format is a png, because that is what frames used to be', () => {
  // Compatibility, not a default for its own sake: a guest that predates the
  // field emits no format, and every one of its frames must still parse.
  const legacy = parseHostBoundMessage({ event: 'frame', seq: 1, width: 10, height: 10, data: 'aGk=' })
  assert.ok('event' in legacy && legacy.event === 'frame')
  assert.equal(legacy.format, 'png')

  const jpeg = parseHostBoundMessage({
    event: 'frame',
    seq: 2,
    width: 10,
    height: 10,
    data: 'aGk=',
    format: 'jpeg',
  })
  assert.ok('event' in jpeg && jpeg.event === 'frame')
  assert.equal(jpeg.format, 'jpeg')

  assert.throws(
    () => parseHostBoundMessage({ event: 'frame', seq: 3, width: 10, height: 10, data: 'aGk=', format: 'webp' }),
    /format must be png or jpeg/,
  )
})

test('frames-start carries an optional format, and refuses one it does not know', () => {
  const asked = parseGuestRequest({ id: 'r1', op: 'frames-start', fps: 30, width: 1280, height: 900, format: 'jpeg' })
  assert.ok(asked.op === 'frames-start')
  assert.equal(asked.format, 'jpeg')

  const unasked = parseGuestRequest({ id: 'r2', op: 'frames-start', fps: 10, width: 1280, height: 900 })
  assert.ok(unasked.op === 'frames-start')
  assert.equal(unasked.format, undefined)

  assert.throws(
    () => parseGuestRequest({ id: 'r3', op: 'frames-start', fps: 10, width: 1280, height: 900, format: 'gif' }),
    /format must be png or jpeg/,
  )
})

test('video chunks and video-start parse strictly', () => {
  const init = parseHostBoundMessage({
    event: 'video-chunk',
    seq: 0,
    kind: 'init',
    codec: 'avc1.42C020',
    width: 1280,
    height: 900,
    data: 'AAAA',
  })
  assert.ok('event' in init && init.event === 'video-chunk')
  assert.equal(init.kind, 'init')
  // Absent means not a keyframe, which is what an init segment is.
  assert.equal(init.keyframe, false)

  const media = parseHostBoundMessage({
    event: 'video-chunk',
    seq: 1,
    kind: 'media',
    codec: 'avc1.42C020',
    width: 1280,
    height: 900,
    keyframe: true,
    data: 'AAAA',
  })
  assert.ok('event' in media && media.event === 'video-chunk')
  assert.equal(media.keyframe, true)

  assert.throws(
    () => parseHostBoundMessage({
      event: 'video-chunk', seq: 1, kind: 'trailer', codec: 'avc1.42C020', width: 8, height: 8, data: 'AA',
    }),
    /kind must be init or media/,
  )

  const start = parseGuestRequest({ id: 'v1', op: 'video-start', fps: 30, width: 1280, height: 900 })
  assert.ok(start.op === 'video-start')
  assert.equal(start.fps, 30)
  assert.deepEqual(parseGuestRequest({ id: 'v2', op: 'video-stop' }), { id: 'v2', op: 'video-stop' })
  assert.throws(() => parseGuestRequest({ id: 'v3', op: 'video-start', fps: 0, width: 8, height: 8 }), DeskProtocolError)
})

test('exec results and observations are validated before the host trusts them', () => {
  const result = parseExecResult({ exitCode: 0, signal: null, stdout: 'hi', stderr: '', truncated: false })
  assert.equal(result.exitCode, 0)
  assert.throws(() => parseExecResult({ exitCode: 'zero', stdout: '', stderr: '' }), DeskProtocolError)

  const observation = parseObservation({
    png: Buffer.from('fake').toString('base64'),
    width: 1280,
    height: 900,
    a11y: {
      id: 'root',
      role: 'frame',
      name: 'Files',
      actions: ['focus'],
      bounds: { x: 0, y: 0, width: 1280, height: 900 },
      children: [{ id: 'child', role: 'push button', name: 'Open', children: [] }],
    },
    windows: [{ id: 'w1', title: 'Files', appId: 'org.xfce.Thunar' }],
    focused: { id: 'w1', title: 'Files', appId: 'org.xfce.Thunar' },
  })
  assert.equal(observation.a11y?.children[0]?.role, 'push button')
  assert.equal(observation.focused?.id, 'w1')

  assert.throws(
    () => parseObservation({ png: 'aGk=', width: 1280, height: 900, a11y: deepTree(40), windows: [] }),
    /depth/,
  )
})

function deepTree(depth: number): Record<string, unknown> {
  let node: Record<string, unknown> = { id: 'leaf', role: 'label', children: [] }
  for (let index = 0; index < depth; index += 1) {
    node = { id: `n${index}`, role: 'panel', children: [node] }
  }
  return node
}
