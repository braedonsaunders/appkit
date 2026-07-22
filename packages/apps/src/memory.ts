import type { StorageAdapter } from '@appkit/endpoints'
import { AppError, type AppFile, type AppListing, type AppMetaUpdate, type AppRun, type AppStatus, type AppStore, type AppVersion, type InstalledApp, type PersistInstallInput } from './index'
import { contentTypeFor, parseManifest } from './manifest'

interface MemoryState {
  apps: Map<string, InstalledApp>
  versions: Map<string, AppVersion>
  files: Map<string, AppFile>
  storage: Map<string, unknown>
  runs: AppRun[]
  listings: Map<string, AppListing>
}

export function createMemoryAppStore(seed?: { apps?: InstalledApp[]; versions?: AppVersion[]; files?: AppFile[]; runs?: AppRun[]; listings?: AppListing[] }): AppStore {
  const state: MemoryState = {
    apps: new Map((seed?.apps ?? []).map((app) => [appIdentity(app.tenantId, app.key), clone(app)])),
    versions: new Map((seed?.versions ?? []).map((version) => [version.id, clone(version)])),
    files: new Map((seed?.files ?? []).map((file) => [fileIdentity(file.versionId, file.path), clone(file)])),
    storage: new Map(),
    runs: (seed?.runs ?? []).map(clone),
    listings: new Map((seed?.listings ?? []).map((listing) => [listing.id, clone(listing)])),
  }

  const store: AppStore = {
    async listApps(tenantId) {
      return [...state.apps.values()].filter((app) => app.tenantId === tenantId).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)).map(clone)
    },
    async getApp(tenantId, key) { return optionalClone(state.apps.get(appIdentity(tenantId, key))) },
    async installBundle(input) { return installMemory(state, input) },
    async setStatus(tenantId, key, status) {
      const app = requireApp(state, tenantId, key)
      app.status = status
    },
    async deleteApp(tenantId, key) {
      const app = requireApp(state, tenantId, key)
      state.apps.delete(appIdentity(tenantId, key))
      const versionIds = [...state.versions.values()].filter((version) => version.appId === app.id).map((version) => version.id)
      for (const id of versionIds) state.versions.delete(id)
      for (const [identity, file] of state.files) if (file.appId === app.id) state.files.delete(identity)
      for (const identity of state.storage.keys()) if (identity.startsWith(`${app.id}\0`)) state.storage.delete(identity)
      state.runs = state.runs.filter((run) => run.appId !== app.id)
    },
    async updateMeta(tenantId, _actorId, key, update) { updateMemoryMeta(state, tenantId, key, update) },
    async listFiles(tenantId, key) {
      const app = requireActiveApp(state, tenantId, key)
      return [...state.files.values()].filter((file) => file.versionId === app.activeVersionId).sort((left, right) => left.path.localeCompare(right.path)).map(clone)
    },
    async readFile(tenantId, key, path) {
      const app = requireActiveApp(state, tenantId, key)
      return optionalClone(state.files.get(fileIdentity(app.activeVersionId!, path)))
    },
    async writeFile(tenantId, _actorId, key, file) { writeMemoryFile(state, tenantId, key, file) },
    async deleteFile(tenantId, key, path) {
      const app = requireActiveApp(state, tenantId, key)
      if (app.manifest!.frontend.entry === path) throw new AppError('cannot delete the frontend entry file', 409)
      const endpoint = app.manifest!.endpoints.find((candidate) => candidate.file === path)
      if (endpoint) throw new AppError(`cannot delete: endpoint "${endpoint.name}" uses this file`, 409)
      state.files.delete(fileIdentity(app.activeVersionId!, path))
    },
    storage(tenantId, appId) { return memoryStorage(state, tenantId, appId) },
    async recordRun(run) { state.runs.push({ ...clone(run), id: run.id ?? id() }) },
    async listRuns(tenantId, appId, limit = 100) {
      return state.runs.filter((run) => run.tenantId === tenantId && run.appId === appId).sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, limit).map(clone)
    },
    async listListings({ query = '', page, perPage }) {
      const normalized = query.trim().toLowerCase()
      const all = [...state.listings.values()].filter((listing) => listing.isActive && (!normalized || `${listing.name} ${listing.key} ${listing.description ?? ''}`.toLowerCase().includes(normalized))).sort((left, right) => left.name.localeCompare(right.name))
      return { listings: all.slice((page - 1) * perPage, page * perPage).map(clone), total: all.length }
    },
    async publish(tenantId, _actorId, key) {
      const app = requireActiveApp(state, tenantId, key)
      const collision = [...state.listings.values()].find((listing) => listing.key === key && listing.publisherTenantId !== tenantId)
      if (collision) throw new AppError(`"${key}" is already published by another tenant`, 409)
      const existing = [...state.listings.values()].find((listing) => listing.key === key)
      const listing: AppListing = {
        id: existing?.id ?? id(),
        publisherTenantId: tenantId,
        key,
        name: app.name,
        description: app.description,
        iconKey: app.iconKey,
        version: app.version!,
        manifest: clone(app.manifest!),
        files: [...state.files.values()].filter((file) => file.versionId === app.activeVersionId).map(({ path, content, isBinary }) => ({ path, content, isBinary })),
        isActive: true,
        updatedAt: new Date(),
      }
      state.listings.set(listing.id, listing)
      return clone(listing)
    },
    async getListing(listingId) { return optionalClone(state.listings.get(listingId)) },
  }
  return store
}

async function installMemory(state: MemoryState, input: PersistInstallInput): Promise<InstalledApp> {
  const identity = appIdentity(input.tenantId, input.manifest.key)
  const current = state.apps.get(identity)
  const appId = current?.id ?? id()
  if ([...state.versions.values()].some((version) => version.appId === appId && version.version === input.manifest.version)) {
    throw new AppError(`version ${input.manifest.version} already exists for this app`, 409)
  }
  const versionId = id()
  const previouslyOwned = current?.provisionedObjects ?? []
  const provisionedObjects = input.provisioner
    ? await input.provisioner.provision({ tenantId: input.tenantId, appId, objects: input.objects, previouslyOwned, transaction: { kind: 'memory', state } })
    : []
  for (const version of state.versions.values()) if (version.appId === appId && version.status === 'active') version.status = 'superseded'
  const version: AppVersion = { id: versionId, tenantId: input.tenantId, appId, version: input.manifest.version, manifest: clone(input.manifest), status: 'active', createdAt: new Date() }
  state.versions.set(versionId, version)
  for (const file of input.files) {
    const stored: AppFile = {
      id: id(), tenantId: input.tenantId, appId, versionId, path: file.path, kind: file.kind,
      contentType: file.contentType, content: file.content, isBinary: Boolean(file.isBinary), size: file.content.length,
    }
    state.files.set(fileIdentity(versionId, file.path), stored)
  }
  const app: InstalledApp = {
    id: appId,
    tenantId: input.tenantId,
    key: input.manifest.key,
    name: input.manifest.name,
    description: input.manifest.description ?? null,
    iconKey: input.manifest.icon ?? 'box',
    status: 'installed',
    activeVersionId: versionId,
    grantedPermissions: [...input.grantedPermissions],
    showInNav: input.manifest.nav?.show ?? true,
    sortOrder: current?.sortOrder ?? 0,
    provisionedObjects,
    version: input.manifest.version,
    manifest: clone(input.manifest),
  }
  state.apps.set(identity, app)
  return clone(app)
}

function updateMemoryMeta(state: MemoryState, tenantId: string, key: string, update: AppMetaUpdate): void {
  const app = requireActiveApp(state, tenantId, key)
  const version = state.versions.get(app.activeVersionId!)!
  const manifest = clone(version.manifest)
  if (update.name !== undefined) { app.name = update.name; manifest.name = update.name }
  if (update.description !== undefined) { app.description = update.description; manifest.description = update.description ?? undefined }
  if (update.iconKey !== undefined) { app.iconKey = update.iconKey; manifest.icon = update.iconKey }
  if (update.requestedPermissions !== undefined) manifest.permissions = [...new Set(update.requestedPermissions)]
  if (update.grantedPermissions !== undefined) app.grantedPermissions = update.grantedPermissions.filter((permission) => manifest.permissions.includes(permission))
  else if (update.requestedPermissions !== undefined) app.grantedPermissions = app.grantedPermissions.filter((permission) => manifest.permissions.includes(permission))
  if (update.showInNav !== undefined) { app.showInNav = update.showInNav; manifest.nav = { ...manifest.nav, show: update.showInNav } }
  if (update.sortOrder !== undefined) app.sortOrder = update.sortOrder
  if (update.version !== undefined) { version.version = update.version; manifest.version = update.version; app.version = update.version }
  if (update.frontendEntry !== undefined) manifest.frontend.entry = update.frontendEntry
  if (update.endpoints !== undefined) manifest.endpoints = clone(update.endpoints)
  const parsed = parseManifest(manifest)
  if (!parsed.ok || !parsed.manifest) throw new AppError(`invalid manifest: ${parsed.errors.join('; ')}`)
  version.manifest = parsed.manifest
  app.manifest = clone(parsed.manifest)
}

function writeMemoryFile(state: MemoryState, tenantId: string, key: string, file: { path: string; content: string; isBinary?: boolean }): void {
  const app = requireActiveApp(state, tenantId, key)
  if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9._\-/]+$/i.test(file.path)) throw new AppError('invalid file path')
  if (file.content.length > 2 * 1024 * 1024) throw new AppError('file too large (max 2 MB)')
  const endpointFiles = new Set(app.manifest!.endpoints.map((endpoint) => endpoint.file))
  const kind = endpointFiles.has(file.path) ? 'backend' : file.path.startsWith('objects/') ? 'object' : file.path === app.manifest!.frontend.entry || file.path.startsWith('frontend/') ? 'frontend' : 'asset'
  const { contentType } = contentTypeFor(file.path)
  const identity = fileIdentity(app.activeVersionId!, file.path)
  const existing = state.files.get(identity)
  state.files.set(identity, {
    id: existing?.id ?? id(), tenantId, appId: app.id, versionId: app.activeVersionId!, path: file.path,
    kind, contentType, content: file.content, isBinary: Boolean(file.isBinary), size: file.content.length,
  })
}

function memoryStorage(state: MemoryState, tenantId: string, appId: string): StorageAdapter {
  const prefix = `${appId}\0${tenantId}\0`
  const identity = (namespace: string, key: string) => `${prefix}${namespace}\0${key}`
  return {
    async get(key, namespace) { return state.storage.has(identity(namespace, key)) ? clone(state.storage.get(identity(namespace, key))) : null },
    async set(key, value, namespace) { state.storage.set(identity(namespace, key), clone(value)) },
    async list(searchPrefix, namespace) {
      const scope = `${prefix}${namespace}\0`
      return [...state.storage.entries()].filter(([key]) => key.startsWith(scope) && key.slice(scope.length).startsWith(searchPrefix)).slice(0, 500).map(([key, value]) => ({ key: key.slice(scope.length), value: clone(value) }))
    },
    async delete(key, namespace) { state.storage.delete(identity(namespace, key)) },
  }
}

function requireApp(state: MemoryState, tenantId: string, key: string): InstalledApp {
  const app = state.apps.get(appIdentity(tenantId, key))
  if (!app) throw new AppError('app not found', 404)
  return app
}

function requireActiveApp(state: MemoryState, tenantId: string, key: string): InstalledApp {
  const app = requireApp(state, tenantId, key)
  if (!app.activeVersionId || !app.manifest) throw new AppError('app has no active version', 409)
  return app
}

function appIdentity(tenantId: string, key: string): string { return `${tenantId}\0${key}` }
function fileIdentity(versionId: string, path: string): string { return `${versionId}\0${path}` }
function id(): string { return globalThis.crypto.randomUUID() }
function clone<T>(value: T): T { return structuredClone(value) }
function optionalClone<T>(value: T | undefined): T | null { return value === undefined ? null : clone(value) }

export type { AppStatus }
