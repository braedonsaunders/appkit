import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { createMemoryAppStore } from './memory'
import { APP_CSP, BRIDGE_MARKER, bridgeClientSource, inlineDocument, parseBridgeRequest } from './bridge'
import { parseZipBundle } from './bundle'
import { createAppScaffold, getFrontendBundle, installApp, installFromListing, runBridgeMethod, updateApp, type AppBundle, type AppObjectProvisioner } from './index'
import { parseManifest, validateBundle } from './manifest'
import { createAppEndpointRuntime } from './runtime'
import { createBoundAppService } from './service'

const tenantId = 'tenant-1'
const actorId = '00000000-0000-0000-0000-000000000001'
const capabilities = new Set(['records.read', 'records.write'])

test('validates manifests, unique endpoints, and every referenced file', () => {
  const parsed = parseManifest({ key: 'sample', name: 'Sample', version: '1.0.0', permissions: [], frontend: { entry: 'frontend/index.html' }, endpoints: [{ name: 'read', file: 'backend/read.js' }, { name: 'read', file: 'backend/other.js' }] })
  assert.equal(parsed.ok, false)
  assert.match(parsed.errors.join(' '), /duplicate endpoint/)
  const valid = parseManifest(bundle().manifest)
  assert.equal(valid.ok, true)
  const files = (bundle().files).map((file) => file.path)
  assert.equal(validateBundle(valid.manifest!, files).ok, true)
  assert.equal(validateBundle(valid.manifest!, files.filter((path) => path !== 'backend/hello.js')).ok, false)
})

test('parses real zip uploads with a shared top-level folder and binary assets', () => {
  const archive = zipSync({
    'sample/manifest.json': strToU8(JSON.stringify(bundle().manifest)),
    'sample/frontend/index.html': strToU8('<h1>Hi</h1>'),
    'sample/backend/hello.js': strToU8('function handler(){}'),
    'sample/frontend/logo.png': new Uint8Array([137, 80, 78, 71]),
  })
  const parsed = parseZipBundle(archive)
  assert.equal((parsed.manifest as { key: string }).key, 'sample')
  assert.equal(parsed.files.find((file) => file.path === 'frontend/logo.png')?.isBinary, true)
})

test('preserves the opaque-origin bridge trust contract', () => {
  assert.match(APP_CSP, /connect-src 'none'/)
  const source = bridgeClientSource({ app: { id: '1', key: 'sample', name: 'Sample', version: '1.0.0' }, user: null })
  assert.match(source, /window\.appkit/)
  assert.equal(parseBridgeRequest({ [BRIDGE_MARKER]: true, type: 'call', id: '1', method: 'callBackend', payload: null })?.method, 'callBackend')
  assert.equal(parseBridgeRequest({ type: 'call', id: '1', method: 'callBackend' }), null)
  const html = inlineDocument('<html><head></head><body><script src="frontend/app.js"></script></body></html>', { 'frontend/app.js': 'data:text/javascript;base64,QQ==' }, '<meta name="safe">')
  assert.match(html, /data:text\/javascript/)
  assert.match(html, /name="safe"/)
})

test('installs immutable versions, narrows grants, provisions objects, and builds a self-contained frontend', async () => {
  const store = createMemoryAppStore()
  const seen: string[] = []
  const provisioner: AppObjectProvisioner = {
    validate: (objects) => objects.map((object) => object.type === 'record_type' ? '' : 'unsupported').filter(Boolean),
    async provision({ objects, previouslyOwned }) { const owned = [...previouslyOwned, ...objects.map((object) => `${object.type}:${object.key}`)]; seen.push(...owned); return owned },
  }
  const app = await installApp({ store, tenantId, actorId, bundle: bundle({ permissions: ['records.read'], grantedPermissions: ['records.read', 'not-requested'], object: true }), capabilityKeys: capabilities, provisioner })
  assert.deepEqual(app.grantedPermissions, ['records.read'])
  assert.deepEqual(seen, ['record_type:inspection'])
  const frontend = await getFrontendBundle(store, tenantId, app.key)
  assert.match(frontend.entryHtml, /Sample/)
  assert.match(frontend.replacements['frontend/styles.css']!, /^data:text\/css/)
  await assert.rejects(() => installApp({ store, tenantId, actorId, bundle: bundle({ permissions: ['records.read'], object: true }), capabilityKeys: capabilities, provisioner }), /version 1.0.0 already exists/)
})

test('runs backend endpoints with capability intersection, storage, and durable audit history', async () => {
  const store = createMemoryAppStore()
  const app = await installApp({ store, tenantId, actorId, bundle: bundle({ permissions: ['records.read'] }), capabilityKeys: capabilities })
  const denied = await runBridgeMethod({ store, tenantId, key: app.key, user: { id: actorId, name: 'Ada' }, method: 'records.list', payload: { typeKey: 'order' }, adapters: { capabilityKeys: capabilities, userCan: () => false, records: () => ({ list: async () => [{ id: '1' }], get: async () => null }) } })
  assert.deepEqual(denied, { ok: false, error: 'records.read not granted', status: 403 })
  const called = await runBridgeMethod({ store, tenantId, key: app.key, user: { id: actorId, name: 'Ada' }, method: 'callBackend', payload: { endpoint: 'hello', payload: { n: 4 } }, adapters: { capabilityKeys: capabilities, userCan: () => true } })
  assert.equal(called.ok, true)
  if (called.ok) assert.deepEqual(called.result, { status: 200, body: { count: 1, received: { n: 4 } } })
  const runs = await store.listRuns(tenantId, app.id)
  assert.equal(runs.length, 1)
  assert.equal(runs[0]?.status, 'ok')
})

test('authors, publishes, browses, and installs marketplace snapshots through the same validator', async () => {
  const store = createMemoryAppStore()
  const app = await createAppScaffold({ store, tenantId, actorId, name: 'Field console', capabilityKeys: capabilities })
  await store.writeFile(tenantId, actorId, app.key, { path: 'frontend/extra.js', content: 'window.extra=true' })
  await store.updateMeta(tenantId, actorId, app.key, { description: 'A complete installed app.', version: '0.2.0' })
  const listing = await store.publish(tenantId, actorId, app.key)
  const page = await store.listListings({ page: 1, perPage: 20, query: 'Field' })
  assert.equal(page.total, 1)
  const installed = await installFromListing({ store, tenantId: 'tenant-2', actorId, listingId: listing.id, capabilityKeys: capabilities })
  assert.equal(installed.key, app.key)
  assert.equal((await store.listFiles('tenant-2', installed.key)).some((file) => file.path === 'frontend/extra.js'), true)
})

test('authors requested capabilities separately from administrator grants', async () => {
  const store = createMemoryAppStore()
  const app = await createAppScaffold({ store, tenantId, actorId, name: 'Capability editor', capabilityKeys: capabilities })
  await updateApp({ store, tenantId, actorId, key: app.key, capabilityKeys: capabilities, update: { requestedPermissions: ['records.read', 'records.write'], grantedPermissions: ['records.read'] } })
  const updated = await store.getApp(tenantId, app.key)
  assert.deepEqual(updated?.manifest?.permissions, ['records.read', 'records.write'])
  assert.deepEqual(updated?.grantedPermissions, ['records.read'])
  await assert.rejects(() => updateApp({ store, tenantId, actorId, key: app.key, capabilityKeys: capabilities, update: { requestedPermissions: ['ambient.network'] } }), /unknown capabilities/)
})

test('binds source-shaped endpoint and lifecycle services without hardcoded application globals', async () => {
  const storage = new Map<string, unknown>()
  const runEndpoint = createAppEndpointRuntime<{ storage: ReturnType<typeof storageAdapter>; emit: (value: unknown) => unknown }>({
    globalName: 'suite',
    adapters: (adapters) => ({ storage: adapters.storage, functions: { emit: { cost: 2, handler: ([value]) => adapters.emit(value) } } }),
  })
  const endpoint = await runEndpoint({
    source: 'function handler(request){suite.storage.set("last",request.body);return suite.emit(suite.storage.get("last"))}',
    request: { method: 'POST', endpoint: 'echo', query: {}, body: { ok: true }, user: null },
    adapters: { storage: storageAdapter(storage), emit: (value) => value },
  })
  assert.equal(endpoint.status, 'ok')
  assert.deepEqual(endpoint.response?.body, { ok: true })

  type Bridge = { scope: string; key: string; user: { id: string; name: string }; method: string; payload: unknown; userCan: () => boolean }
  const store = createMemoryAppStore()
  const service = createBoundAppService<Bridge>({
    store,
    capabilityKeys: capabilities,
    tenantId: (input) => input.scope,
    runtime: () => ({}),
  })
  const created = await service.createAppScaffold(tenantId, actorId, 'Bound console')
  await service.updateAppMeta(tenantId, actorId, created.key, { requestedPermissions: ['records.read'], grantedPermissions: ['records.read'] })
  assert.equal((await service.getAppByKey(tenantId, created.key))?.grantedPermissions[0], 'records.read')
  assert.equal((await service.publishApp(tenantId, actorId, created.key)).id.length > 0, true)
})

function bundle(options: { permissions?: string[]; grantedPermissions?: string[]; object?: boolean } = {}): AppBundle {
  const files = [
    { path: 'frontend/index.html', content: '<html><head><link rel="stylesheet" href="frontend/styles.css"></head><body><h1>Sample</h1></body></html>' },
    { path: 'frontend/styles.css', content: 'body{font-family:system-ui}' },
    { path: 'backend/hello.js', content: 'function handler(request){var n=appkit.storage.get("count")||0;appkit.storage.set("count",n+1);return {count:n+1,received:request.body}}' },
  ]
  if (options.object) files.push({ path: 'objects/inspection.json', content: JSON.stringify({ type: 'record_type', key: 'inspection', name: 'Inspection' }) })
  return {
    manifest: { key: 'sample', name: 'Sample', version: '1.0.0', permissions: options.permissions ?? [], frontend: { entry: 'frontend/index.html' }, endpoints: [{ name: 'hello', file: 'backend/hello.js', method: 'POST' }] },
    files,
    grantedPermissions: options.grantedPermissions,
  }
}

function storageAdapter(values: Map<string, unknown>) {
  const identity = (namespace: string, key: string) => `${namespace}:${key}`
  return {
    async get(key: string, namespace: string) { return values.get(identity(namespace, key)) ?? null },
    async set(key: string, value: unknown, namespace: string) { values.set(identity(namespace, key), value) },
    async list(prefix: string, namespace: string) { return [...values].filter(([key]) => key.startsWith(`${namespace}:${prefix}`)).map(([key, value]) => ({ key: key.slice(namespace.length + 1), value })) },
    async delete(key: string, namespace: string) { values.delete(identity(namespace, key)) },
  }
}
