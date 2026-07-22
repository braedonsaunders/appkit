import { runEndpoint, type HostFunction, type RecordsAdapter, type StorageAdapter } from '@appkit/endpoints'
import type { AppBundle, AppBundleFile } from './bundle'
import { contentTypeFor, parseManifest, validateBundle, type AppEndpoint, type AppManifest } from './manifest'
import { parseAppObjects, type AppObjectSpec } from './objects'

export type AppStatus = 'installed' | 'disabled'
export type AppVersionStatus = 'draft' | 'active' | 'superseded'
export type AppFileKind = 'frontend' | 'backend' | 'asset' | 'object'
export type AppRunStatus = 'ok' | 'error' | 'timeout' | 'forbidden'

export interface InstalledApp {
  id: string
  tenantId: string
  key: string
  name: string
  description: string | null
  iconKey: string
  status: AppStatus
  activeVersionId: string | null
  grantedPermissions: string[]
  showInNav: boolean
  sortOrder: number
  provisionedObjects: string[]
  version: string | null
  manifest: AppManifest | null
}

export interface AppVersion {
  id: string
  tenantId: string
  appId: string
  version: string
  manifest: AppManifest
  status: AppVersionStatus
  createdAt: Date
}

export interface AppFile {
  id: string
  tenantId: string
  appId: string
  versionId: string
  path: string
  kind: AppFileKind
  contentType: string
  content: string
  isBinary: boolean
  size: number
}

export interface AppRun {
  id?: string
  tenantId: string
  appId: string
  versionId: string | null
  endpoint: string
  status: AppRunStatus
  units: number
  logs: string[]
  errorMessage: string | null
  durationMs: number
  actorId: string | null
  at: Date
}

export interface AppListing {
  id: string
  publisherTenantId: string
  key: string
  name: string
  description: string | null
  iconKey: string
  version: string
  manifest: AppManifest
  files: AppBundleFile[]
  isActive: boolean
  updatedAt: Date
}

export interface AppMetaUpdate {
  name?: string
  description?: string | null
  iconKey?: string
  requestedPermissions?: string[]
  grantedPermissions?: string[]
  showInNav?: boolean
  sortOrder?: number
  version?: string
  frontendEntry?: string
  endpoints?: AppEndpoint[]
}

/**
 * Applies an authored manifest/settings change through the same capability
 * registry used at install time. Store adapters remain responsible for the
 * atomic manifest + installation update.
 */
export async function updateApp(options: {
  store: AppStore
  tenantId: string
  actorId: string
  key: string
  update: AppMetaUpdate
  capabilityKeys: ReadonlySet<string>
}): Promise<void> {
  const requested = [...new Set(options.update.requestedPermissions ?? [])]
  const unknown = requested.filter((permission) => !options.capabilityKeys.has(permission))
  if (unknown.length) throw new AppError(`unknown capabilities: ${unknown.join(', ')}`)
  await options.store.updateMeta(options.tenantId, options.actorId, options.key, {
    ...options.update,
    ...(options.update.requestedPermissions === undefined ? {} : { requestedPermissions: requested }),
    ...(options.update.grantedPermissions === undefined ? {} : { grantedPermissions: [...new Set(options.update.grantedPermissions)] }),
  })
}

export interface AppObjectProvisioner {
  /** Validate domain-owned object declarations before persistence begins. */
  validate(objects: AppObjectSpec[]): Promise<string[]> | string[]
  /** Called inside the persistence adapter's install transaction. */
  provision(input: {
    tenantId: string
    appId: string
    objects: AppObjectSpec[]
    previouslyOwned: string[]
    transaction: unknown
  }): Promise<string[]>
}

export interface PersistInstallInput {
  tenantId: string
  actorId: string
  manifest: AppManifest
  grantedPermissions: string[]
  files: Array<AppBundleFile & { kind: AppFileKind; contentType: string }>
  objects: AppObjectSpec[]
  provisioner?: AppObjectProvisioner
}

/** Persistence contract; the Drizzle and in-memory implementations are complete adapters. */
export interface AppStore {
  listApps(tenantId: string): Promise<InstalledApp[]>
  getApp(tenantId: string, key: string): Promise<InstalledApp | null>
  installBundle(input: PersistInstallInput): Promise<InstalledApp>
  setStatus(tenantId: string, key: string, status: AppStatus): Promise<void>
  deleteApp(tenantId: string, key: string): Promise<void>
  updateMeta(tenantId: string, actorId: string, key: string, update: AppMetaUpdate): Promise<void>
  listFiles(tenantId: string, key: string): Promise<AppFile[]>
  readFile(tenantId: string, key: string, path: string): Promise<AppFile | null>
  writeFile(tenantId: string, actorId: string, key: string, file: AppBundleFile): Promise<void>
  deleteFile(tenantId: string, key: string, path: string): Promise<void>
  storage(tenantId: string, appId: string): StorageAdapter
  recordRun(run: AppRun): Promise<void>
  listRuns(tenantId: string, appId: string, limit?: number): Promise<AppRun[]>
  listListings(input: { query?: string; page: number; perPage: number }): Promise<{ listings: AppListing[]; total: number }>
  publish(tenantId: string, actorId: string, key: string): Promise<AppListing>
  getListing(listingId: string): Promise<AppListing | null>
}

export interface AppRuntimeAdapters {
  /** Registry of capabilities a deployment allows manifests to request. */
  capabilityKeys: ReadonlySet<string>
  records?: (tenantId: string, user: AppUser) => RecordsAdapter
  functions?: (input: { tenantId: string; app: InstalledApp; user: AppUser; granted: ReadonlySet<string> }) => Record<string, HostFunction>
  userCan: (user: AppUser, permission: string) => boolean
  /** Host global used by authored backend files. Defaults to `appkit`. */
  hostGlobalName?: string
}

export interface AppUser {
  id: string
  name: string
  role?: string
}

export class AppError extends Error {
  override readonly name = 'AppError'
  constructor(message: string, public readonly status = 400) { super(message) }
}

export async function installApp(options: {
  store: AppStore
  tenantId: string
  actorId: string
  bundle: AppBundle
  capabilityKeys: ReadonlySet<string>
  provisioner?: AppObjectProvisioner
}): Promise<InstalledApp> {
  const parsed = parseManifest(options.bundle.manifest)
  if (!parsed.ok || !parsed.manifest) throw new AppError(`invalid manifest: ${parsed.errors.join('; ')}`)
  const manifest = parsed.manifest
  const bundleValidation = validateBundle(manifest, options.bundle.files.map((file) => file.path))
  if (!bundleValidation.ok) throw new AppError(`invalid bundle: ${bundleValidation.errors.join('; ')}`)
  const unknownCapabilities = manifest.permissions.filter((permission) => !options.capabilityKeys.has(permission))
  if (unknownCapabilities.length) throw new AppError(`unknown capabilities: ${unknownCapabilities.join(', ')}`)
  const requested = new Set(manifest.permissions)
  const granted = [...new Set(options.bundle.grantedPermissions ?? manifest.permissions)].filter((permission) => requested.has(permission))
  const parsedObjects = parseAppObjects(options.bundle.files)
  if (parsedObjects.errors.length) throw new AppError(`invalid objects: ${parsedObjects.errors.join('; ')}`)
  if (options.provisioner) {
    const errors = await options.provisioner.validate(parsedObjects.objects)
    if (errors.length) throw new AppError(`invalid objects: ${errors.join('; ')}`)
  } else if (parsedObjects.objects.length) {
    throw new AppError('bundle declares objects but no object provisioner was supplied')
  }
  const files = options.bundle.files.map((file) => ({
    ...file,
    kind: bundleValidation.kinds[file.path]!,
    contentType: contentTypeFor(file.path).contentType,
  }))
  return options.store.installBundle({
    tenantId: options.tenantId,
    actorId: options.actorId,
    manifest,
    grantedPermissions: granted,
    files,
    objects: parsedObjects.objects,
    provisioner: options.provisioner,
  })
}

export async function installFromListing(options: {
  store: AppStore
  tenantId: string
  actorId: string
  listingId: string
  capabilityKeys: ReadonlySet<string>
  grantedPermissions?: string[]
  provisioner?: AppObjectProvisioner
}): Promise<InstalledApp> {
  const listing = await options.store.getListing(options.listingId)
  if (!listing || !listing.isActive) throw new AppError('listing not found', 404)
  return installApp({
    store: options.store,
    tenantId: options.tenantId,
    actorId: options.actorId,
    capabilityKeys: options.capabilityKeys,
    provisioner: options.provisioner,
    bundle: { manifest: listing.manifest, files: listing.files, grantedPermissions: options.grantedPermissions },
  })
}

export async function getFrontendBundle(store: AppStore, tenantId: string, key: string): Promise<{
  entry: string
  entryHtml: string
  replacements: Record<string, string>
}> {
  const app = await requireRunnableApp(store, tenantId, key)
  const files = await store.listFiles(tenantId, key)
  const entry = app.manifest!.frontend.entry
  const entryFile = files.find((file) => file.path === entry)
  if (!entryFile) throw new AppError('frontend entry missing from bundle', 500)
  const replacements: Record<string, string> = {}
  for (const file of files) {
    if (file.path === entry || file.kind === 'backend' || file.kind === 'object') continue
    const mediaType = file.contentType.replace(/;\s*/g, ';')
    const base64 = file.isBinary ? file.content : textToBase64(file.content)
    replacements[file.path] = `data:${mediaType};base64,${base64}`
  }
  return { entry, entryHtml: entryFile.content, replacements }
}

export async function runBridgeMethod(options: {
  store: AppStore
  adapters: AppRuntimeAdapters
  tenantId: string
  key: string
  user: AppUser
  method: string
  payload: unknown
}): Promise<{ ok: true; result: unknown } | { ok: false; error: string; status: number }> {
  const app = await options.store.getApp(options.tenantId, options.key)
  if (!app || !app.manifest || !app.activeVersionId) return { ok: false, error: 'app not found', status: 404 }
  if (app.status !== 'installed') return { ok: false, error: 'app is disabled', status: 403 }
  const payload = isRecord(options.payload) ? options.payload : {}
  const granted = new Set(app.grantedPermissions.filter((permission) => options.adapters.userCan(options.user, permission)))

  if (options.method === 'records.list' || options.method === 'records.get') {
    const capability = 'records.read'
    if (!granted.has(capability) || !options.adapters.records) return { ok: false, error: `${capability} not granted`, status: 403 }
    const records = options.adapters.records(options.tenantId, options.user)
    const result = options.method === 'records.list'
      ? await records.list(String(payload.typeKey ?? ''), isRecord(payload.filters) ? payload.filters : {})
      : await records.get(String(payload.typeKey ?? ''), String(payload.id ?? ''))
    return { ok: true, result }
  }

  if (options.method !== 'callBackend') return { ok: false, error: `unknown bridge method: ${options.method}`, status: 400 }
  const endpointName = String(payload.endpoint ?? '')
  const endpoint = app.manifest.endpoints.find((candidate) => candidate.name === endpointName)
  if (!endpoint) return { ok: false, error: `no such endpoint: ${endpointName}`, status: 404 }
  const source = await options.store.readFile(options.tenantId, options.key, endpoint.file)
  if (!source || source.kind !== 'backend') return { ok: false, error: 'endpoint source missing', status: 500 }
  const records = granted.has('records.read') && options.adapters.records
    ? options.adapters.records(options.tenantId, options.user)
    : undefined
  const functions = options.adapters.functions?.({ tenantId: options.tenantId, app, user: options.user, granted })
  const run = await runEndpoint({
    source: source.content,
    request: {
      method: endpoint.method === 'ANY' ? 'POST' : endpoint.method,
      endpoint: endpoint.name,
      query: {},
      body: payload.payload ?? null,
      user: options.user,
    },
    adapters: { storage: options.store.storage(options.tenantId, app.id), ...(records ? { records } : {}), ...(functions ? { functions } : {}) },
    globalName: options.adapters.hostGlobalName ?? 'appkit',
  })
  await options.store.recordRun({
    tenantId: options.tenantId,
    appId: app.id,
    versionId: app.activeVersionId,
    endpoint: endpoint.name,
    status: run.status,
    units: run.units,
    logs: run.logs,
    errorMessage: run.error ?? null,
    durationMs: run.durationMs,
    actorId: options.user.id,
    at: new Date(),
  })
  if (run.status !== 'ok') return { ok: false, error: run.error ?? run.status, status: run.status === 'forbidden' ? 403 : run.status === 'timeout' ? 504 : 400 }
  return { ok: true, result: run.response }
}

export async function createAppScaffold(options: {
  store: AppStore
  tenantId: string
  actorId: string
  name: string
  capabilityKeys: ReadonlySet<string>
}): Promise<InstalledApp> {
  const name = options.name.trim()
  if (!name) throw new AppError('app name is required')
  const key = slugify(name)
  const manifest: AppManifest = {
    key,
    name,
    version: '0.1.0',
    description: '',
    icon: 'box',
    permissions: [],
    frontend: { entry: 'frontend/index.html' },
    endpoints: [{ name: 'hello', file: 'backend/hello.js', method: 'POST' }],
    nav: { show: true, label: name, icon: 'box' },
  }
  return installApp({
    store: options.store,
    tenantId: options.tenantId,
    actorId: options.actorId,
    capabilityKeys: options.capabilityKeys,
    bundle: {
      manifest,
      files: [
        { path: 'frontend/index.html', content: scaffoldHtml(name) },
        { path: 'frontend/styles.css', content: SCAFFOLD_CSS },
        { path: 'backend/hello.js', content: SCAFFOLD_BACKEND },
      ],
    },
  })
}

async function requireRunnableApp(store: AppStore, tenantId: string, key: string): Promise<InstalledApp> {
  const app = await store.getApp(tenantId, key)
  if (!app) throw new AppError('app not found', 404)
  if (app.status !== 'installed') throw new AppError('app is disabled', 403)
  if (!app.activeVersionId || !app.manifest) throw new AppError('app has no active version', 409)
  return app
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return /^[a-z]/.test(slug) ? slug : `app-${slug || 'untitled'}`
}

function scaffoldHtml(name: string): string {
  const title = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="frontend/styles.css"></head><body><main><p class="eyebrow">APPKIT APP</p><h1>${title}</h1><p id="who">Loading context…</p><button id="ping">Call backend</button><pre id="out">Ready.</pre></main><script>var who=document.getElementById('who'),out=document.getElementById('out');appkit.getContext().then(function(c){who.textContent=c.user?'Signed in as '+c.user.name:'Running without a signed-in user';});document.getElementById('ping').addEventListener('click',function(){out.textContent='Running…';appkit.callBackend('hello',{at:new Date().toISOString()}).then(function(r){out.textContent=JSON.stringify(r.body,null,2);}).catch(function(e){out.textContent=e.message;});});</script></body></html>`
}

const SCAFFOLD_CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText;font-family:ui-sans-serif,system-ui,sans-serif}main{max-width:42rem;margin:0 auto;padding:clamp(2rem,8vw,6rem) 1.5rem}.eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.14em;color:GrayText}h1{font-size:clamp(2rem,7vw,4.5rem);letter-spacing:-.05em;margin:.5rem 0 1rem}button{border:1px solid ButtonBorder;border-radius:.65rem;background:ButtonFace;color:ButtonText;padding:.7rem 1rem;font:inherit;font-weight:650;cursor:pointer}pre{margin-top:1rem;border:1px solid GrayText;border-radius:.8rem;padding:1rem;min-height:6rem;overflow:auto}`
const SCAFFOLD_BACKEND = `function handler(request){appkit.log('hello',request.user&&request.user.id);return {message:'Backend execution is isolated and governed.',received:request.body};}`

function textToBase64(value: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64')
  return btoa(unescape(encodeURIComponent(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export type { AppBundle, AppBundleFile } from './bundle'
export { parseZipBundle, AppBundleError } from './bundle'
export type { AppManifest, AppEndpoint } from './manifest'
export { parseManifest, validateBundle, contentTypeFor, manifestSchema, endpointSchema, HTTP_METHODS } from './manifest'
export type { AppObjectSpec, ParsedAppObjects } from './objects'
export { parseAppObjects } from './objects'
export * from './bridge'
