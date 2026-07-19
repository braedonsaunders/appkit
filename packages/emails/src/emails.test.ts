import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consoleTransport, isEmailProvider, EMAIL_PROVIDER_SPECS } from './index'

test('provider catalogue has the expected providers', () => {
  const values = EMAIL_PROVIDER_SPECS.map((s) => s.value)
  for (const p of ['resend', 'sendgrid', 'mailgun', 'postmark', 'smtp']) {
    assert.ok(values.includes(p as never), `missing ${p}`)
  }
})

test('isEmailProvider guards unknown values', () => {
  assert.equal(isEmailProvider('smtp'), true)
  assert.equal(isEmailProvider('nope'), false)
  assert.equal(isEmailProvider(42), false)
})

test('consoleTransport sends and formats recipients', async () => {
  const lines: string[] = []
  const t = consoleTransport((m) => lines.push(m))
  const res = await t.send({
    from: { name: 'Acme', email: 'no-reply@acme.com' },
    to: ['a@x.com', { name: 'B', email: 'b@x.com' }],
    subject: 'Hi',
    text: 'body',
  })
  assert.ok(res.id?.startsWith('console-'))
  assert.match(lines[0]!, /to=a@x\.com, B <b@x\.com>/)
  assert.match(lines[0]!, /subject="Hi"/)
})
