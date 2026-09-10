import type { LookupAddress } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import type { IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { checkServerIdentity } from 'node:tls'
import { domainToASCII } from 'node:url'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024
const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024
/**
 * The longest a caller may ask to wait.
 *
 * Two minutes is right for the webhooks and API calls this guard was written
 * for, and wrong for the one class of request that legitimately runs longer: a
 * reasoning model working through a tool-using turn. Those routinely pass two
 * minutes, and because the cap is enforced here rather than negotiated, the
 * socket was destroyed mid-generation — the caller saw a timeout, the provider
 * had billed nothing, and an agent run that was most of the way through its
 * work was thrown away with it.
 *
 * The ceiling still exists, because an unbounded wait is how a worker wedges.
 * It is now high enough that a caller with a genuinely long request can ask for
 * what it needs, and every caller still states its own timeout — this only
 * stops them asking for the absurd.
 */
const MAX_TIMEOUT_MS = 900_000
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_REQUEST_BYTES = 16 * 1024 * 1024
const MAX_REDIRECTS = 5
const MAX_URL_LENGTH = 4_096
const MAX_HEADER_BYTES = 16 * 1024

const FORBIDDEN_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'expect',
  'forwarded',
  'host',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'x-http-method',
  'x-http-method-override',
  'x-method-override',
  'x-real-ip',
  'x-rewrite-url',
])

function isForbiddenRequestHeader(name: string): boolean {
  return (
    FORBIDDEN_REQUEST_HEADERS.has(name) ||
    name.startsWith('x-forwarded-') ||
    name.startsWith('x-original-')
  )
}

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

export interface ResolvedPublicHost {
  hostname: string
  address: string
  family: 4 | 6
  ipLiteral: boolean
}

export type OutboundDnsResolver = (
  hostname: string,
) => Promise<readonly LookupAddress[]>

export interface ResolvePublicHostOptions {
  timeoutMs?: number
  resolver?: OutboundDnsResolver
  signal?: AbortSignal
}

export interface SecureFetchOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Headers | Record<string, string>
  body?: string | Uint8Array | ArrayBuffer | URLSearchParams | null
  timeoutMs?: number
  maxRequestBytes?: number
  maxResponseBytes?: number
  maxRedirects?: number
  signal?: AbortSignal
  /** Optional resolver for controlled runtimes and tests. Every answer is still subject to the public-IP policy. */
  resolver?: OutboundDnsResolver
}

export interface ValidatedOutboundRequestConfiguration {
  url: URL
  headers: Record<string, string>
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`)
  }
  return resolved
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

export function normalizeOutboundHostname(raw: string): string {
  const trimmed = stripIpv6Brackets(raw.trim()).replace(/\.$/, '')
  if (
    !trimmed ||
    trimmed.length > 253 ||
    /[%/\\?#@\s]/.test(trimmed) ||
    (!isIP(trimmed) && trimmed.includes(':'))
  ) {
    throw new Error('Outbound host is not valid.')
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
    throw new Error('Outbound host is not valid.')
  }
  return hostname
}

export function isPublicIpAddress(raw: string): boolean {
  const address = stripIpv6Brackets(raw.trim())
  const family = isIP(address)
  if (family === 4) return !ipv4BlockList.check(address, 'ipv4')
  if (family === 6) return !ipv6BlockList.check(address, 'ipv6')
  return false
}

function assertPublicAddress(address: string): 4 | 6 {
  const family = isIP(address)
  if ((family !== 4 && family !== 6) || !isPublicIpAddress(address)) {
    throw new Error('Outbound host resolved to a blocked non-public address.')
  }
  return family
}

function assertPublicHostname(hostname: string): void {
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    RESERVED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new Error('Outbound host is reserved for local or private use.')
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('This operation was aborted.', 'AbortError')
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(abortError(signal!)))
    const timer = setTimeout(
      () => finish(() => reject(new Error(message))),
      timeoutMs,
    )
    timer.unref?.()
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

async function systemResolver(
  hostname: string,
): Promise<readonly LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true })
}

export async function resolvePublicHost(
  rawHostname: string,
  options: ResolvePublicHostOptions = {},
): Promise<ResolvedPublicHost> {
  const hostname = normalizeOutboundHostname(rawHostname)
  const literalFamily = isIP(hostname)
  if (literalFamily === 4 || literalFamily === 6) {
    assertPublicAddress(hostname)
    return {
      hostname,
      address: hostname,
      family: literalFamily,
      ipLiteral: true,
    }
  }

  assertPublicHostname(hostname)
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    1,
    MAX_TIMEOUT_MS,
    'DNS timeout',
  )
  const addresses = await withTimeout(
    (options.resolver ?? systemResolver)(hostname),
    timeoutMs,
    'Outbound DNS lookup timed out.',
    options.signal,
  )
  if (addresses.length === 0)
    throw new Error('Outbound host did not resolve to an address.')

  // Reject the entire hostname if any answer is private/special. Choosing only
  // a public answer would still permit rebinding or round-robin fallback to a
  // private address in a later implementation.
  const checked = addresses.map((entry) => {
    const family = assertPublicAddress(entry.address)
    if (entry.family !== family)
      throw new Error('Outbound DNS returned an invalid address family.')
    return { address: entry.address, family }
  })
  const selected = checked[0]
  if (!selected) throw new Error('Outbound host did not resolve to an address.')
  return { hostname, ...selected, ipLiteral: false }
}

function parseOutboundUrl(input: string | URL): URL {
  const raw = input instanceof URL ? input.href : input
  if (!raw || raw.length > MAX_URL_LENGTH)
    throw new Error('Outbound URL is missing or too long.')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Outbound URL is not valid.')
  }
  if (url.protocol !== 'https:') throw new Error('Outbound URL must use HTTPS.')
  if (url.username || url.password)
    throw new Error('Outbound URL must not include credentials.')
  if (
    url.port &&
    (!Number.isInteger(Number(url.port)) || Number(url.port) < 1)
  ) {
    throw new Error('Outbound URL port must be between 1 and 65535.')
  }
  normalizeOutboundHostname(url.hostname)
  url.hash = ''
  return url
}

/**
 * Validate the non-network portion of an outbound request configuration.
 *
 * This is shared by persistence boundaries that need to reject malformed or
 * unsafe configuration before it is stored. Runtime callers must still use
 * `secureFetch`, which repeats these checks and validates DNS immediately
 * before opening every socket.
 */
export function validateOutboundRequestConfiguration(
  input: string | URL,
  headers?: Headers | Record<string, string>,
): ValidatedOutboundRequestConfiguration {
  return {
    url: parseOutboundUrl(input),
    headers: normalizedHeaders(headers),
  }
}

function requestBodyBytes(
  body: SecureFetchOptions['body'],
): Buffer | undefined {
  if (body == null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
}

function normalizedHeaders(
  input: Headers | Record<string, string> | undefined,
): Record<string, string> {
  if (input && !(input instanceof Headers)) {
    for (const [name, value] of Object.entries(input)) {
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
        throw new Error('Outbound request contains an invalid header name.')
      }
      if (
        typeof value !== 'string' ||
        /[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)
      ) {
        throw new Error(
          `Outbound request header "${name.toLowerCase()}" contains invalid data.`,
        )
      }
    }
  }
  const headers = new Headers(input)
  const out: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (isForbiddenRequestHeader(name)) {
      throw new Error(`Outbound request header "${name}" is not allowed.`)
    }
    if (
      name === 'accept-encoding' &&
      value.trim().toLowerCase() !== 'identity'
    ) {
      throw new Error(
        'Outbound request header "accept-encoding" must be identity.',
      )
    }
    out[name] = value
  }
  if (!headers.has('accept-encoding')) out['accept-encoding'] = 'identity'
  const headerBytes = Object.entries(out).reduce(
    (total, [name, value]) =>
      total + Buffer.byteLength(name) + Buffer.byteLength(value) + 4,
    0,
  )
  if (headerBytes > MAX_HEADER_BYTES) {
    throw new Error(
      `Outbound request headers exceeded ${MAX_HEADER_BYTES} bytes.`,
    )
  }
  return out
}

/** Parse an outbound redirect without allowing an origin change; the fetch loop rechecks DNS next. */
export function resolveOutboundRedirect(current: URL, location: string): URL {
  const next = parseOutboundUrl(new URL(location, current))
  if (next.origin !== current.origin) {
    throw new Error('Cross-origin outbound redirects are not allowed.')
  }
  return next
}

function responseHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value != null) {
      headers.set(name, String(value))
    }
  }
  return headers
}

interface RawResponse {
  status: number
  statusMessage: string
  headers: Headers
  /** Null for a status or method that cannot carry a body. */
  body: ReadableStream<Uint8Array> | null
  /** Abandon a response nobody will read — a redirect hop, or a rejected status. */
  dispose: () => void
}

/**
 * A readable body that is still bounded.
 *
 * Buffering the whole response was simpler, and for a webhook or a JSON API it
 * cost nothing. It is fatal for the one response shape that is worth reading as
 * it arrives: a model's token stream. Draining server-sent events to completion
 * before the caller sees a byte makes incremental delivery impossible, so every
 * token of a minutes-long answer landed at once at the end.
 *
 * The ceiling is unchanged, only its enforcement point: bytes are counted as
 * they pass, and passing `maxResponseBytes` errors the stream and destroys the
 * socket exactly as the buffered form refused to return an oversized body. A
 * caller therefore sees a failure part-way through a body it has begun reading,
 * which is the necessary cost of not holding the whole thing in memory first.
 *
 * Exported for tests: it is the part worth driving directly, with no TLS.
 */
export function createBoundedBodyStream(
  source: Readable,
  maxResponseBytes: number,
  onSettled: () => void,
  /** Called for every chunk that arrives, so a caller can time SILENCE. */
  onProgress: () => void = () => {},
): { body: ReadableStream<Uint8Array>; fail: (error: Error) => void } {
  let bytes = 0
  let failure: Error | null = null
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const fail = (error: Error): void => {
    if (failure) return
    failure = error
    onSettled()
    source.destroy(error)
    try {
      controller?.error(error)
    } catch {
      // Already errored or closed; the caller's read has the failure either way.
    }
  }

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
      source.on('data', (chunk: Buffer | Uint8Array | string) => {
        if (failure) return
        onProgress()
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > maxResponseBytes) {
          fail(new Error(`Outbound response exceeded ${maxResponseBytes} bytes.`))
          return
        }
        // Copied rather than viewed: a chunk handed over by Node may sit in a
        // pooled allocation that is reused once this listener returns.
        streamController.enqueue(new Uint8Array(buffer))
        if ((streamController.desiredSize ?? 1) <= 0) source.pause()
      })
      source.on('error', (error: Error) => fail(error))
      source.on('end', () => {
        if (failure) return
        onSettled()
        try {
          streamController.close()
        } catch {
          // A cancelled reader closes the stream first; nothing left to do.
        }
      })
    },
    pull() {
      if (!failure) source.resume()
    },
    cancel() {
      // The reader walked away. Stop the transfer rather than paying for the
      // rest of a body nobody is going to look at.
      onSettled()
      source.destroy()
    },
  })

  return { body, fail }
}

function requestOnce(
  url: URL,
  resolved: ResolvedPublicHost,
  method: NonNullable<SecureFetchOptions['method']>,
  headers: Record<string, string>,
  body: Buffer | undefined,
  maxResponseBytes: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false
    let failBody: ((error: Error) => void) | null = null
    // The timeout and the abort listener now have to outlive the headers: the
    // promise settles when they arrive, but the exchange is not over until the
    // body is. Releasing them at resolve time would leave a stalled body with
    // nothing to stop it — exactly the wedge the ceiling exists to prevent.
    const settle = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const finishError = (error: Error) => {
      settle()
      if (settled) return
      settled = true
      reject(error)
    }
    const finish = (value: RawResponse) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    /** One failure path, whichever side of the headers the exchange is on. */
    const fail = (error: Error) => {
      if (settled) {
        failBody?.(error)
        return
      }
      finishError(error)
    }
    const onAbort = () => {
      const error = abortError(signal!)
      request.destroy(error)
      fail(error)
    }

    // The ceiling measures SILENCE, not total elapsed time.
    //
    // It was a single timer armed at the request and cleared only when the
    // exchange settled, which — once the body became a stream rather than a
    // buffer — turned it into a hard cap on the whole transfer. A model writing
    // a long answer is a response that is healthy and slow: an agent step died
    // at exactly 600000 ms with its reply half-written and tokens still
    // arriving, reported as a timeout.
    //
    // Refreshing it on every chunk keeps both failures it exists for — a server
    // that never answers, and a body that stops mid-transfer — while a response
    // that is still delivering is never cut off for being long.
    let timer: ReturnType<typeof setTimeout> | undefined
    const touch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        request.destroy(
          new Error(`Outbound request timed out after ${timeoutMs} ms without progress.`),
        )
      }, timeoutMs)
      timer.unref?.()
    }

    const requestHeaders: Record<string, string> = {
      ...headers,
      connection: 'close',
      host: url.host,
    }
    if (body) requestHeaders['content-length'] = String(body.length)

    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: resolved.address,
        family: resolved.family,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: requestHeaders,
        agent: false,
        maxHeaderSize: MAX_HEADER_BYTES,
        rejectUnauthorized: true,
        servername: resolved.ipLiteral ? undefined : resolved.hostname,
        checkServerIdentity: (_hostname, cert) =>
          checkServerIdentity(resolved.hostname, cert),
      },
      (response) => {
        const contentEncoding = String(
          response.headers['content-encoding'] ?? '',
        )
          .trim()
          .toLowerCase()
        if (contentEncoding && contentEncoding !== 'identity') {
          const error = new Error(
            'Outbound server ignored the identity encoding requirement.',
          )
          response.destroy(error)
          finishError(error)
          return
        }

        const advertised = Number(response.headers['content-length'])
        if (
          method !== 'HEAD' &&
          Number.isFinite(advertised) &&
          advertised > maxResponseBytes
        ) {
          const error = new Error(
            `Outbound response exceeded ${maxResponseBytes} bytes.`,
          )
          response.destroy(error)
          finishError(error)
          return
        }

        const status = response.statusCode ?? 0
        const head = {
          status,
          statusMessage: response.statusMessage ?? '',
          headers: responseHeaders(response.headers),
        }
        const dispose = () => {
          settle()
          response.destroy()
          request.destroy()
        }

        // Nothing to stream: settle the exchange here rather than waiting on a
        // body that is not coming.
        if (method === 'HEAD' || status === 204 || status === 205 || status === 304) {
          response.resume()
          settle()
          finish({ ...head, body: null, dispose })
          return
        }

        const { body, fail: failStream } = createBoundedBodyStream(
          response,
          maxResponseBytes,
          settle,
          touch,
        )
        failBody = failStream
        finish({ ...head, body, dispose })
      },
    )

    touch()
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    // `fail`, not `finishError`: once the headers are out the door this is how a
    // timeout or a dead socket reaches the body the caller is already reading.
    request.on('error', (error) => fail(error))
    if (body) request.write(body)
    request.end()
  })
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  )
}

function responseFromRaw(raw: RawResponse): Response {
  if (raw.status < 200 || raw.status > 599) {
    raw.dispose()
    throw new Error(
      `Outbound server returned unsupported HTTP status ${raw.status}.`,
    )
  }
  return new Response(raw.body, {
    status: raw.status,
    statusText: raw.statusMessage,
    headers: raw.headers,
  })
}

/**
 * Make a bounded HTTPS request to a public host.
 *
 * Every redirect is resolved and validated again. The socket connects directly
 * to the selected DNS answer while TLS/SNI is verified against the original
 * hostname, closing the validation-to-connect DNS-rebinding gap.
 */
export async function secureFetch(
  input: string | URL,
  options: SecureFetchOptions = {},
): Promise<Response> {
  if (options.signal?.aborted) throw abortError(options.signal)
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    1,
    MAX_TIMEOUT_MS,
    'Request timeout',
  )
  const maxRequestBytes = boundedInteger(
    options.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES,
    0,
    MAX_REQUEST_BYTES,
    'Maximum request size',
  )
  const maxResponseBytes = boundedInteger(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    0,
    MAX_RESPONSE_BYTES,
    'Maximum response size',
  )
  const maxRedirects = boundedInteger(
    options.maxRedirects,
    2,
    0,
    MAX_REDIRECTS,
    'Maximum redirects',
  )
  let method = options.method ?? 'GET'
  let body = requestBodyBytes(options.body)
  if ((method === 'GET' || method === 'HEAD') && body) {
    throw new Error(`${method} outbound requests cannot include a body.`)
  }
  if ((body?.length ?? 0) > maxRequestBytes) {
    throw new Error(`Outbound request body exceeded ${maxRequestBytes} bytes.`)
  }
  const configured = validateOutboundRequestConfiguration(
    input,
    options.headers,
  )
  const headers = configured.headers
  const deadline = Date.now() + timeoutMs
  const visited = new Set<string>()
  let url = configured.url

  for (let redirectCount = 0; ; redirectCount++) {
    if (visited.has(url.href))
      throw new Error('Outbound redirect loop detected.')
    visited.add(url.href)
    const remaining = deadline - Date.now()
    if (remaining <= 0)
      throw new Error(`Outbound request timed out after ${timeoutMs} ms.`)

    const resolved = await resolvePublicHost(url.hostname, {
      timeoutMs: remaining,
      resolver: options.resolver,
      signal: options.signal,
    })
    const raw = await requestOnce(
      url,
      resolved,
      method,
      headers,
      body,
      maxResponseBytes,
      Math.max(1, deadline - Date.now()),
      options.signal,
    )
    if (!isRedirect(raw.status)) return responseFromRaw(raw)

    // A redirect's own body is never handed on, so it is never read. Drop it
    // before the next hop instead of leaving a socket open behind the loop.
    raw.dispose()

    const location = raw.headers.get('location')
    if (!location)
      throw new Error(
        `Outbound redirect ${raw.status} did not include a location.`,
      )
    if (redirectCount >= maxRedirects) {
      throw new Error(`Outbound request exceeded ${maxRedirects} redirect(s).`)
    }
    const next = resolveOutboundRedirect(url, location)

    if (
      raw.status === 303 ||
      ((raw.status === 301 || raw.status === 302) && method === 'POST')
    ) {
      method = 'GET'
      body = undefined
      delete headers['content-type']
    }
    url = next
  }
}
