import assert from 'node:assert/strict'
import test from 'node:test'
import { createSealer } from '@appkit/crypto'
import {
  CARRIER_PROVIDER_SPECS,
  CarrierError,
  buildCarrierClient,
  carrierProviderSpec,
  isCarrierProvider,
  isValidPhoneNumber,
  resolveCarrierClient,
  validatePlainCarrierConfig,
  validateStoredCarrierConfig,
  type CarrierClient,
} from './index'

// Assembled rather than written out: config validation requires a real-shaped
// Twilio SID (AC + 32 hex), and a literal of that shape trips secret scanning.
const ACCOUNT = `AC${'0123456789abcdef'.repeat(2)}`
const SECRET = 'a-twilio-auth-token'

// --- A recording fetch stub -------------------------------------------------
//
// Every carrier call goes through global fetch, so the whole client is
// exercisable without a network by swapping it for a scripted queue.

type Exchange = { status: number; body: unknown }
type Recorded = { url: string; method: string; form: Record<string, string> }

function withFetch(exchanges: Exchange[], run: (calls: Recorded[]) => Promise<void>): Promise<void> {
  const calls: Recorded[] = []
  const queue = [...exchanges]
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const next = queue.shift()
    assert.ok(next, `unexpected extra request to ${String(input)}`)
    const form: Record<string, string> = {}
    if (typeof init?.body === 'string') {
      for (const [key, value] of new URLSearchParams(init.body)) form[key] = value
    }
    calls.push({ url: String(input), method: init?.method ?? 'GET', form })
    // 204/205/304 must carry no body, which is exactly what a carrier returns
    // from a successful DELETE — the client has to cope with an empty response.
    const bodyless = next.status === 204 || next.status === 205 || next.status === 304
    return new Response(bodyless ? null : JSON.stringify(next.body), {
      status: next.status,
      ...(bodyless ? {} : { headers: { 'Content-Type': 'application/json' } }),
    })
  }) as typeof globalThis.fetch
  return run(calls)
    .finally(() => {
      globalThis.fetch = original
    })
    .then(() => {
      assert.equal(queue.length, 0, 'not every scripted response was consumed')
    })
}

function client(): CarrierClient {
  return buildCarrierClient({ provider: 'twilio', accountId: ACCOUNT, secret: SECRET })
}

// --- Catalogue --------------------------------------------------------------

test('the catalogue describes every carrier the factory accepts', () => {
  assert.ok(CARRIER_PROVIDER_SPECS.length > 0)
  for (const spec of CARRIER_PROVIDER_SPECS) {
    assert.ok(isCarrierProvider(spec.value))
    assert.equal(carrierProviderSpec(spec.value).label, spec.label)
    assert.ok(spec.signalingRanges.length > 0, `${spec.value} publishes no signalling ranges`)
    for (const range of spec.signalingRanges) {
      assert.match(range, /^[0-9.]+\/[0-9]{1,2}$/, `${range} is not a CIDR`)
    }
  }
})

test('unknown carriers are rejected rather than guessed at', () => {
  assert.equal(isCarrierProvider('telnyx'), false)
  assert.throws(() => carrierProviderSpec('telnyx' as never), /Unknown carrier provider/)
})

// --- Config -----------------------------------------------------------------

test('a complete stored config validates and an incomplete one does not', () => {
  assert.throws(() => validateStoredCarrierConfig({}, { requireComplete: true }), /Select a telephony carrier/)
  assert.throws(
    () => validateStoredCarrierConfig({ provider: 'twilio', accountId: ACCOUNT }, { requireComplete: true }),
    /Enter the carrier secret/,
  )
  validateStoredCarrierConfig(
    { provider: 'twilio', accountId: ACCOUNT, keyCiphertext: 'c', keyNonce: 'n' },
    { requireComplete: true },
  )
})

test('a malformed Twilio account id is refused before any request', () => {
  assert.throws(
    () => validatePlainCarrierConfig({ provider: 'twilio', accountId: 'not-a-sid', secret: SECRET }),
    /starts with AC/,
  )
})

test('resolve unseals a stored secret into a usable client', () => {
  const sealer = createSealer(Buffer.alloc(32, 7).toString('base64'))
  const sealed = sealer.sealSecret(SECRET)
  const resolved = resolveCarrierClient(
    {
      enabled: true,
      provider: 'twilio',
      accountId: ACCOUNT,
      keyCiphertext: sealed.ciphertext,
      keyNonce: sealed.nonce,
    },
    (value) => sealer.unsealSecret(value),
  )
  assert.ok(resolved)
  assert.equal(resolved.provider, 'twilio')
})

test('resolve yields nothing when disabled, incomplete, or unsealable', () => {
  const complete = { provider: 'twilio' as const, accountId: ACCOUNT, keyCiphertext: 'c', keyNonce: 'n' }
  assert.equal(resolveCarrierClient({ ...complete, enabled: false }, () => SECRET), null)
  assert.equal(resolveCarrierClient({ enabled: true, provider: 'twilio' }, () => SECRET), null)
  // A secret sealed under a key this deployment no longer holds is no account.
  assert.equal(resolveCarrierClient({ ...complete, enabled: true }, () => null), null)
})

// --- Numbers ----------------------------------------------------------------

test('E.164 is enforced on anything dialable', () => {
  assert.ok(isValidPhoneNumber('+15551234567'))
  assert.equal(isValidPhoneNumber('15551234567'), false)
  assert.equal(isValidPhoneNumber('+0555123456'), false)
})

test('a number search normalizes what the carrier returns', async () => {
  await withFetch(
    [
      {
        status: 200,
        body: {
          available_phone_numbers: [
            {
              phone_number: '+14155550123',
              friendly_name: '(415) 555-0123',
              locality: 'San Francisco',
              region: 'CA',
              capabilities: { voice: true, SMS: true },
            },
            { friendly_name: 'no number at all' },
          ],
        },
      },
    ],
    async (calls) => {
      const found = await client().searchNumbers({ country: 'us', areaCode: '415' })
      assert.equal(found.length, 1, 'a row without a number is dropped, not surfaced as blank')
      assert.deepEqual(found[0], {
        number: '+14155550123',
        label: '(415) 555-0123',
        locality: 'San Francisco',
        region: 'CA',
        voice: true,
        sms: true,
      })
      assert.match(calls[0]!.url, /AvailablePhoneNumbers\/US\/Local\.json/)
      assert.match(calls[0]!.url, /AreaCode=415/)
    },
  )
})

test('search inputs are validated before a request leaves', async () => {
  await withFetch([], async () => {
    await assert.rejects(client().searchNumbers({ country: 'USA' }), /two-letter ISO code/)
    await assert.rejects(client().searchNumbers({ country: 'US', areaCode: 'abc' }), /digits only/)
  })
})

// --- Trunks -----------------------------------------------------------------

test('ensureTrunk returns the normalized seam and never a carrier object model', async () => {
  await withFetch(
    [
      { status: 201, body: { sid: 'TK1', domain_name: 'appkit-abc.pstn.twilio.com' } },
      { status: 201, body: { sid: 'OU1' } },
      { status: 201, body: { sid: 'CL1' } },
      { status: 201, body: { sid: 'SC1' } },
      { status: 201, body: { sid: 'CL1' } },
    ],
    async (calls) => {
      const trunk = await client().ensureTrunk({
        label: 'bunkhouse',
        originationUri: 'sip:voice.example.com:5060',
      })
      assert.equal(trunk.carrierTrunkId, 'TK1')
      assert.equal(trunk.terminationHost, 'appkit-abc.pstn.twilio.com')
      assert.equal(trunk.terminationPort, 5060)
      assert.ok(trunk.authUsername.startsWith('appkit'))
      // Twilio's own rule for SIP credentials.
      assert.ok(trunk.authPassword.length >= 12 && trunk.authPassword.length <= 32)
      assert.match(trunk.authPassword, /[A-Z]/)
      assert.match(trunk.authPassword, /[a-z]/)
      assert.match(trunk.authPassword, /[0-9]/)
      assert.deepEqual(trunk.signalingRanges, carrierProviderSpec('twilio').signalingRanges)
      assert.equal(calls[1]!.form.SipUrl, 'sip:voice.example.com:5060')
    },
  )
})

test('a half-built trunk is unwound rather than left pointing nowhere', async () => {
  await withFetch(
    [
      { status: 201, body: { sid: 'TK9', domain_name: 'appkit-xyz.pstn.twilio.com' } },
      { status: 400, body: { message: 'Origination URL is not reachable', code: 21631 } },
      { status: 204, body: {} },
    ],
    async (calls) => {
      await assert.rejects(
        client().ensureTrunk({ label: 'bunkhouse', originationUri: 'sip:voice.example.com:5060' }),
        (error: unknown) => {
          assert.ok(error instanceof CarrierError)
          assert.equal(error.code, 21631)
          assert.equal(error.provider, 'twilio')
          return true
        },
      )
      assert.equal(calls.at(-1)!.method, 'DELETE', 'the orphaned trunk was not deleted')
      assert.match(calls.at(-1)!.url, /Trunks\/TK9$/)
    },
  )
})

test('a malformed origination URI is refused before a trunk is created', async () => {
  await withFetch([], async () => {
    await assert.rejects(
      client().ensureTrunk({ label: 'bunkhouse', originationUri: 'voice.example.com' }),
      /must be a SIP URI/,
    )
  })
})

// --- Buying and releasing ---------------------------------------------------

test('buying puts the number on the trunk in the same request', async () => {
  await withFetch(
    [{ status: 201, body: { sid: 'PN1', phone_number: '+14155550123' } }],
    async (calls) => {
      const bought = await client().buyNumber({
        number: '+14155550123',
        label: 'Main line',
        carrierTrunkId: 'TK1',
      })
      assert.deepEqual(bought, { numberId: 'PN1', number: '+14155550123' })
      // Without TrunkSid on the purchase the number would ring nothing.
      assert.equal(calls[0]!.form.TrunkSid, 'TK1')
    },
  )
})

test('a carrier that reports success without a number is treated as a failure', async () => {
  await withFetch([{ status: 201, body: { sid: 'PN1' } }], async () => {
    await assert.rejects(
      client().buyNumber({ number: '+14155550123', label: 'Main line', carrierTrunkId: 'TK1' }),
      /did not return it/,
    )
  })
})

test('releasing hands the number back', async () => {
  await withFetch([{ status: 204, body: {} }], async (calls) => {
    await client().releaseNumber('PN1')
    assert.equal(calls[0]!.method, 'DELETE')
    assert.match(calls[0]!.url, /IncomingPhoneNumbers\/PN1\.json$/)
  })
})

test('a carrier refusal surfaces the carrier’s own message', async () => {
  await withFetch(
    [{ status: 403, body: { message: 'Account not authorized to purchase', code: 21404 } }],
    async () => {
      await assert.rejects(
        client().buyNumber({ number: '+14155550123', label: 'Main line', carrierTrunkId: 'TK1' }),
        (error: unknown) => {
          assert.ok(error instanceof CarrierError)
          assert.equal(error.message, 'Account not authorized to purchase')
          assert.equal(error.status, 403)
          return true
        },
      )
    },
  )
})
