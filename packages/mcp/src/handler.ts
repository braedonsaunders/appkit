import { randomUUID } from 'node:crypto'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { jsonRpcErrorResponse } from './boundary.js'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/

/**
 * The caller's `X-Request-ID` when it is well-formed, else a fresh UUID —
 * a hostile header can never inject log noise or collide with another request.
 */
export function resolveMcpRequestId(request: Request, header = 'x-request-id'): string {
  const value = request.headers.get(header)
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID()
}

export interface HandleStreamableHttpOptions {
  /** A per-request server instance; the handler closes it when the exchange ends. */
  server: McpServer
  /** Forwarded to the transport so tool handlers can see the authenticated caller. */
  authInfo?: AuthInfo
  /** Echoed back as `X-Request-ID` on the response. */
  requestId?: string
  /** Observes transport failures; the caller still gets a clean JSON-RPC 500. */
  onError?: (error: unknown) => void
}

/**
 * Serve one stateless MCP exchange over streamable HTTP: connect a fresh
 * transport, handle the request, stamp response headers, and always tear both
 * transport and server down — a request can never leak a session.
 */
export async function handleStreamableHttpRequest(
  request: Request,
  options: HandleStreamableHttpOptions,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  try {
    await options.server.connect(transport)
    const response = await transport.handleRequest(
      request,
      options.authInfo ? { authInfo: options.authInfo } : undefined,
    )
    const headers = new Headers(response.headers)
    if (options.requestId) headers.set('x-request-id', options.requestId)
    headers.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  } catch (error) {
    options.onError?.(error)
    return jsonRpcErrorResponse(500, -32603, 'Internal server error')
  } finally {
    await Promise.allSettled([transport.close(), options.server.close()])
  }
}
