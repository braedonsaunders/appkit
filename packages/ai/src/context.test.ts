import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ModelMessage } from 'ai'
import { pruneVisualToolContext } from './context'

function result(id: string, image: string): ModelMessage {
  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: id,
      toolName: 'desktop_screenshot',
      input: {},
      output: {
        type: 'content',
        value: [
          { type: 'text', text: `frame ${id}` },
          { type: 'image-data', mediaType: 'image/jpeg', data: image },
        ],
      },
    }],
  } as unknown as ModelMessage
}

function imageCount(messages: readonly ModelMessage[]): number {
  return JSON.stringify(messages).split('image-data').length - 1
}

test('visual context keeps only the newest distinct tool frames', () => {
  const messages = [result('one', 'aaa'), result('two', 'bbb'), result('three', 'ccc')]
  const pruned = pruneVisualToolContext(messages, { keepRecent: 2 })
  assert.equal(imageCount(pruned.messages), 2)
  assert.equal(pruned.prunedFrames, 1)
  assert.equal(pruned.deduplicatedFrames, 0)
  assert.equal(imageCount(messages), 3, 'input messages are not mutated')
})

test('visual context drops exact repeated frames even inside the recent window', () => {
  const messages = [result('one', 'same'), result('two', 'same'), result('three', 'new')]
  const pruned = pruneVisualToolContext(messages, { keepRecent: 3 })
  assert.equal(imageCount(pruned.messages), 2)
  assert.equal(pruned.prunedFrames, 0)
  assert.equal(pruned.deduplicatedFrames, 1)
})

test('visual context never strips user-supplied images', () => {
  const user = {
    role: 'user',
    content: [{ type: 'image', image: 'receipt-bytes', mediaType: 'image/png' }],
  } as unknown as ModelMessage
  const pruned = pruneVisualToolContext([user, result('one', 'desk')], { keepRecent: 0 })
  assert.match(JSON.stringify(pruned.messages[0]), /receipt-bytes/)
  assert.equal(imageCount(pruned.messages.slice(1)), 0)
})
