import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  handleStreamableHttpRequest,
  mcpFailure,
  mcpMethodNotAllowed,
  mcpPreflightResponse,
  mcpSuccess,
  registerStaticResources,
  registerToolCatalog,
  resolveMcpRequestId,
  toolTitle,
  validateMcpBoundary,
  type McpToolAuditEvent,
} from './index.js'

class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const mapAppError = (error: unknown) =>
  error instanceof AppError ? { code: error.code, message: error.message } : null

interface Ctx {
  role: 'admin' | 'viewer'
}

function catalogTools() {
  return [
    {
      name: 'get_thing',
      description: 'Reads a thing.',
      inputSchema: z.object({ id: z.string() }),
      readOnly: true,
      execute: async (_ctx: Ctx, input: Record<string, unknown>) => ({
        ok: true,
        id: input.id,
      }),
    },
    {
      name: 'delete_thing',
      description: 'Deletes a thing.',
      inputSchema: z.object({ id: z.string() }),
      readOnly: false,
      destructive: true,
      visible: (ctx: Ctx) => ctx.role === 'admin',
      execute: async () => {
        throw new AppError('period_locked', 'The period is closed.', 409)
      },
    },
  ]
}

async function connectedClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

test('toolTitle renders snake_case names', () => {
  assert.equal(toolTitle('list_open_items'), 'List Open Items')
})

test('mcpSuccess carries structured content and a text rendering', () => {
  const result = mcpSuccess({ ok: true, total: 3 }, '3 items')
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.structuredContent, { ok: true, total: 3 })
  assert.deepEqual(result.content, [{ type: 'text', text: '3 items' }])
})

test('mcpFailure surfaces mapped errors and hides everything else', () => {
  const mapped = mcpFailure(new AppError('forbidden', 'Not yours.', 403), mapAppError)
  assert.equal(mapped.isError, true)
  assert.deepEqual(mapped.structuredContent, {
    ok: false,
    error: { code: 'forbidden', message: 'Not yours.' },
  })

  const unmapped = mcpFailure(new Error('SELECT * FROM secrets failed'), mapAppError)
  assert.deepEqual(unmapped.structuredContent, {
    ok: false,
    error: { code: 'internal_error', message: 'The operation failed.' },
  })
})

test('validateMcpBoundary enforces host and origin', () => {
  const request = (headers: Record<string, string>) =>
    new Request('https://app.example.com/mcp', { headers })

  assert.equal(validateMcpBoundary(request({ host: 'app.example.com' })), null)
  assert.equal(validateMcpBoundary(request({}))?.status, 421)
  assert.equal(validateMcpBoundary(request({ host: 'evil.example.com' }))?.status, 421)
  assert.equal(
    validateMcpBoundary(request({ host: 'evil.example.com' }), {
      allowedHosts: ['EVIL.example.com'],
    }),
    null,
  )

  const crossOrigin = request({ host: 'app.example.com', origin: 'https://other.example.com' })
  assert.equal(validateMcpBoundary(crossOrigin)?.status, 403)
  assert.equal(
    validateMcpBoundary(crossOrigin, { allowedOrigins: ['https://other.example.com'] }),
    null,
  )
  assert.equal(
    validateMcpBoundary(
      request({ host: 'app.example.com', origin: 'https://app.example.com' }),
    ),
    null,
  )
})

test('preflight and method-not-allowed responses', async () => {
  const preflight = mcpPreflightResponse(
    new Request('https://app.example.com/mcp', {
      method: 'OPTIONS',
      headers: { origin: 'https://caller.example.com' },
    }),
  )
  assert.equal(preflight.status, 204)
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    'https://caller.example.com',
  )

  const rejected = mcpMethodNotAllowed()
  assert.equal(rejected.status, 405)
  assert.equal(rejected.headers.get('allow'), 'POST, OPTIONS')
  const body = (await rejected.json()) as { error: { code: number } }
  assert.equal(body.error.code, -32000)
})

test('resolveMcpRequestId accepts well-formed ids and replaces the rest', () => {
  const wellFormed = new Request('https://a.example/mcp', {
    headers: { 'x-request-id': 'req_1234567890' },
  })
  assert.equal(resolveMcpRequestId(wellFormed), 'req_1234567890')

  const malformed = new Request('https://a.example/mcp', {
    headers: { 'x-request-id': 'spaces are not allowed' },
  })
  assert.match(resolveMcpRequestId(malformed), /^[0-9a-f-]{36}$/)

  const tooShort = new Request('https://a.example/mcp', {
    headers: { 'x-request-id': 'req_1' },
  })
  assert.match(resolveMcpRequestId(tooShort), /^[0-9a-f-]{36}$/)
})

test('registerToolCatalog hides gated tools and reports audits', async () => {
  const audits: McpToolAuditEvent[] = []
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const registered = registerToolCatalog(server, catalogTools(), {
    context: { role: 'viewer' } satisfies Ctx,
    audit: (event) => audits.push(event),
    mapError: mapAppError,
  })
  assert.equal(registered, 1)

  const client = await connectedClient(server)
  const tools = await client.listTools()
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ['get_thing'],
  )
  assert.equal(tools.tools[0]?.annotations?.readOnlyHint, true)

  const result = await client.callTool({ name: 'get_thing', arguments: { id: 'a1' } })
  assert.deepEqual(result.structuredContent, { ok: true, id: 'a1' })
  assert.equal(audits.length, 1)
  assert.equal(audits[0]?.status, 'ok')
  await client.close()
})

test('registerToolCatalog maps thrown app errors and audits the failure', async () => {
  const audits: McpToolAuditEvent[] = []
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerToolCatalog(server, catalogTools(), {
    context: { role: 'admin' } satisfies Ctx,
    audit: (event) => audits.push(event),
    mapError: mapAppError,
    errorStatusCode: (error) => (error instanceof AppError ? error.status : 500),
  })

  const client = await connectedClient(server)
  const result = await client.callTool({ name: 'delete_thing', arguments: { id: 'a1' } })
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: { code: 'period_locked', message: 'The period is closed.' },
  })
  const failure = audits.find((event) => event.status === 'error')
  assert.equal(failure?.statusCode, 409)
  assert.equal(failure?.errorSummary, 'period_locked: The period is closed.')
  await client.close()
})

test('registerStaticResources serves text and thunked resources', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerStaticResources(server, [
    {
      name: 'ground-rules',
      uri: 'app://skills/ground-rules',
      title: 'Ground rules',
      text: 'Read before you write.',
    },
    {
      name: 'live-schema',
      uri: 'app://schema',
      title: 'Schema',
      mimeType: 'application/json',
      text: async () => JSON.stringify({ kinds: ['invoice'] }),
    },
  ])

  const client = await connectedClient(server)
  const listed = await client.listResources()
  assert.equal(listed.resources.length, 2)

  const rules = await client.readResource({ uri: 'app://skills/ground-rules' })
  const first = rules.contents[0]
  assert.ok(first && 'text' in first)
  assert.equal(first.text, 'Read before you write.')
  assert.equal(first.mimeType, 'text/markdown')

  const schema = await client.readResource({ uri: 'app://schema' })
  assert.equal(schema.contents[0]?.mimeType, 'application/json')
  await client.close()
})

test('handleStreamableHttpRequest serves a stateless initialize exchange', async () => {
  const server = new McpServer({ name: 'test-http', version: '0.0.0' })
  const response = await handleStreamableHttpRequest(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      }),
    }),
    { server, requestId: 'req_abcdef123456' },
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-request-id'), 'req_abcdef123456')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = (await response.json()) as {
    result: { serverInfo: { name: string } }
  }
  assert.equal(body.result.serverInfo.name, 'test-http')
})
