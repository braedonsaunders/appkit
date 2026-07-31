import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/**
 * Hardened egress for the OAuth round-trips: every endpoint this package
 * talks to — metadata documents, registration, token exchanges — must be
 * public HTTPS. Redirects are refused outright (a redirect on a token
 * endpoint is an exfiltration primitive, not a convenience), every resolved
 * address must be public, and nothing waits longer than fifteen seconds.
 */

const OUTBOUND_TIMEOUT_MS = 15_000

const blockedIpv4 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, 'ipv4')
}

// Kept separate from the IPv4 list: BlockList treats IPv4 input as an
// IPv4-mapped IPv6 address once a mapped subnet is present, which would make
// a combined list reject every IPv4 answer.
const blockedIpv6 = new BlockList()
for (const [network, prefix] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['100::', 64],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, 'ipv6')
}
blockedIpv6.addAddress('::1', 'ipv6')

function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedIpv4.check(address, 'ipv4')
  if (family === 6) return !blockedIpv6.check(address, 'ipv6')
  return false
}

export async function assertPublicHttpsEndpoint(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new Error(`${url.origin} is not HTTPS — sign-in endpoints must be public HTTPS.`)
  }
  const answers = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true })
  if (answers.length === 0 || answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new Error(`${url.hostname} does not resolve to a public address.`)
  }
}

/** GET a JSON document from a public HTTPS URL; null when the URL 404s or
 *  serves something that is not JSON — callers try the next candidate. */
export async function getJson(endpoint: string): Promise<Record<string, unknown> | null> {
  const url = new URL(endpoint)
  await assertPublicHttpsEndpoint(url)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  try {
    const body = (await response.json()) as unknown
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export type TokenEndpointResponse = {
  access_token?: string
  token_type?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

/** Form-POST to a token endpoint; the OAuth error body becomes the message. */
export async function postForm(endpoint: string, form: URLSearchParams): Promise<TokenEndpointResponse> {
  const url = new URL(endpoint)
  await assertPublicHttpsEndpoint(url)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form.toString(),
    redirect: 'error',
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  })
  const body = await response.text()
  let payload: TokenEndpointResponse
  try {
    payload = JSON.parse(body) as TokenEndpointResponse
  } catch {
    throw new Error(`${url.hostname} returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok || payload.error) {
    const detail = payload.error_description ?? payload.error ?? `HTTP ${response.status}`
    throw new Error(`${url.hostname} refused the request: ${detail}`)
  }
  return payload
}

/** POST a JSON document (dynamic client registration). */
export async function postJson(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = new URL(endpoint)
  await assertPublicHttpsEndpoint(url)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  })
  const text = await response.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${url.hostname} returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    const detail =
      (typeof payload.error_description === 'string' && payload.error_description) ||
      (typeof payload.error === 'string' && payload.error) ||
      `HTTP ${response.status}`
    throw new Error(`${url.hostname} refused the request: ${detail}`)
  }
  return payload
}
