import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SMS_PROVIDER_SPECS,
  buildSmsTransport,
  isSmsProvider,
  isValidSmsDestination,
  resolveEffectiveSmsTransport,
  resolveSmsTransport,
  sendSmsVia,
  validateStoredSmsConfig,
  type SmsTransport,
  type Unseal,
} from './index'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('provider catalogue has all five providers', () => {
  const values = SMS_PROVIDER_SPECS.map((s) => s.value)
  for (const p of ['twilio', 'vonage', 'messagebird', 'plivo', 'telnyx']) {
    assert.ok(values.includes(p as never), `missing ${p}`)
  }
  assert.equal(isSmsProvider('twilio'), true)
  assert.equal(isSmsProvider('nope'), false)
  assert.equal(isSmsProvider('toString'), false)
  assert.equal(isSmsProvider('__proto__'), false)
})

test('E.164 destination validation', () => {
  assert.equal(isValidSmsDestination('+15551234567'), true)
  assert.equal(isValidSmsDestination('15551234567'), false)
  assert.equal(isValidSmsDestination('+0551234567'), false)
  assert.equal(isValidSmsDestination('+1'), false)
})

test('buildSmsTransport builds each provider from plaintext config', () => {
  const base = { enabled: true, fromNumber: '+15550001111' }
  assert.deepEqual(
    buildSmsTransport({ ...base, provider: 'twilio', twilioAccountSid: 'AC123', secret: 'tok' }),
    { provider: 'twilio', accountSid: 'AC123', authToken: 'tok', from: '+15550001111' },
  )
  assert.equal(buildSmsTransport({ ...base, provider: 'vonage', vonageApiKey: 'k', secret: 's' })?.provider, 'vonage')
  assert.equal(buildSmsTransport({ ...base, provider: 'messagebird', secret: 'ak' })?.provider, 'messagebird')
  assert.equal(buildSmsTransport({ ...base, provider: 'plivo', plivoAuthId: 'MA1', secret: 't' })?.provider, 'plivo')
  const telnyx = buildSmsTransport({ ...base, provider: 'telnyx', secret: 'key', telnyxMessagingProfileId: 'mp1' })
  assert.equal(telnyx?.provider === 'telnyx' && telnyx.messagingProfileId, 'mp1')
})

test('buildSmsTransport rejects incomplete config', () => {
  assert.equal(buildSmsTransport({ enabled: true, provider: 'twilio', fromNumber: '+15550001111', secret: 't' }), null) // no SID
  assert.equal(buildSmsTransport({ enabled: true, provider: 'twilio', twilioAccountSid: 'AC1', secret: 't' }), null) // no sender
  assert.equal(buildSmsTransport({ enabled: true, provider: 'messagebird', fromNumber: '+15550001111' }), null) // no secret
})

test('validateStoredSmsConfig rejects control characters + mismatched seal halves', () => {
  assert.throws(() => validateStoredSmsConfig({ fromNumber: 'bad\u0000sender' }))
  assert.throws(() => validateStoredSmsConfig({ keyCiphertext: 'x' })) // nonce missing
  assert.doesNotThrow(() => validateStoredSmsConfig({ provider: 'twilio' })) // incomplete draft ok
})

const unseal: Unseal = ({ ciphertext }) => (ciphertext === 'GOOD' ? 'plain-secret' : null)
const sealed = { keyCiphertext: 'GOOD', keyNonce: 'n' }

test('resolveEffectiveSmsTransport policy branches', () => {
  const platform = {
    mode: 'tenant_optional' as const,
    enabled: true,
    provider: 'telnyx' as const,
    fromNumber: '+15550001111',
    ...sealed,
  }
  const tenant = {
    enabled: true,
    provider: 'twilio' as const,
    twilioAccountSid: 'AC9',
    fromNumber: '+15550002222',
    ...sealed,
  }
  // kill switch
  assert.equal(resolveEffectiveSmsTransport({ mode: 'disabled' }, tenant, { tenantScoped: true, unseal }).kind, 'suppressed')
  // tenant preferred when scoped
  const scoped = resolveEffectiveSmsTransport(platform, tenant, { tenantScoped: true, unseal })
  assert.equal(scoped.kind === 'transport' && scoped.source, 'tenant')
  // platform sends never use the tenant provider
  const platformSend = resolveEffectiveSmsTransport(platform, tenant, { tenantScoped: false, unseal })
  assert.equal(platformSend.kind === 'transport' && platformSend.source, 'platform')
  // broken tenant override fails closed
  const broken = resolveEffectiveSmsTransport(platform, { ...tenant, keyCiphertext: 'BAD' }, { tenantScoped: true, unseal })
  assert.equal(broken.kind, 'unconfigured')
})

test('resolveSmsTransport unseals a stored credential', () => {
  assert.deepEqual(
    resolveSmsTransport(
      {
        enabled: true,
        provider: 'messagebird',
        fromNumber: 'Appkit',
        ...sealed,
      },
      unseal,
    ),
    { provider: 'messagebird', accessKey: 'plain-secret', from: 'Appkit' },
  )
})

const INPUT = { to: '+15551234567', body: 'Hello from appkit' }

test('Twilio sends a form request and returns its durable message id', async () => {
  let request: { url: string; init?: RequestInit } | undefined
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init }
    return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 })
  }
  const transport: SmsTransport = {
    provider: 'twilio',
    accountSid: 'AC9',
    authToken: 'token',
    from: '+15550001111',
  }

  assert.deepEqual(await sendSmsVia(transport, INPUT), { id: 'SM1' })
  assert.equal(request?.url, 'https://api.twilio.com/2010-04-01/Accounts/AC9/Messages.json')
  assert.match(String(request?.init?.body), /From=%2B15550001111/)
  assert.match(String((request?.init?.headers as Record<string, string>).Authorization), /^Basic /)
  assert.equal(request?.init?.redirect, 'manual')
})

test('Twilio routes Messaging Service senders to MessagingServiceSid', async () => {
  let body = ''
  globalThis.fetch = async (_input, init) => {
    body = String(init?.body)
    return new Response(JSON.stringify({ sid: 'SM2' }), { status: 201 })
  }
  await sendSmsVia(
    { provider: 'twilio', accountSid: 'AC9', authToken: 'token', from: 'MG123' },
    INPUT,
  )
  assert.match(body, /MessagingServiceSid=MG123/)
  assert.doesNotMatch(body, /(?:^|&)From=/)
})

test('provider failures are surfaced and credentials are redacted', async () => {
  const token = 'super-secret-twilio-token'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: `Rejected credential ${token}` }), { status: 401 })

  await assert.rejects(
    sendSmsVia(
      { provider: 'twilio', accountSid: 'AC9', authToken: token, from: '+15550001111' },
      INPUT,
    ),
    (error: Error) => {
      assert.match(error.message, /Rejected credential \[redacted\]/)
      assert.doesNotMatch(error.message, new RegExp(token))
      return true
    },
  )
})

test('Vonage checks its per-message status even when HTTP succeeds', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ messages: [{ status: '4', 'error-text': 'bad key' }] }), {
      status: 200,
    })
  await assert.rejects(
    sendSmsVia(
      { provider: 'vonage', apiKey: 'vonage-api-key', apiSecret: 'vonage-api-secret', from: 'Appkit' },
      INPUT,
    ),
    /Vonage: bad key/,
  )
})

test('invalid destinations fail before making a provider request', async () => {
  let called = false
  globalThis.fetch = async () => {
    called = true
    return new Response('{}', { status: 201 })
  }
  await assert.rejects(
    sendSmsVia(
      { provider: 'twilio', accountSid: 'AC9', authToken: 'token', from: '+15550001111' },
      { to: '5551234', body: 'Hello' },
    ),
    /E\.164/,
  )
  assert.equal(called, false)
})

test('provider success without a message id is rejected', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 201 })
  await assert.rejects(
    sendSmsVia(
      { provider: 'twilio', accountSid: 'AC9', authToken: 'token', from: '+15550001111' },
      INPUT,
    ),
    /without a message id/,
  )
})
