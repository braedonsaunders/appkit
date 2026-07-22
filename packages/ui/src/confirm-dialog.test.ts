import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelConfirmDialog, confirmDialog } from './confirm-dialog'

test('a replacement confirmation settles the prior request instead of leaking its promise', async () => {
  const first = confirmDialog('First')
  const second = confirmDialog('Second')
  assert.equal(await first, false)
  cancelConfirmDialog()
  assert.equal(await second, false)
})
