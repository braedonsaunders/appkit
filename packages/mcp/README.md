# @braedonsaunders/mcp

Expose an app's governed tool catalogue over the Model Context Protocol.

The design rule this package enforces: **the agent surface is a thin adapter
over the same gated engines the app already uses, never a parallel API.** An
app defines its capabilities once as a catalogue; MCP registration, transport
handling, boundary defence, and audit are the reusable part. A tool the caller
may not use is never registered — the model cannot see it, so it cannot ask
for it. Everything a tool throws passes through one error mapper; anything the
mapper declines collapses to a generic failure, so stack frames, SQL, and
secrets can never reach the model by accident.

Framework-neutral: everything speaks web-standard `Request`/`Response`, so the
same handler serves Next.js route handlers, Hono, Bun, or plain Node.

## The pieces

| Module | What it owns |
| --- | --- |
| `catalog` | `McpCatalogTool` — one entry in the app's canonical capability catalogue — and `registerToolCatalog`, which registers only the visible ones, wraps execution in the result contract, times it, and reports every call to an audit hook. |
| `handler` | `handleStreamableHttpRequest` — one stateless streamable-HTTP exchange: fresh transport, auth info forwarded, `X-Request-ID` + `no-store` stamped, transport and server always torn down. `resolveMcpRequestId` accepts a well-formed caller id and replaces anything else. |
| `boundary` | Host validation (DNS-rebinding defence) and cross-origin allowlisting, plus JSON-RPC error responses, CORS preflight, and 405. |
| `result` | `mcpSuccess` / `mcpFailure` and the `McpErrorMapper` seam. |
| `resources` | `registerStaticResources` — ship ground rules, playbooks, and live schemas as readable resources, so an agent learns the app's doctrine from the surface itself. |

## Usage

```ts
import {
  handleStreamableHttpRequest,
  mcpBoundaryResponse,
  registerStaticResources,
  registerToolCatalog,
  resolveMcpRequestId,
} from '@braedonsaunders/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function POST(request: Request): Promise<Response> {
  const rejected = mcpBoundaryResponse(request, { allowedOrigins: TRUSTED_ORIGINS })
  if (rejected) return rejected

  const auth = await authenticate(request)          // the app's own auth
  const server = new McpServer({ name: 'my-app', version: VERSION }, { instructions })

  registerToolCatalog(server, TOOL_CATALOG, {
    context: appContext(auth),                      // tenant + RBAC-bound
    mapError: (e) => (e instanceof AppError ? { code: e.code, message: e.message } : null),
    audit: (event) => auditLog(auth, event),
  })
  registerStaticResources(server, PLAYBOOKS)

  return handleStreamableHttpRequest(request, {
    server,
    requestId: resolveMcpRequestId(request),
    authInfo: { token: auth.keyId, clientId: auth.clientId, scopes: auth.scopes },
  })
}
```

## What stays in the app

Authentication, rate limiting, the catalogue itself, and every domain rule.
Tools must terminate in the app's governed services — permissions, validation,
idempotency, period locks — so the MCP surface can never do something a normal
API caller could not, and the agent acts *as the authenticated user*, never as
the platform.
