/**
 * The egress chokepoint for agent sandboxes.
 *
 * One TCP listener accepts three connection shapes and treats them all the
 * same way — recover the destination, ask the policy port, audit the
 * decision, then either splice bytes or refuse:
 *
 * - **Explicit HTTP proxying** — absolute-form requests
 *   (`GET http://host/path`). The head is rewritten to origin form, proxy
 *   credentials are stripped, and the body is spliced through.
 * - **CONNECT tunneling** — the host check happens at CONNECT time; a denial
 *   is a 403 before any client byte reaches the destination. TLS is never
 *   terminated.
 * - **Transparent interception** — a DNAT'd flow where the client never knows
 *   a proxy exists. The destination hostname is recovered from the TLS
 *   ClientHello SNI, or from the Host header of a plain-HTTP request, using
 *   the pure parsers in `sniff.ts`.
 *
 * Everything fails closed: a policy exception, an unparseable destination, a
 * truncated preface, or a destination that resolves to a non-public address
 * all deny and audit. There is no TLS interception code path in this package;
 * MITM with a generated CA is deliberately not implemented (see the README).
 */

import { Buffer } from 'node:buffer'
import { connect as connectTcp, createServer, type Socket } from 'node:net'
import {
  EgressHostPolicyError,
  normalizeOutboundHostname,
  resolvePublicUpstream,
  type UpstreamAddress,
  splitHostPort,
} from './host-policy'
import {
  headerValue,
  readClientHelloSni,
  readHttpRequestHead,
  type HttpRequestHead,
} from './sniff'

export type EgressProtocol = 'http' | 'https' | 'tcp'
export type EgressDecision = 'allow' | 'deny'

export interface EgressPolicyRequest {
  /** Normalized destination hostname or IP literal. */
  host: string
  port: number
  /**
   * `https` for SNI-sniffed flows and CONNECT to port 443, `http` for plain
   * HTTP in either explicit or transparent form, `tcp` for CONNECT to any
   * other port (the tunnel is opaque, so the payload protocol is unknown).
   */
  protocol: EgressProtocol
  principal: string | null
}

/** May be synchronous or asynchronous; a thrown or rejected policy denies. */
export type EgressPolicy = (
  request: EgressPolicyRequest,
) => EgressDecision | Promise<EgressDecision>

export type EgressAuditEvent = 'decision' | 'upstream-error' | 'flow-closed'

export interface EgressAuditEntry {
  /** ISO-8601 timestamp taken when the entry was produced. */
  at: string
  /**
   * `decision` records every allow and deny. `upstream-error` records a
   * failure after an allow — either the upstream address was refused by host
   * policy (`decision: 'deny'`) or the connection itself failed
   * (`decision: 'allow'`). `flow-closed` records byte counts when an
   * established flow ends.
   */
  event: EgressAuditEvent
  protocol: EgressProtocol
  /** Null when the destination could not be parsed out of the flow. */
  host: string | null
  port: number | null
  principal: string | null
  decision: EgressDecision
  /** The denial reason or upstream error message; null on clean events. */
  reason: string | null
  bytesToUpstream: number | null
  bytesFromUpstream: number | null
}

export interface EgressProxyStats {
  /** Client connections currently open. */
  active: number
  /** Client connections accepted since the proxy started. */
  total: number
  /** Flows refused before any byte reached a destination. */
  denied: number
}

export interface EgressProxyHandle {
  /** Bind the listener; resolves with the bound address (useful with port 0). */
  listen(): Promise<{ host: string; port: number }>
  /** Stop listening and destroy every open client and upstream socket. */
  close(): Promise<void>
  stats(): EgressProxyStats
}

export interface CreateEgressProxyOptions {
  policy: EgressPolicy
  /**
   * Receives every audit entry. Must not throw; an entry whose sink throws is
   * lost, never the connection.
   */
  audit: (entry: EgressAuditEntry) => void
  listen: { host: string; port: number }
  /**
   * Attribute a principal to an inbound socket — typically by the source IP
   * of the guest tap that was DNAT'd here. Default: null. A hook that throws
   * yields a null principal; the policy still decides.
   */
  principalFor?: (socket: Socket) => string | null
  /**
   * Map an allowed destination to the address actually dialled. The default
   * resolves through DNS and requires every answer to be public
   * ({@link resolvePublicUpstream}); override it to integrate a custom
   * resolver or, in tests, to point flows at loopback fixtures.
   */
  resolveUpstream?: (
    host: string,
    port: number,
  ) => UpstreamAddress | Promise<UpstreamAddress>
  /**
   * Recover the pre-DNAT destination of a transparent flow (for example via
   * SO_ORIGINAL_DST). Only the port is used — the hostname always comes from
   * SNI or the Host header, because a name is what the policy reasons about.
   */
  originalDestinationFor?: (
    socket: Socket,
  ) => { host?: string; port: number } | null
  /** Port assumed for transparent TLS flows when the original one is unknown. Default 443. */
  transparentHttpsPort?: number
  /** Port assumed for transparent plain-HTTP flows without a port in the Host header. Default 80. */
  transparentHttpPort?: number
  /** How long a connection may take to reveal a parseable destination. Default 10 000 ms. */
  prefaceTimeoutMs?: number
}

const MAX_PREFACE_BYTES = 65_536
const DEFAULT_PREFACE_TIMEOUT_MS = 10_000
const TLS_HANDSHAKE_BYTE = 0x16

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  502: 'Bad Gateway',
}

/** Hop-by-hop and proxy-credential fields that must never reach the origin. */
const STRIPPED_FORWARD_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
])

interface Flow {
  kind: 'explicit-http' | 'connect' | 'transparent-http' | 'transparent-tls'
  protocol: EgressProtocol
  rawHost: string
  port: number
  /** True when the client speaks HTTP to the proxy and can receive an HTTP error. */
  speaksHttp: boolean
  head: HttpRequestHead | null
  targetUrl: URL | null
}

interface TransparentPorts {
  https: number
  httpOverride: number | null
  httpFallback: number
}

type Classification =
  | { outcome: 'need-more' }
  | {
      outcome: 'deny'
      protocol: EgressProtocol
      speaksHttp: boolean
      status: number
      reason: string
    }
  | { outcome: 'flow'; flow: Flow }

function refusal(
  protocol: EgressProtocol,
  speaksHttp: boolean,
  status: number,
  reason: string,
): Classification {
  return { outcome: 'deny', protocol, speaksHttp, status, reason }
}

function classifyPreface(
  preface: Buffer,
  ports: TransparentPorts,
): Classification {
  if (preface.length === 0) return { outcome: 'need-more' }

  if (preface.readUInt8(0) === TLS_HANDSHAKE_BYTE) {
    const sni = readClientHelloSni(preface)
    if (sni.kind === 'need-more-bytes') return { outcome: 'need-more' }
    if (sni.kind === 'malformed') {
      return refusal(
        'https',
        false,
        403,
        `client hello could not be parsed: ${sni.reason}`,
      )
    }
    if (sni.value === null) {
      return refusal(
        'https',
        false,
        403,
        'client hello carries no server name; the destination cannot be determined',
      )
    }
    return {
      outcome: 'flow',
      flow: {
        kind: 'transparent-tls',
        protocol: 'https',
        rawHost: sni.value,
        port: ports.https,
        speaksHttp: false,
        head: null,
        targetUrl: null,
      },
    }
  }

  const parsed = readHttpRequestHead(preface)
  if (parsed.kind === 'need-more-bytes') return { outcome: 'need-more' }
  if (parsed.kind === 'malformed') {
    return refusal('http', true, 400, `request could not be parsed: ${parsed.reason}`)
  }
  const head = parsed.value

  if (head.method === 'CONNECT') {
    const authority = splitHostPort(head.target)
    if (!authority || authority.port === null) {
      return refusal('tcp', true, 400, 'connect target must be host:port')
    }
    return {
      outcome: 'flow',
      flow: {
        kind: 'connect',
        protocol: authority.port === 443 ? 'https' : 'tcp',
        rawHost: authority.host,
        port: authority.port,
        speaksHttp: true,
        head,
        targetUrl: null,
      },
    }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(head.target)) {
    let url: URL
    try {
      url = new URL(head.target)
    } catch {
      return refusal('http', true, 400, 'absolute-form target is not a valid url')
    }
    if (url.protocol !== 'http:') {
      return refusal(
        'http',
        true,
        400,
        'absolute-form target must be plain http; tls goes through connect',
      )
    }
    if (url.username || url.password) {
      return refusal('http', true, 400, 'target must not carry credentials')
    }
    return {
      outcome: 'flow',
      flow: {
        kind: 'explicit-http',
        protocol: 'http',
        rawHost: url.hostname,
        port: url.port ? Number(url.port) : 80,
        speaksHttp: true,
        head,
        targetUrl: url,
      },
    }
  }

  if (head.target.startsWith('/')) {
    const hostHeader = headerValue(head, 'host')
    if (!hostHeader) {
      return refusal('http', true, 400, 'transparent request carries no host header')
    }
    const authority = splitHostPort(hostHeader)
    if (!authority) {
      return refusal('http', true, 400, 'host header is not a valid authority')
    }
    return {
      outcome: 'flow',
      flow: {
        kind: 'transparent-http',
        protocol: 'http',
        rawHost: authority.host,
        port: ports.httpOverride ?? authority.port ?? ports.httpFallback,
        speaksHttp: true,
        head,
        targetUrl: null,
      },
    }
  }

  return refusal('http', true, 400, 'unsupported request target form')
}

/** Rewrite an absolute-form request head to origin form for the upstream. */
function buildForwardHead(head: HttpRequestHead, url: URL): Buffer {
  const path = `${url.pathname}${url.search}` || '/'
  const lines = [`${head.method} ${path} HTTP/1.1`]
  let sawHost = false
  for (const [name, value] of head.headers) {
    if (STRIPPED_FORWARD_HEADERS.has(name)) continue
    if (name === 'host') {
      sawHost = true
      lines.push(`host: ${url.host}`)
      continue
    }
    lines.push(`${name}: ${value}`)
  }
  if (!sawHost) lines.push(`host: ${url.host}`)
  // One request per connection: with `connection: close` the upstream ends the
  // socket after its response, so a pipelined second request to a different
  // destination can never ride an already-authorized flow.
  lines.push('connection: close')
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function writeHttpRefusal(
  socket: Socket,
  status: number,
  message: string,
): void {
  const body = `egress-proxy: ${message}\n`
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? 'Forbidden'}\r\n` +
      'content-type: text/plain; charset=utf-8\r\n' +
      `content-length: ${Buffer.byteLength(body)}\r\n` +
      'connection: close\r\n\r\n' +
      body,
  )
}

export function createEgressProxy(
  options: CreateEgressProxyOptions,
): EgressProxyHandle {
  let active = 0
  let total = 0
  let denied = 0
  const sockets = new Set<Socket>()
  const resolveUpstream = options.resolveUpstream ?? resolvePublicUpstream

  const emit = (entry: EgressAuditEntry): void => {
    try {
      options.audit(entry)
    } catch {
      // The audit sink must never take down the data path. A sink that
      // throws loses this one entry, nothing else.
    }
  }

  const record = (
    event: EgressAuditEvent,
    decision: EgressDecision,
    protocol: EgressProtocol,
    host: string | null,
    port: number | null,
    principal: string | null,
    reason: string | null,
    bytesToUpstream: number | null = null,
    bytesFromUpstream: number | null = null,
  ): void => {
    emit({
      at: new Date().toISOString(),
      event,
      protocol,
      host,
      port,
      principal,
      decision,
      reason,
      bytesToUpstream,
      bytesFromUpstream,
    })
  }

  function handleConnection(socket: Socket): void {
    total += 1
    active += 1
    sockets.add(socket)
    socket.once('close', () => {
      active -= 1
      sockets.delete(socket)
    })
    socket.on('error', () => {
      socket.destroy()
    })

    let principal: string | null = null
    try {
      principal = options.principalFor?.(socket) ?? null
    } catch {
      principal = null
    }
    let originalDestination: { host?: string; port: number } | null = null
    try {
      originalDestination = options.originalDestinationFor?.(socket) ?? null
    } catch {
      originalDestination = null
    }
    const ports: TransparentPorts = {
      https: originalDestination?.port ?? options.transparentHttpsPort ?? 443,
      httpOverride: originalDestination?.port ?? null,
      httpFallback: options.transparentHttpPort ?? 80,
    }

    const refuse = (
      speaksHttp: boolean,
      status: number,
      protocol: EgressProtocol,
      host: string | null,
      port: number | null,
      reason: string,
    ): void => {
      denied += 1
      record('decision', 'deny', protocol, host, port, principal, reason)
      if (speaksHttp) writeHttpRefusal(socket, status, reason)
      else socket.destroy()
    }

    const chunks: Buffer[] = []
    let prefaceBytes = 0
    let classified = false
    const timer = setTimeout(() => {
      if (classified) return
      classified = true
      socket.off('data', onData)
      refuse(false, 403, 'tcp', null, null, 'no parseable destination before the preface timeout')
    }, options.prefaceTimeoutMs ?? DEFAULT_PREFACE_TIMEOUT_MS)
    timer.unref()

    const onData = (chunk: Buffer): void => {
      chunks.push(chunk)
      prefaceBytes += chunk.length
      const preface = Buffer.concat(chunks, prefaceBytes)
      const classification = classifyPreface(preface, ports)
      if (classification.outcome === 'need-more') {
        if (prefaceBytes > MAX_PREFACE_BYTES) {
          classified = true
          clearTimeout(timer)
          socket.off('data', onData)
          refuse(false, 403, 'tcp', null, null, 'preface exceeded 64 KiB without a parseable destination')
        }
        return
      }
      classified = true
      clearTimeout(timer)
      socket.off('data', onData)
      socket.pause()
      if (classification.outcome === 'deny') {
        refuse(
          classification.speaksHttp,
          classification.status,
          classification.protocol,
          null,
          null,
          classification.reason,
        )
        return
      }
      void runFlow(socket, classification.flow, preface, principal, refuse)
    }
    socket.on('data', onData)
  }

  async function runFlow(
    socket: Socket,
    flow: Flow,
    preface: Buffer,
    principal: string | null,
    refuse: (
      speaksHttp: boolean,
      status: number,
      protocol: EgressProtocol,
      host: string | null,
      port: number | null,
      reason: string,
    ) => void,
  ): Promise<void> {
    let host: string
    try {
      host = normalizeOutboundHostname(flow.rawHost)
    } catch (error) {
      refuse(
        flow.speaksHttp,
        403,
        flow.protocol,
        null,
        flow.port,
        `destination hostname is not valid: ${errorMessage(error)}`,
      )
      return
    }

    let decision: EgressDecision
    try {
      decision = await options.policy({
        host,
        port: flow.port,
        protocol: flow.protocol,
        principal,
      })
    } catch (error) {
      refuse(
        flow.speaksHttp,
        403,
        flow.protocol,
        host,
        flow.port,
        `policy error: ${errorMessage(error)}`,
      )
      return
    }
    if (decision !== 'allow') {
      refuse(
        flow.speaksHttp,
        403,
        flow.protocol,
        host,
        flow.port,
        `${host}:${flow.port} denied by policy`,
      )
      return
    }
    record('decision', 'allow', flow.protocol, host, flow.port, principal, null)

    let target: UpstreamAddress
    try {
      target = await resolveUpstream(host, flow.port)
    } catch (error) {
      if (error instanceof EgressHostPolicyError) {
        denied += 1
        record('upstream-error', 'deny', flow.protocol, host, flow.port, principal, error.message)
        if (flow.speaksHttp) writeHttpRefusal(socket, 403, error.message)
        else socket.destroy()
      } else {
        record('upstream-error', 'allow', flow.protocol, host, flow.port, principal, errorMessage(error))
        if (flow.speaksHttp) writeHttpRefusal(socket, 502, `upstream resolution failed: ${errorMessage(error)}`)
        else socket.destroy()
      }
      return
    }

    spliceFlow(socket, flow, preface, principal, host, target)
  }

  function spliceFlow(
    socket: Socket,
    flow: Flow,
    preface: Buffer,
    principal: string | null,
    host: string,
    target: UpstreamAddress,
  ): void {
    const upstream = connectTcp({ host: target.host, port: target.port })
    sockets.add(upstream)
    let established = false

    upstream.on('error', (error) => {
      record('upstream-error', 'allow', flow.protocol, host, flow.port, principal, errorMessage(error))
      if (!established && flow.speaksHttp) {
        writeHttpRefusal(socket, 502, `upstream connection failed: ${errorMessage(error)}`)
      } else {
        socket.destroy()
      }
      upstream.destroy()
    })
    upstream.once('close', () => {
      sockets.delete(upstream)
      socket.end()
    })
    socket.once('close', () => {
      upstream.destroy()
      if (established) {
        record(
          'flow-closed',
          'allow',
          flow.protocol,
          host,
          flow.port,
          principal,
          null,
          upstream.bytesWritten,
          upstream.bytesRead,
        )
      }
    })

    upstream.once('connect', () => {
      established = true
      if (flow.kind === 'connect' && flow.head) {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        const remainder = preface.subarray(flow.head.headEnd)
        if (remainder.length > 0) upstream.write(remainder)
      } else if (flow.kind === 'explicit-http' && flow.head && flow.targetUrl) {
        upstream.write(buildForwardHead(flow.head, flow.targetUrl))
        const remainder = preface.subarray(flow.head.headEnd)
        if (remainder.length > 0) upstream.write(remainder)
      } else {
        // Transparent flows replay the sniffed preface untouched — the client
        // is speaking to the origin and must see its own bytes arrive there.
        upstream.write(preface)
      }
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
  }

  const server = createServer(handleConnection)
  let listening: Promise<{ host: string; port: number }> | null = null

  return {
    listen: () =>
      (listening ??= new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(options.listen.port, options.listen.host, () => {
          server.off('error', reject)
          const address = server.address()
          if (address && typeof address === 'object') {
            resolve({ host: address.address, port: address.port })
          } else {
            reject(new Error('egress proxy failed to bind'))
          }
        })
      })),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
    stats: () => ({ active, total, denied }),
  }
}
