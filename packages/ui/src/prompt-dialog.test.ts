import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelPromptDialog, promptDialog } from './prompt-dialog'

test('a newer prompt cancels the active request and explicit cancellation resolves null', async () => {
  const first = promptDialog({ title: 'First' })
  const second = promptDialog({ title: 'Second' })
  assert.equal(await first, null)
  cancelPromptDialog()
  assert.equal(await second, null)
})
