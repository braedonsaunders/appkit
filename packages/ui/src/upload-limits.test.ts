import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultMaxUploadBytes, formatUploadSizeLimit } from './upload-limits'

test('file upload limits preserve the complete source ceilings and binary labels', () => {
  assert.equal(defaultMaxUploadBytes('document'), 1024 * 1024 * 1024)
  assert.equal(formatUploadSizeLimit(defaultMaxUploadBytes('document')), '1 GiB')
  assert.equal(defaultMaxUploadBytes('image'), 50 * 1024 * 1024)
  assert.equal(defaultMaxUploadBytes('signature'), 10 * 1024 * 1024)
  assert.equal(defaultMaxUploadBytes('audio'), 200 * 1024 * 1024)
  assert.equal(defaultMaxUploadBytes('video'), 500 * 1024 * 1024)
  assert.equal(defaultMaxUploadBytes('other'), 500 * 1024 * 1024)
  assert.equal(formatUploadSizeLimit(500 * 1024 * 1024), '500 MiB')
})
