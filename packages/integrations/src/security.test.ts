import assert from 'node:assert/strict'
import test from 'node:test'
import { createIntegrationEmailBodyRenderer } from './email'
import { httpDestination } from './http'
import { sqlDestination } from './sql'
import { deliveryRef } from './idempotency'
import type { DeliverContext } from './types'

test('email destination sanitizes authored markup and never promotes record values to HTML', () => {
  const render = createIntegrationEmailBodyRenderer(
    '<p onclick="alert(1)">Hello {{{name}}}</p><a href="javascript:alert(1)">Open</a><script>alert(1)</script>',
  )
  const html = render({ name: 'Alice & </p><img src=x onerror=alert(1)><p>' })
  assert.match(html, /Hello Alice &amp;/)
  assert.doesNotMatch(html, /<img|onerror|onclick|javascript:|<script/i)
  assert.throws(
    () => createIntegrationEmailBodyRenderer('<script>alert(1)</script>'),
    /no safe content/,
  )
})

test('HTTP checks reject non-HTTPS and private targets without egress', async () => {
  const insecure = await httpDestination.test?.({
    tenantId: 'tenant',
    config: { url: 'http://example.com' },
    secrets: {},
  })
  assert.equal(insecure?.ok, false)
  assert.match(insecure?.error ?? '', /must use HTTPS/)
  const privateTarget = await httpDestination.test?.({
    tenantId: 'tenant',
    config: { url: 'https://127.0.0.1/hook' },
    secrets: {},
  })
  assert.equal(privateTarget?.ok, false)
  assert.match(privateTarget?.error ?? '', /blocked non-public/)
})

test('HTTP resumes a partial attempt without replaying successful items', async () => {
  const ref = deliveryRef('http', 'record.created', 'record-1', 0)
  const context: DeliverContext = {
    tenantId: 'tenant',
    config: { method: 'POST', url: 'https://127.0.0.1/not-requested' },
    secrets: {},
    triggerKey: 'record.created',
    subjectId: 'record-1',
    items: [{ reference: 'REC-1' }],
    mapping: {},
    priorRefs: [ref],
    retryRefs: [ref],
    oncePerRecord: false,
    log() {},
  }
  const result = await httpDestination.deliver(context)
  assert.equal(result.ok, true)
  assert.deepEqual(result.refs, [{ externalRef: ref }])
  assert.match(result.summary ?? '', /already succeeded/)
})

test('SQL requires an identity column before connecting or inserting', async () => {
  const result = await sqlDestination.deliver({
    tenantId: 'tenant',
    config: {
      dbKind: 'postgres',
      host: 'db.example.com',
      database: 'app',
      username: 'service',
      ssl: true,
    },
    secrets: { password: 'secret' },
    triggerKey: 'record.created',
    subjectId: 'record-1',
    items: [{ recordId: 'one' }],
    mapping: { table: 'exports', columns: { record_id: '{{recordId}}' } },
    priorRefs: [],
    retryRefs: [],
    oncePerRecord: false,
    log() {},
  })
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /identity column is required/)
})
