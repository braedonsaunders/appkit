import { lookup } from 'node:dns/promises'
import net from 'node:net'

// SSRF guard for external SMTP: resolve the host and refuse private / loopback /
// link-local targets (generalized from the beaconhs sync egress module).

export type ResolvedHost = {
  address: string
  family: number
  hostname: string
  ipLiteral: boolean
}

function isPrivateAddress(addr: string): boolean {
  const v = addr.toLowerCase()
  if (v === '127.0.0.1' || v.startsWith('127.') || v === '0.0.0.0') return true
  if (v === '::1' || v === '::') return true
  if (v.startsWith('10.')) return true
  if (v.startsWith('192.168.')) return true
  if (v.startsWith('169.254.')) return true // link-local
  const m = /^172\.(\d+)\./.exec(v)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true
  if (v.startsWith('fc') || v.startsWith('fd')) return true // unique local
  if (v.startsWith('fe80')) return true // link-local
  return false
}

export async function resolvePublicHost(
  host: string,
  _opts: { timeoutMs?: number } = {},
): Promise<ResolvedHost> {
  const trimmed = host.trim()
  const ipLiteral = net.isIP(trimmed) !== 0
  let address: string
  let family: number
  if (ipLiteral) {
    address = trimmed
    family = net.isIP(trimmed)
  } else {
    const res = await lookup(trimmed)
    address = res.address
    family = res.family
  }
  if (isPrivateAddress(address)) {
    throw new Error('SMTP host resolves to a private, loopback, or link-local address')
  }
  return { address, family, hostname: trimmed, ipLiteral }
}
