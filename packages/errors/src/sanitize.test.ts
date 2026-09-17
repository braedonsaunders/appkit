import assert from 'node:assert/strict'
import test from 'node:test'
import { isTechnicalText, redactInternalIds, toDisplayMessage } from './sanitize'

// An actionable rule refusal: names the blocking state and the path forward.
const RULE_REFUSAL = 'The current phase must be closed before finalizing the summary'

test('an actionable server refusal renders verbatim', () => {
  assert.equal(toDisplayMessage(RULE_REFUSAL, 'fallback'), RULE_REFUSAL)
})

test('a raw SQL statement falls back instead of printing into the page', () => {
  const insert = "INSERT INTO records (workspace_id, name) VALUES ('9f8a…', 'Q3 plan')"
  assert.ok(isTechnicalText(insert))
  assert.equal(toDisplayMessage(insert, 'fallback'), 'fallback')
})

test('leading SELECT/UPDATE/DELETE/CREATE statements are technical', () => {
  assert.ok(isTechnicalText('SELECT * FROM records WHERE workspace_id = $1'))
  assert.ok(isTechnicalText('update records set status = $1'))
  assert.ok(isTechnicalText('  delete from records where id = $1'))
  assert.ok(isTechnicalText('CREATE TABLE records (id uuid)'))
})

test('a human sentence containing "select … from" is NOT technical', () => {
  // Fail-open is the design: suppressing an actionable message reads as a
  // dead button, which is the worse failure. Only leading SQL matches.
  const human = 'Please select a value from the list before continuing'
  assert.equal(isTechnicalText(human), false)
  assert.equal(toDisplayMessage(human, 'fallback'), human)
})

test('a V8 stack trace falls back', () => {
  const stack = 'Error: boom\n    at saveRecord (/app/server/src/records.ts:42:11)'
  assert.ok(isTechnicalText(stack))
  assert.equal(toDisplayMessage(stack, 'fallback'), 'fallback')
})

test('database driver fingerprints fall back', () => {
  assert.equal(
    toDisplayMessage('duplicate key value violates unique constraint "ux_records_name"', 'fallback'),
    'fallback',
  )
  assert.equal(toDisplayMessage('relation "records" does not exist', 'fallback'), 'fallback')
  assert.equal(toDisplayMessage('current transaction is aborted', 'fallback'), 'fallback')
  assert.equal(toDisplayMessage('connect ECONNREFUSED 10.0.0.85:5432', 'fallback'), 'fallback')
})

test('internal ids are redacted, record numbers and dates survive', () => {
  const withUuid = 'record 3f9a4b21-7c2e-4d5a-9f01-abcdef123456 could not be saved'
  assert.equal(toDisplayMessage(withUuid, 'fallback'), 'record … could not be saved')
  assert.equal(toDisplayMessage('REQ-1042 is already approved', 'fallback'), 'REQ-1042 is already approved')
})

test('missing, blank and non-string messages fall back', () => {
  assert.equal(toDisplayMessage(null, 'fallback'), 'fallback')
  assert.equal(toDisplayMessage(undefined, 'fallback'), 'fallback')
  assert.equal(toDisplayMessage('', 'fallback'), 'fallback')
  assert.equal(toDisplayMessage('   ', 'fallback'), 'fallback')
  assert.equal(toDisplayMessage({ error: 'x' }, 'fallback'), 'fallback')
  assert.equal(redactInternalIds('plain'), 'plain')
})
