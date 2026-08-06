/**
 * Request-boundary validation for an MCP HTTP endpoint.
 *
 * Two checks, both cheap and both fail-closed:
 *
 * - **Host** — the `Host` header must match the request URL (or an explicit
 *   allowlist). This is the DNS-rebinding defence: a hostile page resolving
 *   its own name to this server's address still sends its own Host.
 * - **Origin** — a cross-origin browser caller must be explicitly allowed.
 *   Non-browser clients send no Origin and pass untouched.
 */

export interface McpBoundaryOptions {
  /** Extra `host[:port]` values accepted beyond the request URL's own host. */
  allowedHosts?: Iterable<string>
  /** Extra origins accepted beyond the request URL's own origin. */
  allowedOrigins?: Iterable<string>
}

export interface McpBoundaryViolation {
  status: number
  code: number
  message: string
}

const DEFAULT_ALLOWED_HEADERS =
  'Authorization, Content-Type, Accept, MCP-Protocol-Version, X-Request-ID'
const DEFAULT_EXPOSED_HEADERS = 'MCP-Protocol-Version, X-Request-ID'

function toSet(values: Iterable<string> | undefined, lowercase: boolean): Set<string> {
  const set = new Set<string>()
  for (const value of values ?? []) {
    const trimmed = value.trim()
    if (trimmed) set.add(lowercase ? trimmed.toLowerCase() : trimmed)
  }
  return set
}

/** A JSON-RPC error as a web-standard Response. */
export function jsonRpcErrorResponse(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
    { status, headers: { 'content-type': 'application/json' } },
  )
}

/** Null when the request passes the boundary; otherwise the violation to return. */
export function validateMcpBoundary(
  request: Request,
  options: McpBoundaryOptions = {},
): McpBoundaryViolation | null {
  const url = new URL(request.url)
  const host = request.headers.get('host')?.toLowerCase()
  const expectedHost = url.host.toLowerCase()
  if (!host || (host !== expectedHost && !toSet(options.allowedHosts, true).has(host))) {
    return { status: 421, code: -32001, message: 'Misdirected Request' }
  }

  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin && !toSet(options.allowedOrigins, false).has(origin)) {
    return { status: 403, code: -32001, message: 'Origin not allowed' }
  }
  return null
}

/** {@link validateMcpBoundary} rendered as a Response, or null to proceed. */
export function mcpBoundaryResponse(
  request: Request,
  options: McpBoundaryOptions = {},
): Response | null {
  const violation = validateMcpBoundary(request, options)
  return violation
    ? jsonRpcErrorResponse(violation.status, violation.code, violation.message)
    : null
}

/** CORS preflight for the endpoint; echoes the caller's origin when present. */
export function mcpPreflightResponse(
  request: Request,
  options: { allowedHeaders?: string; exposedHeaders?: string; maxAgeSeconds?: number } = {},
): Response {
  const headers = new Headers()
  const origin = request.headers.get('origin')
  if (origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('vary', 'Origin')
  }
  headers.set('access-control-allow-methods', 'POST, OPTIONS')
  headers.set('access-control-allow-headers', options.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS)
  headers.set('access-control-expose-headers', options.exposedHeaders ?? DEFAULT_EXPOSED_HEADERS)
  headers.set('access-control-max-age', String(options.maxAgeSeconds ?? 600))
  return new Response(null, { status: 204, headers })
}

/** 405 for the verbs a stateless MCP endpoint does not serve. */
export function mcpMethodNotAllowed(): Response {
  const response = jsonRpcErrorResponse(405, -32000, 'Method not allowed')
  response.headers.set('allow', 'POST, OPTIONS')
  return response
}
