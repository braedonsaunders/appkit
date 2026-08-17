// Carrier client factory + carrier implementations.
//
// `RawCarrierConfig` is what an app persists per tenant, with the single secret
// sealed. `resolveCarrierClient` unseals it (via an injected `unseal`, e.g.
// @braedonsaunders/appkit-crypto's unsealSecret) into a `CarrierClient`; `buildCarrierClient`
// does the same from already-plaintext values. Every carrier goes through
// `fetch` (no SDKs), so the package stays dependency-free.
//
// `unseal` is injected, and the egress helper is a bounded fetch (timeout, no
// redirects, response-size cap).
//
// The contract is deliberately narrow. `ensureTrunk` collapses whatever a
// carrier calls its trunk objects into one normalized result — where to send
// calls, how to authenticate, and which addresses calls arrive from — so a
// consumer maps that onto its own SIP layer without ever learning a carrier's
// object model. Nothing here knows what a media server is.

import {
  carrierProviderSpec,
  isCarrierProvider,
  type CarrierProvider,
} from './providers'

const CARRIER_TIMEOUT_MS = 20_000
const MAX_CARRIER_RESPONSE_BYTES = 128 * 1_024
const MAX_ACCOUNT_ID_LENGTH = 320
const MAX_SEALED_SECRET_LENGTH = 8_192
const MAX_LABEL_LENGTH = 64

/** Unseal a stored secret → plaintext. Supplied by the app (e.g. @braedonsaunders/appkit-crypto). */
export type Unseal = (sealed: { ciphertext: string; nonce: string }) => string | null

// --- Stored config (secret sealed) -----------------------------------------

export type RawCarrierConfig = {
  enabled?: boolean
  provider?: CarrierProvider
  /** Non-secret account identifier (Twilio: the Account SID). */
  accountId?: string
  keyCiphertext?: string
  keyNonce?: string
}

export type PlainCarrierConfig = Omit<RawCarrierConfig, 'keyCiphertext' | 'keyNonce'> & {
  secret?: string
}

export type CarrierCredentials = {
  provider: CarrierProvider
  accountId: string
  secret: string
}

// --- The contract ----------------------------------------------------------

/** A number the carrier has for sale. `number` is E.164 with the leading '+'. */
export type AvailableNumber = {
  number: string
  label: string
  locality: string
  region: string
  voice: boolean
  sms: boolean
}

export type NumberSearchQuery = {
  /** ISO 3166-1 alpha-2, e.g. 'US'. */
  country: string
  areaCode?: string
  contains?: string
  limit?: number
}

export type EnsureTrunkInput = {
  /** Operator-facing name recorded on the carrier side. */
  label: string
  /** Full SIP URI the carrier delivers inbound calls to, e.g. sip:host:5060. */
  originationUri: string
}

/**
 * One carrier trunk, normalized. This is the whole seam between a carrier and
 * whatever SIP infrastructure a consumer runs.
 */
export type CarrierTrunk = {
  /** The carrier's own id, stored by the consumer and passed back to buy on. */
  carrierTrunkId: string
  /** Where the consumer sends outbound calls. */
  terminationHost: string
  terminationPort: number
  /** What the consumer authenticates outbound calls with. */
  authUsername: string
  authPassword: string
  /**
   * Addresses inbound calls arrive from, for the consumer's ingress allowlist.
   * A suggested default from the carrier catalogue — persist it as editable
   * configuration rather than reading it fresh on every call.
   */
  signalingRanges: string[]
}

export type BuyNumberInput = {
  /** E.164 with the leading '+', as returned by `searchNumbers`. */
  number: string
  label: string
  /** The trunk the number should arrive on, from `ensureTrunk`. */
  carrierTrunkId: string
}

export type PurchasedNumber = {
  /** The carrier's id for the number, needed to release it later. */
  numberId: string
  number: string
}

export type CarrierClient = {
  provider: CarrierProvider
  /** Confirm the credentials work, and say whose account they are. */
  verifyAccount(): Promise<{ accountLabel: string }>
  searchNumbers(query: NumberSearchQuery): Promise<AvailableNumber[]>
  /**
   * Build a trunk that delivers to `originationUri` and accepts authenticated
   * calls back. Partial failures are unwound before throwing, so a rejected
   * call leaves the carrier account as it was found.
   */
  ensureTrunk(input: EnsureTrunkInput): Promise<CarrierTrunk>
  deleteTrunk(carrierTrunkId: string): Promise<void>
  buyNumber(input: BuyNumberInput): Promise<PurchasedNumber>
  releaseNumber(numberId: string): Promise<void>
}

/** A carrier refusal, carrying what the carrier actually said. */
export class CarrierError extends Error {
  provider: CarrierProvider
  status: number
  code: number | null
  constructor(message: string, provider: CarrierProvider, status: number, code: number | null) {
    super(message)
    this.name = 'CarrierError'
    this.provider = provider
    this.status = status
    this.code = code
  }
}

// --- Validation ------------------------------------------------------------

function isSafeConfigText(value: string, maxLength: number): boolean {
  return Boolean(value.trim()) && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
}

/** Strict E.164, used for every number bought or presented. */
export function isValidPhoneNumber(value: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test(value)
}

function validateCarrierConfigFields(
  raw: PlainCarrierConfig | RawCarrierConfig,
  requireComplete: boolean,
): void {
  if (raw.provider !== undefined && !isCarrierProvider(raw.provider)) {
    throw new Error('Select a valid telephony carrier.')
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    throw new Error('Carrier enabled state must be a boolean.')
  }
  if (raw.accountId !== undefined && !isSafeConfigText(raw.accountId, MAX_ACCOUNT_ID_LENGTH)) {
    throw new Error('Carrier account identifier is invalid or too long.')
  }
  if (raw.provider === 'twilio' && raw.accountId !== undefined && !/^AC[0-9a-fA-F]{32}$/.test(raw.accountId)) {
    throw new Error('A Twilio Account SID starts with AC and is 34 characters long.')
  }
  if (!requireComplete) return
  if (!raw.provider) throw new Error('Select a telephony carrier.')
  if (!raw.accountId) throw new Error('Enter the carrier account identifier.')
}

/**
 * Validate a stored config. With `requireComplete`, also insists it is
 * sendable — a provider, an account identifier, and a sealed secret.
 */
export function validateStoredCarrierConfig(
  raw: RawCarrierConfig,
  options: { requireComplete?: boolean } = {},
): void {
  const requireComplete = options.requireComplete === true
  validateCarrierConfigFields(raw, requireComplete)
  for (const [label, value] of [
    ['ciphertext', raw.keyCiphertext],
    ['nonce', raw.keyNonce],
  ] as const) {
    if (value !== undefined && !isSafeConfigText(value, MAX_SEALED_SECRET_LENGTH)) {
      throw new Error(`Carrier secret ${label} is invalid or too long.`)
    }
  }
  if (requireComplete && (!raw.keyCiphertext || !raw.keyNonce)) {
    throw new Error('Enter the carrier secret.')
  }
}

/** Validate a config carrying a plaintext secret, before it is sealed. */
export function validatePlainCarrierConfig(
  raw: PlainCarrierConfig,
  options: { requireComplete?: boolean } = {},
): void {
  const requireComplete = options.requireComplete === true
  validateCarrierConfigFields(raw, requireComplete)
  if (raw.secret !== undefined && !isSafeConfigText(raw.secret, MAX_SEALED_SECRET_LENGTH)) {
    throw new Error('Carrier secret is invalid or too long.')
  }
  if (requireComplete && !raw.secret) throw new Error('Enter the carrier secret.')
}

// --- Factories -------------------------------------------------------------

/** A client from already-plaintext credentials. */
export function buildCarrierClient(credentials: CarrierCredentials): CarrierClient {
  if (!isCarrierProvider(credentials.provider)) {
    throw new Error('Select a valid telephony carrier.')
  }
  validatePlainCarrierConfig(
    { provider: credentials.provider, accountId: credentials.accountId, secret: credentials.secret },
    { requireComplete: true },
  )
  return twilioClient(credentials)
}

/**
 * A client from stored config, or null when none is configured. A secret that
 * will not unseal — sealed under a key this deployment no longer holds — is no
 * account at all, so it resolves to null rather than a client that fails later.
 */
export function resolveCarrierClient(raw: RawCarrierConfig, unseal: Unseal): CarrierClient | null {
  if (raw.enabled !== true) return null
  try {
    validateStoredCarrierConfig(raw, { requireComplete: true })
  } catch {
    return null
  }
  const secret = unseal({ ciphertext: raw.keyCiphertext!, nonce: raw.keyNonce! })
  if (!secret) return null
  return twilioClient({ provider: raw.provider!, accountId: raw.accountId!, secret })
}

// --- Bounded egress --------------------------------------------------------

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (received < MAX_CARRIER_RESPONSE_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    const remaining = MAX_CARRIER_RESPONSE_BYTES - received
    chunks.push(value.byteLength > remaining ? value.subarray(0, remaining) : value)
    received += Math.min(value.byteLength, remaining)
    if (value.byteLength > remaining) {
      await reader.cancel()
      break
    }
  }

  if (received === MAX_CARRIER_RESPONSE_BYTES) await reader.cancel().catch(() => undefined)
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// Bounded fetch: hard timeout, no redirects, response-size cap. The body is
// streamed into a fixed-size buffer instead of calling response.text(), which
// would allocate an unbounded carrier response before checking its size.
async function requestJson(
  url: string,
  options: { method: 'GET' | 'POST' | 'DELETE'; headers: Record<string, string>; body?: string },
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, {
    method: options.method,
    headers: options.headers,
    ...(options.body === undefined ? {} : { body: options.body }),
    redirect: 'manual',
    signal: AbortSignal.timeout(CARRIER_TIMEOUT_MS),
  })
  const text = await readBoundedText(response)
  if (!text) return { response, body: null }
  try {
    return { response, body: JSON.parse(text) as unknown }
  } catch {
    return { response, body: text }
  }
}

function record(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

// --- Twilio ----------------------------------------------------------------
//
// Two APIs are in play. The classic account API owns numbers and SIP
// credentials; the trunking API owns Elastic SIP Trunks. A working connection
// needs both halves — origination (carrier → consumer, unauthenticated, so the
// signalling ranges are the control) and termination (consumer → carrier,
// authenticated with a credential list, because the address a consumer sends
// from is not something it can promise).

const TWILIO_ACCOUNTS = 'https://api.twilio.com/2010-04-01/Accounts'
const TWILIO_TRUNKING = 'https://trunking.twilio.com/v1'

/** Twilio wants 12–32 characters with mixed case and a digit, so the secret is
 *  built to that shape rather than trusting a random blob to satisfy it.
 *  Ambiguous glyphs are left out — these get read aloud during support calls. */
function sipPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = `${upper}${lower}${digits}`
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const chars = [
    upper[bytes[0]! % upper.length]!,
    lower[bytes[1]! % lower.length]!,
    digits[bytes[2]! % digits.length]!,
  ]
  for (let index = 3; index < bytes.length; index += 1) chars.push(all[bytes[index]! % all.length]!)
  return chars.join('')
}

function randomLabel(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function twilioClient(credentials: CarrierCredentials): CarrierClient {
  const spec = carrierProviderSpec('twilio')
  const auth = `Basic ${Buffer.from(`${credentials.accountId}:${credentials.secret}`).toString('base64')}`

  async function call(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    form?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const { response, body } = await requestJson(url, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(form === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      ...(form === undefined ? {} : { body: new URLSearchParams(form).toString() }),
    })
    const parsed = record(body)
    if (!response.ok) {
      const message = text(parsed?.message) ?? `Twilio returned ${response.status}.`
      const code = typeof parsed?.code === 'number' ? parsed.code : null
      throw new CarrierError(message, 'twilio', response.status, code)
    }
    return parsed ?? {}
  }

  function requireLabel(label: string): string {
    const trimmed = label.trim()
    if (!isSafeConfigText(trimmed, MAX_LABEL_LENGTH)) {
      throw new Error('Carrier label is invalid or too long.')
    }
    return trimmed
  }

  async function deleteTrunk(carrierTrunkId: string): Promise<void> {
    await call('DELETE', `${TWILIO_TRUNKING}/Trunks/${encodeURIComponent(carrierTrunkId)}`)
  }

  return {
    provider: 'twilio',

    async verifyAccount() {
      const body = await call('GET', `${TWILIO_ACCOUNTS}/${credentials.accountId}.json`)
      const status = text(body.status) ?? 'active'
      if (status !== 'active') {
        throw new CarrierError(
          `This Twilio account is ${status}, so it cannot buy numbers.`,
          'twilio',
          400,
          null,
        )
      }
      return { accountLabel: text(body.friendly_name) ?? credentials.accountId }
    },

    async searchNumbers(query) {
      if (!/^[A-Za-z]{2}$/.test(query.country.trim())) {
        throw new Error('Country is a two-letter ISO code, e.g. US.')
      }
      if (query.areaCode && !/^[0-9]{2,5}$/.test(query.areaCode.trim())) {
        throw new Error('An area code is digits only, e.g. 415.')
      }
      if (query.contains && !/^[0-9A-Za-z*]{1,15}$/.test(query.contains.trim())) {
        throw new Error('A number pattern is letters, digits, or * only.')
      }
      const params = new URLSearchParams({
        VoiceEnabled: 'true',
        PageSize: String(Math.min(Math.max(query.limit ?? 20, 1), 50)),
        ...(query.areaCode?.trim() ? { AreaCode: query.areaCode.trim() } : {}),
        ...(query.contains?.trim() ? { Contains: query.contains.trim() } : {}),
      })
      const country = query.country.trim().toUpperCase()
      const body = await call(
        'GET',
        `${TWILIO_ACCOUNTS}/${credentials.accountId}/AvailablePhoneNumbers/${country}/Local.json?${params.toString()}`,
      )
      const rows = Array.isArray(body.available_phone_numbers) ? body.available_phone_numbers : []
      return rows.flatMap<AvailableNumber>((entry) => {
        const row = record(entry)
        const number = text(row?.phone_number)
        if (!row || !number) return []
        const capabilities = record(row.capabilities) ?? {}
        return [
          {
            number,
            label: text(row.friendly_name) ?? number,
            locality: text(row.locality) ?? '',
            region: text(row.region) ?? '',
            voice: capabilities.voice === true,
            sms: capabilities.SMS === true || capabilities.sms === true,
          },
        ]
      })
    },

    async ensureTrunk(input) {
      const label = requireLabel(input.label)
      if (!/^sips?:[^\s;]+$/i.test(input.originationUri.trim())) {
        throw new Error('Origination must be a SIP URI, e.g. sip:voice.example.com:5060.')
      }
      // The domain is where the consumer sends outbound calls, so it must be
      // unique across all of Twilio — hence a random label rather than anything
      // derived from the consumer's own naming.
      const domainName = `appkit-${randomLabel(6)}.pstn.twilio.com`
      const created = await call('POST', `${TWILIO_TRUNKING}/Trunks`, {
        FriendlyName: label,
        DomainName: domainName,
      })
      const carrierTrunkId = text(created.sid)
      if (!carrierTrunkId) {
        throw new CarrierError('Twilio created a trunk but did not return its id.', 'twilio', 502, null)
      }
      const terminationHost = text(created.domain_name) ?? domainName

      // From here on a failure leaves a trunk nothing points at, so it is
      // unwound before the error surfaces.
      try {
        await call('POST', `${TWILIO_TRUNKING}/Trunks/${carrierTrunkId}/OriginationUrls`, {
          FriendlyName: label,
          SipUrl: input.originationUri.trim(),
          Priority: '1',
          Weight: '1',
          Enabled: 'true',
        })

        const username = `appkit${randomLabel(5)}`
        const password = sipPassword()
        const list = await call('POST', `${TWILIO_ACCOUNTS}/${credentials.accountId}/SIP/CredentialLists.json`, {
          FriendlyName: label,
        })
        const credentialListSid = text(list.sid)
        if (!credentialListSid) {
          throw new CarrierError(
            'Twilio created a credential list but did not return its id.',
            'twilio',
            502,
            null,
          )
        }
        await call(
          'POST',
          `${TWILIO_ACCOUNTS}/${credentials.accountId}/SIP/CredentialLists/${credentialListSid}/Credentials.json`,
          { Username: username, Password: password },
        )
        await call('POST', `${TWILIO_TRUNKING}/Trunks/${carrierTrunkId}/CredentialLists`, {
          CredentialListSid: credentialListSid,
        })

        return {
          carrierTrunkId,
          terminationHost,
          terminationPort: 5060,
          authUsername: username,
          authPassword: password,
          signalingRanges: [...spec.signalingRanges],
        }
      } catch (error) {
        // Cleanup failure is not worth reporting over the failure that caused it.
        await deleteTrunk(carrierTrunkId).catch(() => undefined)
        throw error
      }
    },

    deleteTrunk,

    async buyNumber(input) {
      if (!isValidPhoneNumber(input.number)) {
        throw new Error(`"${input.number}" is not an E.164 number, e.g. +15551234567.`)
      }
      const label = requireLabel(input.label)
      if (!text(input.carrierTrunkId)) throw new Error('A trunk is needed to buy a number onto.')
      // TrunkSid on the purchase is what makes calls to the number arrive over
      // the trunk rather than at a webhook, so there is no window where the
      // number rings nothing.
      const body = await call('POST', `${TWILIO_ACCOUNTS}/${credentials.accountId}/IncomingPhoneNumbers.json`, {
        PhoneNumber: input.number,
        FriendlyName: label,
        TrunkSid: input.carrierTrunkId,
      })
      const numberId = text(body.sid)
      const number = text(body.phone_number)
      if (!numberId || !number) {
        throw new CarrierError('Twilio bought the number but did not return it.', 'twilio', 502, null)
      }
      return { numberId, number }
    },

    async releaseNumber(numberId) {
      if (!text(numberId)) throw new Error('A carrier number id is needed to release it.')
      await call(
        'DELETE',
        `${TWILIO_ACCOUNTS}/${credentials.accountId}/IncomingPhoneNumbers/${encodeURIComponent(numberId)}.json`,
      )
    },
  }
}
