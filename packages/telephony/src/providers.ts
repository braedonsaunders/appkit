// Carrier catalogue — the single source of truth for the settings UI and the
// client factory. Add a carrier here (+ a `buildCarrierClient` branch) and it
// lights up in the admin form. This module is pure data (no SDK / Node imports)
// so it is safe to map into the client bundle.
//
// Every carrier authenticates over HTTPS with one non-secret account
// identifier plus a single sealed secret, which is the same shape @braedonsaunders/appkit-sms
// settled on for messaging providers.

export type CarrierProvider = 'twilio'

export function isCarrierProvider(value: unknown): value is CarrierProvider {
  return value === 'twilio'
}

// A non-secret config input a carrier needs. `key` is both the form field name
// and the RawCarrierConfig key it persists to.
export type CarrierProviderField = {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  help?: string
}

export type CarrierProviderSpec = {
  value: CarrierProvider
  label: string
  /** Label for the single sealed secret. */
  secretLabel: string
  /** Placeholder shown in the secret field. */
  keyHint: string
  /** Non-secret account identifier this carrier needs. */
  accountField: CarrierProviderField
  /**
   * The carrier's published SIP signalling ranges — the addresses inbound
   * calls arrive from, and so the allowlist a SIP ingress needs before it will
   * accept one.
   *
   * This is a **suggested default, not a runtime source of truth**. Carriers
   * add edges, and a consumer that read this list at call time would need a
   * package release to fix a broken trunk. Seed editable per-tenant
   * configuration from it and let an operator correct it in the app.
   */
  signalingRanges: string[]
  docsHint?: string
}

export const CARRIER_PROVIDER_SPECS: CarrierProviderSpec[] = [
  {
    value: 'twilio',
    label: 'Twilio',
    secretLabel: 'Auth token',
    keyHint: 'Your Twilio auth token',
    accountField: {
      key: 'accountId',
      label: 'Account SID',
      placeholder: 'AC…',
      required: true,
      help: 'On the Twilio Console dashboard, beside the auth token.',
    },
    // Twilio's published Elastic SIP Trunking signalling addresses, one entry
    // per edge. All edges are listed because an account is not pinned to one.
    signalingRanges: [
      '54.172.60.0/23', // North America Virginia
      '54.244.51.0/24', // North America Oregon
      '54.171.127.192/26', // Europe Ireland
      '35.156.191.128/25', // Europe Frankfurt
      '54.65.63.192/26', // Asia Pacific Tokyo
      '54.169.127.128/26', // Asia Pacific Singapore
      '54.252.254.64/26', // Asia Pacific Sydney
      '177.71.206.192/26', // South America São Paulo
    ],
    docsHint: 'Numbers are billed to the connected Twilio account.',
  },
]

export function carrierProviderSpec(provider: CarrierProvider): CarrierProviderSpec {
  const spec = CARRIER_PROVIDER_SPECS.find((entry) => entry.value === provider)
  if (!spec) throw new Error(`Unknown carrier provider: ${provider}`)
  return spec
}
