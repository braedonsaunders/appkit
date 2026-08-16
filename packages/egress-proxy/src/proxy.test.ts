import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from 'node:http'
import {
  connect as netConnect,
  createServer as createNetServer,
  type AddressInfo,
  type Server,
  type Socket,
} from 'node:net'
import { test } from 'node:test'
import { connect as tlsConnect } from 'node:tls'
import {
  createEgressProxy,
  readClientHelloSni,
  type CreateEgressProxyOptions,
  type EgressAuditEntry,
  type EgressPolicyRequest,
} from './index'

async function waitFor(
  condition: () => boolean,
  label: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

interface ProxyFixture {
  port: number
  entries: EgressAuditEntry[]
  policyRequests: EgressPolicyRequest[]
  stats: () => { active: number; total: number; denied: number }
  close: () => Promise<void>
}

async function startProxy(
  overrides: Partial<CreateEgressProxyOptions> = {},
): Promise<ProxyFixture> {
  const entries: EgressAuditEntry[] = []
  const policyRequests: EgressPolicyRequest[] = []
  const innerPolicy = overrides.policy ?? (() => 'allow' as const)
  const handle = createEgressProxy({
    audit: (entry) => entries.push(entry),
    listen: { host: '127.0.0.1', port: 0 },
    resolveUpstream: (host, port) => ({ host, port }),
    ...overrides,
    // Wrap whatever policy the test supplied so every test can assert on
    // exactly what the policy port was shown.
    policy: (request) => {
      policyRequests.push(request)
      return innerPolicy(request)
    },
  })
  const address = await handle.listen()
  return {
    port: address.port,
    entries,
    policyRequests,
    stats: () => handle.stats(),
    close: () => handle.close(),
  }
}

interface HttpUpstream {
  port: number
  requests: Array<{ url: string; headers: IncomingHttpHeaders }>
  close: () => Promise<void>
}

async function startHttpUpstream(): Promise<HttpUpstream> {
  const requests: Array<{ url: string; headers: IncomingHttpHeaders }> = []
  const server = createHttpServer((request, response) => {
    requests.push({ url: request.url ?? '', headers: request.headers })
    response.setHeader('content-type', 'text/plain')
    response.end('hello from upstream')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    port,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

interface TcpUpstream {
  port: number
  connections: number
  received: Buffer[]
  close: () => Promise<void>
}

async function startTcpUpstream(
  onConnection?: (socket: Socket) => void,
): Promise<TcpUpstream> {
  const received: Buffer[] = []
  const state = { connections: 0 }
  const server: Server = createNetServer((socket) => {
    state.connections += 1
    socket.on('data', (chunk: Buffer) => received.push(chunk))
    socket.on('error', () => socket.destroy())
    onConnection?.(socket)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    port,
    get connections() {
      return state.connections
    },
    received,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
      }),
  }
}

function proxiedHttpRequest(
  proxyPort: number,
  target: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port: proxyPort, path: target, agent: false, headers },
      (response) => {
        const body: Buffer[] = []
        response.on('data', (chunk: Buffer) => body.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(body).toString('utf8'),
          }),
        )
      },
    )
    request.on('error', reject)
    request.end()
  })
}

function rawExchange(port: number, payload: Buffer | string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: '127.0.0.1', port }, () => {
      socket.write(payload)
    })
    const received: Buffer[] = []
    let failed: Error | null = null
    socket.on('data', (chunk: Buffer) => received.push(chunk))
    socket.on('error', (error: NodeJS.ErrnoException) => {
      // A reset after a fail-closed destroy is an expected outcome, not a
      // test failure; anything else propagates.
      if (error.code !== 'ECONNRESET') failed = error
    })
    socket.on('close', () => {
      if (failed) reject(failed)
      else resolve(Buffer.concat(received))
    })
  })
}

test('an allowed absolute-form http request is forwarded, rewritten, and audited', async () => {
  const upstream = await startHttpUpstream()
  const proxy = await startProxy()
  try {
    const target = `http://127.0.0.1:${upstream.port}/hello?x=1`
    const response = await proxiedHttpRequest(proxy.port, target, {
      host: `127.0.0.1:${upstream.port}`,
      'proxy-authorization': 'Basic c3dvcmRmaXNo',
      'x-trace': 'keep-me',
    })
    assert.equal(response.status, 200)
    assert.equal(response.body, 'hello from upstream')

    const seen = upstream.requests[0]
    assert.ok(seen, 'upstream saw the request')
    assert.equal(seen.url, '/hello?x=1')
    assert.equal(seen.headers['proxy-authorization'], undefined)
    assert.equal(seen.headers['x-trace'], 'keep-me')
    assert.equal(seen.headers.connection, 'close')

    assert.deepEqual(proxy.policyRequests, [
      { host: '127.0.0.1', port: upstream.port, protocol: 'http', principal: null },
    ])
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'allow')
    assert.equal(decision.host, '127.0.0.1')
    assert.equal(decision.port, upstream.port)
    assert.equal(decision.protocol, 'http')

    await waitFor(
      () => proxy.entries.some((entry) => entry.event === 'flow-closed'),
      'the flow-closed audit entry',
    )
    const closed = proxy.entries.find((entry) => entry.event === 'flow-closed')
    assert.ok(closed)
    assert.ok((closed.bytesToUpstream ?? 0) > 0)
    assert.ok((closed.bytesFromUpstream ?? 0) > 0)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a denied absolute-form http request returns 403 naming the denial', async () => {
  const upstream = await startHttpUpstream()
  const proxy = await startProxy({ policy: () => 'deny' })
  try {
    const response = await proxiedHttpRequest(
      proxy.port,
      `http://127.0.0.1:${upstream.port}/secret`,
      { host: `127.0.0.1:${upstream.port}` },
    )
    assert.equal(response.status, 403)
    assert.match(response.body, /127\.0\.0\.1/)
    assert.match(response.body, /denied by policy/)
    assert.equal(upstream.requests.length, 0)

    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'deny')
    assert.equal(proxy.stats().denied, 1)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('connect tunneling pipes bytes end to end after an allow', async () => {
  const upstream = await startTcpUpstream((socket) => {
    socket.on('data', (chunk: Buffer) => socket.write(chunk))
  })
  const principal = 'agent-7'
  const proxy = await startProxy({ principalFor: () => principal })
  try {
    const socket = netConnect({ host: '127.0.0.1', port: proxy.port })
    await once(socket, 'connect')
    socket.write(`CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\nhost: 127.0.0.1:${upstream.port}\r\n\r\n`)
    const [confirmation] = (await once(socket, 'data')) as [Buffer]
    assert.match(confirmation.toString('latin1'), /^HTTP\/1\.1 200 /)
    socket.write('ping across the tunnel')
    const [echoed] = (await once(socket, 'data')) as [Buffer]
    assert.equal(echoed.toString('utf8'), 'ping across the tunnel')
    socket.destroy()

    assert.deepEqual(proxy.policyRequests, [
      { host: '127.0.0.1', port: upstream.port, protocol: 'tcp', principal },
    ])
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'allow')
    assert.equal(decision.principal, principal)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a denied connect is refused with 403 before any bytes tunnel', async () => {
  const upstream = await startTcpUpstream()
  const proxy = await startProxy({ policy: () => 'deny' })
  try {
    const response = await rawExchange(
      proxy.port,
      `CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\nhost: 127.0.0.1:${upstream.port}\r\n\r\n`,
    )
    assert.match(response.toString('latin1'), /^HTTP\/1\.1 403 /)
    assert.equal(upstream.connections, 0)
    assert.equal(upstream.received.length, 0)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a transparent tls client is routed by sni without terminating tls', async () => {
  const upstream = await startTcpUpstream()
  const proxy = await startProxy({
    resolveUpstream: () => ({ host: '127.0.0.1', port: upstream.port }),
  })
  try {
    const client = tlsConnect({
      host: '127.0.0.1',
      port: proxy.port,
      servername: 'sni.fixture.example',
      rejectUnauthorized: false,
    })
    client.on('error', () => {
      client.destroy()
    })
    await waitFor(() => upstream.received.length > 0, 'the replayed client hello')
    client.destroy()

    const replayed = Buffer.concat(upstream.received)
    assert.equal(replayed.readUInt8(0), 0x16)
    const sni = readClientHelloSni(replayed)
    assert.equal(sni.kind === 'ok' && sni.value, 'sni.fixture.example')

    assert.deepEqual(proxy.policyRequests, [
      { host: 'sni.fixture.example', port: 443, protocol: 'https', principal: null },
    ])
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'allow')
    assert.equal(decision.host, 'sni.fixture.example')
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a denied transparent tls flow is closed before any bytes leave', async () => {
  const upstream = await startTcpUpstream()
  const proxy = await startProxy({
    policy: () => 'deny',
    resolveUpstream: () => ({ host: '127.0.0.1', port: upstream.port }),
  })
  try {
    const client = tlsConnect({
      host: '127.0.0.1',
      port: proxy.port,
      servername: 'blocked.fixture.example',
      rejectUnauthorized: false,
    })
    const failure = once(client, 'error')
    await failure
    assert.equal(upstream.connections, 0)
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'deny')
    assert.equal(decision.host, 'blocked.fixture.example')
    assert.equal(decision.protocol, 'https')
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a transparent plain-http flow is routed by its host header and forwarded untouched', async () => {
  const upstream = await startHttpUpstream()
  const proxy = await startProxy({
    policy: async () => 'allow' as const,
    resolveUpstream: () => ({ host: '127.0.0.1', port: upstream.port }),
  })
  try {
    const response = await rawExchange(
      proxy.port,
      'GET /report HTTP/1.1\r\nhost: files.fixture.example\r\nconnection: close\r\n\r\n',
    )
    assert.match(response.toString('latin1'), /hello from upstream/)
    const seen = upstream.requests[0]
    assert.ok(seen, 'upstream saw the request')
    assert.equal(seen.url, '/report')
    assert.equal(seen.headers.host, 'files.fixture.example')

    assert.deepEqual(proxy.policyRequests, [
      { host: 'files.fixture.example', port: 80, protocol: 'http', principal: null },
    ])
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a policy exception fails closed and audits the error', async () => {
  const proxy = await startProxy({
    policy: () => {
      throw new Error('policy backend unavailable')
    },
  })
  try {
    const response = await proxiedHttpRequest(proxy.port, 'http://127.0.0.1:9/x', {
      host: '127.0.0.1:9',
    })
    assert.equal(response.status, 403)
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'deny')
    assert.match(decision.reason ?? '', /policy backend unavailable/)
    assert.equal(proxy.stats().denied, 1)
  } finally {
    await proxy.close()
  }
})

test('malformed tls bytes are denied and audited', async () => {
  const proxy = await startProxy()
  try {
    const record = Buffer.from([0x16, 0x03, 0x01, 0x00, 0x04, 0x02, 0x00, 0x00, 0x00])
    const response = await rawExchange(proxy.port, record)
    assert.equal(response.length, 0)
    const decision = proxy.entries.find((entry) => entry.event === 'decision')
    assert.ok(decision)
    assert.equal(decision.decision, 'deny')
    assert.equal(decision.host, null)
    assert.equal(decision.protocol, 'https')
    assert.match(decision.reason ?? '', /could not be parsed/)
    assert.equal(proxy.stats().denied, 1)
    assert.equal(proxy.policyRequests.length, 0)
  } finally {
    await proxy.close()
  }
})

test('an upstream connection failure after an allow is audited as an upstream error', async () => {
  const vacated = await startTcpUpstream()
  const vacatedPort = vacated.port
  await vacated.close()
  const proxy = await startProxy()
  try {
    const response = await proxiedHttpRequest(proxy.port, `http://127.0.0.1:${vacatedPort}/x`, {
      host: `127.0.0.1:${vacatedPort}`,
    })
    assert.equal(response.status, 502)
    const failure = proxy.entries.find((entry) => entry.event === 'upstream-error')
    assert.ok(failure)
    assert.equal(failure.decision, 'allow')
    assert.match(failure.reason ?? '', /ECONNREFUSED/)
  } finally {
    await proxy.close()
  }
})

test('the default upstream resolver refuses non-public destinations even after an allow', async () => {
  const proxy = await startProxy({ resolveUpstream: undefined })
  try {
    const response = await proxiedHttpRequest(proxy.port, 'http://127.0.0.1:9/x', {
      host: '127.0.0.1:9',
    })
    assert.equal(response.status, 403)
    assert.match(response.body, /non-public/)
    const refusalEntry = proxy.entries.find((entry) => entry.event === 'upstream-error')
    assert.ok(refusalEntry)
    assert.equal(refusalEntry.decision, 'deny')
    assert.equal(proxy.stats().denied, 1)
  } finally {
    await proxy.close()
  }
})

test('stats track active, total, and denied across flows', async () => {
  const upstream = await startHttpUpstream()
  const proxy = await startProxy({
    policy: ({ host }) => (host === '127.0.0.1' ? 'allow' : 'deny'),
  })
  try {
    const allowed = await proxiedHttpRequest(
      proxy.port,
      `http://127.0.0.1:${upstream.port}/ok`,
      { host: `127.0.0.1:${upstream.port}` },
    )
    assert.equal(allowed.status, 200)
    const refused = await rawExchange(
      proxy.port,
      'GET /nope HTTP/1.1\r\nhost: blocked.fixture.example\r\nconnection: close\r\n\r\n',
    )
    assert.match(refused.toString('latin1'), /^HTTP\/1\.1 403 /)

    await waitFor(() => proxy.stats().active === 0, 'all connections to close')
    assert.equal(proxy.stats().total, 2)
    assert.equal(proxy.stats().denied, 1)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('a throwing audit sink never takes down the data path', async () => {
  const upstream = await startHttpUpstream()
  const handle = createEgressProxy({
    policy: () => 'allow',
    audit: () => {
      throw new Error('ledger offline')
    },
    listen: { host: '127.0.0.1', port: 0 },
    resolveUpstream: (host, port) => ({ host, port }),
  })
  try {
    const address = await handle.listen()
    const response = await proxiedHttpRequest(
      address.port,
      `http://127.0.0.1:${upstream.port}/still-works`,
      { host: `127.0.0.1:${upstream.port}` },
    )
    assert.equal(response.status, 200)
    assert.equal(response.body, 'hello from upstream')
  } finally {
    await handle.close()
    await upstream.close()
  }
})
