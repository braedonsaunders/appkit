import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDeskFrameDeduplicator } from './frames'

test('desk frame identities detect exact repeats and reset between sessions', () => {
  const frames = createDeskFrameDeduplicator()
  const first = frames.observe(Buffer.from('pixels'))
  const repeated = frames.observe(Buffer.from('pixels'))
  const changed = frames.observe(Buffer.from('new pixels'))
  assert.equal(first.changed, true)
  assert.equal(repeated.changed, false)
  assert.equal(repeated.frameId, first.frameId)
  assert.equal(changed.changed, true)
  assert.notEqual(changed.frameId, first.frameId)
  frames.reset()
  assert.equal(frames.observe(Buffer.from('new pixels')).changed, true)
})

test('desk frame identities include the media type', () => {
  const frames = createDeskFrameDeduplicator()
  const png = frames.observe(Buffer.from('same'), 'image/png')
  const jpeg = frames.observe(Buffer.from('same'), 'image/jpeg')
  assert.notEqual(png.frameId, jpeg.frameId)
  assert.equal(jpeg.changed, true)
})
