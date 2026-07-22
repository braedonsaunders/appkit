import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateClientResults } from './client'

test('client gates collect warnings, fail open on errors, and stop on an explicit abort', () => {
  const errors: string[] = []
  const result = evaluateClientResults([
    { id: '1', name: 'Warn', result: { warnings: ['Check the total'] } },
    { id: '2', name: 'Broken', error: 'boom' },
    { id: '3', name: 'Block', result: { abort: 'A reference is required' } },
  ], (message) => errors.push(message))
  assert.deepEqual(result, { ok: false, reason: 'Block: A reference is required', warnings: ['Warn: Check the total'] })
  assert.deepEqual(errors, ['client script "Broken" failed'])
})
