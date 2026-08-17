/**
 * Host and address policy primitives for the egress chokepoint.
 *
 * The canonical treatment of outbound host policy in this repository lives in
 * `@braedonsaunders/appkit-sync`'s egress module (`packages/sync/src/egress.ts`). The rules
 * are mirrored here rather than imported because this proxy must remain a
 * zero-runtime-dependency stdlib package that a desk-runner can deploy on its
 * own, and pulling in `@braedonsaunders/appkit-sync` for three functions would drag a far
 * heavier surface across the trust boundary. Keep changes to the block lists
 * and hostname rules in step with that module.
 *
 * Everything in this file is fail-closed: an input that cannot be positively
 * classified as a valid public destination is rejected.
 */

import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { domainToASCII } from 'node:url'

/** Thrown when a destination is rejected by host policy rather than by the network. */
export class EgressHostPolicyError extends Error {}

const RESERVED_HOST_SUFFIXES = [
  '.example',
  '.home',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.onion',
  '.test',
]

const ipv4BlockList = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  ipv4BlockList.addSubnet(network, prefix, 'ipv4')
}

// Keep IPv6 rules separate. Node's BlockList treats IPv4 input as an
// IPv4-mapped IPv6 address when a mapped subnet is present, which would make a
// combined list reject every IPv4 address.
const ipv6BlockList = new BlockList()
for (const [network, prefix] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  ipv6BlockList.addSubnet(network, prefix, 'ipv6')
}
ipv6BlockList.addAddress('::1', 'ipv6')

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

/**
 * Canonicalize a destination hostname: trim, strip IPv6 brackets and a
 * trailing dot, apply IDNA, lower-case, and validate label shape. Throws
 * {@link EgressHostPolicyError} when the input cannot be a hostname at all.
 */
export function normalizeOutboundHostname(raw: string): string {
  const trimmed = stripIpv6Brackets(raw.trim()).replace(/\.$/, '')
  if (
    !trimmed ||
    trimmed.length > 253 ||
    /[%/\\?#@\s]/.test(trimmed) ||
    (!isIP(trimmed) && trimmed.includes(':'))
  ) {
    throw new EgressHostPolicyError('Outbound host is not valid.')
  }
  if (isIP(trimmed)) return trimmed.toLowerCase()

  const hostname = domainToASCII(trimmed).toLowerCase()
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname
      .split('.')
      .some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  ) {
    throw new EgressHostPolicyError('Outbound host is not valid.')
  }
  return hostname
}

/** True when the literal is a valid IPv4 or IPv6 address outside every blocked range. */
export function isPublicIpAddress(raw: string): boolean {
  const address = stripIpv6Brackets(raw.trim())
  const family = isIP(address)
  if (family === 4) return !ipv4BlockList.check(address, 'ipv4')
  if (family === 6) return !ipv6BlockList.check(address, 'ipv6')
  return false
}

/**
 * True when an already-normalized hostname is not reserved for local or
 * private use. This is a name-level check only; the addresses a name resolves
 * to are checked separately by {@link resolvePublicUpstream}.
 */
export function isPublicHostname(hostname: string): boolean {
  return !(
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    RESERVED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  )
}

export interface UpstreamAddress {
  host: string
  port: number
}

/**
 * The default upstream resolver: refuse reserved names and non-public IP
 * literals, resolve names through the system resolver, and reject the whole
 * hostname if any answer is private or special. Answer-set rejection matters:
 * selecting only a public answer would still permit rebinding or round-robin
 * fallback to a private address. The connection is then made to the checked
 * address rather than re-resolving, closing the validate-then-connect gap.
 */
export async function resolvePublicUpstream(
  host: string,
  port: number,
): Promise<UpstreamAddress> {
  const hostname = normalizeOutboundHostname(host)
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new EgressHostPolicyError(
        'Outbound destination is a blocked non-public address.',
      )
    }
    return { host: hostname, port }
  }
  if (!isPublicHostname(hostname)) {
    throw new EgressHostPolicyError(
      'Outbound host is reserved for local or private use.',
    )
  }
  const answers = await dnsLookup(hostname, { all: true, verbatim: true })
  if (answers.length === 0) {
    throw new EgressHostPolicyError(
      'Outbound host did not resolve to an address.',
    )
  }
  for (const answer of answers) {
    if (!isPublicIpAddress(answer.address)) {
      throw new EgressHostPolicyError(
        'Outbound host resolved to a blocked non-public address.',
      )
    }
  }
  const selected = answers[0]
  if (!selected) {
    throw new EgressHostPolicyError(
      'Outbound host did not resolve to an address.',
    )
  }
  return { host: selected.address, port }
}

export interface HostPort {
  host: string
  port: number | null
}

/**
 * Split an `authority` such as a CONNECT target or a Host header value into
 * hostname and port. Bracketed IPv6 literals are supported; a bare colon-y
 * IPv6 literal without brackets is ambiguous and rejected. Returns null when
 * the authority cannot be parsed — callers must treat that as a denial.
 */
export function splitHostPort(authority: string): HostPort | null {
  if (!authority) return null
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']')
    if (close === -1) return null
    const host = authority.slice(0, close + 1)
    const rest = authority.slice(close + 1)
    if (rest === '') return { host, port: null }
    if (!rest.startsWith(':')) return null
    return hostWithPort(host, rest.slice(1))
  }
  const colon = authority.indexOf(':')
  if (colon === -1) return { host: authority, port: null }
  if (authority.indexOf(':', colon + 1) !== -1) return null
  return hostWithPort(authority.slice(0, colon), authority.slice(colon + 1))
}

function hostWithPort(host: string, raw: string): HostPort | null {
  if (!host || !/^\d{1,5}$/.test(raw)) return null
  const port = Number(raw)
  if (port < 1 || port > 65535) return null
  return { host, port }
}
