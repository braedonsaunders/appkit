import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMAIL_PROVIDER_SPECS,
  buildTransport,
  isEmailProvider,
  isValidEmailAddress,
  normalizeEmailDeliveryInput,
  resolveEffectiveTransport,
  type Unseal,
} from './index'

test('provider catalogue has all five providers', () => {
  const values = EMAIL_PROVIDER_SPECS.map((s) => s.value)
  for (const p of ['resend', 'sendgrid', 'mailgun', 'postmark', 'smtp']) {
    assert.ok(values.includes(p as never), `missing ${p}`)
  }
  assert.equal(isEmailProvider('smtp'), true)
  assert.equal(isEmailProvider('nope'), false)
})

test('buildTransport builds each provider from plaintext config', () => {
  const base = { enabled: true, fromEmail: 'no-reply@acme.com', fromName: 'Acme' }
  assert.deepEqual(buildTransport({ ...base, provider: 'resend', secret: 're_key' }), {
    provider: 'resend',
    apiKey: 're_key',
    from: 'Acme <no-reply@acme.com>',
    replyTo: undefined,
  })
  assert.equal(buildTransport({ ...base, provider: 'sendgrid', secret: 'SG.x' })?.provider, 'sendgrid')
  const mg = buildTransport({ ...base, provider: 'mailgun', secret: 'k', mailgunDomain: 'mg.acme.com', mailgunRegion: 'eu' })
  assert.equal(mg?.provider === 'mailgun' && mg.region, 'eu')
  assert.equal(buildTransport({ ...base, provider: 'postmark', secret: 'tok' })?.provider, 'postmark')
  const smtp = buildTransport({ ...base, provider: 'smtp', smtpHost: 'smtp.acme.com', smtpUsername: 'u', secret: 'p' })
  assert.equal(smtp?.provider === 'smtp' && smtp.port, 587)
})

test('buildTransport rejects incomplete config', () => {
  assert.equal(buildTransport({ enabled: true, provider: 'resend', fromEmail: 'a@b.com' }), null) // no secret
  assert.equal(buildTransport({ enabled: true, provider: 'mailgun', secret: 'k', fromEmail: 'a@b.com' }), null) // no domain
  assert.equal(buildTransport({ enabled: true, provider: 'resend', secret: 'k' }), null) // no from
})

const unseal: Unseal = ({ ciphertext }) => (ciphertext === 'GOOD' ? 'the-secret' : null)
const sealed = { keyCiphertext: 'GOOD', keyNonce: 'n' }

test('resolveEffectiveTransport — disabled kill switch suppresses', () => {
  const r = resolveEffectiveTransport({ mode: 'disabled' }, null, { tenantScoped: true, unseal })
  assert.equal(r.kind, 'suppressed')
})

test('resolveEffectiveTransport — global_only uses the platform provider', () => {
  const platform = { mode: 'global_only' as const, enabled: true, provider: 'resend' as const, fromEmail: 'p@acme.com', ...sealed }
  const r = resolveEffectiveTransport(platform, { enabled: true, provider: 'postmark', fromEmail: 't@acme.com', ...sealed }, { tenantScoped: true, unseal })
  assert.equal(r.kind === 'transport' && r.source, 'platform')
})

test('resolveEffectiveTransport — tenant_optional prefers a scoped tenant provider', () => {
  const platform = { mode: 'tenant_optional' as const, enabled: true, provider: 'resend' as const, fromEmail: 'p@acme.com', ...sealed }
  const tenant = { enabled: true, provider: 'postmark' as const, fromEmail: 't@acme.com', ...sealed }
  const scoped = resolveEffectiveTransport(platform, tenant, { tenantScoped: true, unseal })
  assert.equal(scoped.kind === 'transport' && scoped.source, 'tenant')
  // A platform send (not tenant-scoped) never uses the tenant provider.
  const platformSend = resolveEffectiveTransport(platform, tenant, { tenantScoped: false, unseal })
  assert.equal(platformSend.kind === 'transport' && platformSend.source, 'platform')
})

test('resolveEffectiveTransport — a broken tenant override fails closed', () => {
  const platform = { mode: 'tenant_optional' as const, enabled: true, provider: 'resend' as const, fromEmail: 'p@acme.com', ...sealed }
  const brokenTenant = { enabled: true, provider: 'postmark' as const, fromEmail: 't@acme.com', keyCiphertext: 'BAD', keyNonce: 'n' }
  const r = resolveEffectiveTransport(platform, brokenTenant, { tenantScoped: true, unseal })
  assert.equal(r.kind, 'unconfigured')
})

test('normalizeEmailDeliveryInput validates recipients + body', () => {
  assert.throws(() => normalizeEmailDeliveryInput({ to: 'nope', subject: 's', text: 'b' }))
  assert.throws(() => normalizeEmailDeliveryInput({ to: 'a@b.com', subject: '', text: 'b' }))
  assert.throws(() => normalizeEmailDeliveryInput({ to: 'a@b.com', subject: 's' }))
  assert.throws(() => normalizeEmailDeliveryInput({ to: ['a@b.com', 'c@d.com'], subject: 's', text: 'b' }, { requireSingleRecipient: true }))
  const ok = normalizeEmailDeliveryInput({ to: ' a@b.com ', subject: 's', html: '<p>hi</p>' })
  assert.deepEqual(ok.to, ['a@b.com'])
  assert.equal(isValidEmailAddress('a@b.com'), true)
  assert.equal(isValidEmailAddress('nope'), false)
})
