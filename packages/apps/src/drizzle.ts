import { and, asc, count, desc, eq, ilike, like, or } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { AppError, type AppFile, type AppListing, type AppMetaUpdate, type AppRun, type AppStore, type InstalledApp } from './index'
import { contentTypeFor, parseManifest } from './manifest'
import { appFiles, appListings, appRuns, apps, appStorage, appVersions } from './schema'

type Db = NodePgDatabase<Record<string, never>>

export function createDrizzleAppStore(db: Db): AppStore {
  return {
    async listApps(tenantId) {
      const rows = await db.select({ app: apps, version: appVersions }).from(apps).leftJoin(appVersions, eq(apps.activeVersionId, appVersions.id)).where(eq(apps.tenantId, tenantId)).orderBy(asc(apps.sortOrder), asc(apps.name))
      return rows.map(({ app, version }) => toInstalled(app, version))
    },
    async getApp(tenantId, key) { return getApp(db, tenantId, key) },
    async installBundle(input) {
      return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(apps).where(and(eq(apps.tenantId, input.tenantId), eq(apps.key, input.manifest.key))).limit(1)
        const appValues = {
          tenantId: input.tenantId,
          key: input.manifest.key,
          name: input.manifest.name,
          description: input.manifest.description ?? null,
          iconKey: input.manifest.icon ?? 'box',
          status: 'installed' as const,
          grantedPermissions: input.grantedPermissions,
          showInNav: input.manifest.nav?.show ?? true,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          updatedAt: new Date(),
        }
        const [app] = existing
          ? await tx.update(apps).set(appValues).where(eq(apps.id, existing.id)).returning()
          : await tx.insert(apps).values(appValues).returning()
        if (!app) throw new AppError('app was not visible after upsert', 500)
        const [duplicate] = await tx.select({ id: appVersions.id }).from(appVersions).where(and(eq(appVersions.appId, app.id), eq(appVersions.version, input.manifest.version))).limit(1)
        if (duplicate) throw new AppError(`version ${input.manifest.version} already exists for this app`, 409)
        const [version] = await tx.insert(appVersions).values({ tenantId: input.tenantId, appId: app.id, version: input.manifest.version, manifest: input.manifest, status: 'active', createdBy: input.actorId, updatedBy: input.actorId }).returning()
        if (!version) throw new AppError('app version was not visible after insertion', 500)
        if (input.files.length) await tx.insert(appFiles).values(input.files.map((file) => ({
          tenantId: input.tenantId, appId: app.id, versionId: version.id, path: file.path, kind: file.kind,
          contentType: file.contentType, content: file.content, isBinary: Boolean(file.isBinary), size: file.content.length,
          createdBy: input.actorId, updatedBy: input.actorId,
        })))
        const provisionedObjects = input.provisioner
          ? await input.provisioner.provision({ tenantId: input.tenantId, appId: app.id, objects: input.objects, previouslyOwned: app.provisionedObjects, transaction: tx })
          : []
        await tx.update(appVersions).set({ status: 'superseded', updatedAt: new Date(), updatedBy: input.actorId }).where(and(eq(appVersions.appId, app.id), eq(appVersions.status, 'active')))
        await tx.update(appVersions).set({ status: 'active', updatedAt: new Date(), updatedBy: input.actorId }).where(eq(appVersions.id, version.id))
        await tx.update(apps).set({ activeVersionId: version.id, provisionedObjects, updatedAt: new Date(), updatedBy: input.actorId }).where(eq(apps.id, app.id))
        return {
          ...toInstalled({ ...app, activeVersionId: version.id, provisionedObjects }, { ...version, status: 'active' as const }),
        }
      })
    },
    async setStatus(tenantId, key, status) { await db.update(apps).set({ status, updatedAt: new Date() }).where(and(eq(apps.tenantId, tenantId), eq(apps.key, key))) },
    async deleteApp(tenantId, key) { await db.delete(apps).where(and(eq(apps.tenantId, tenantId), eq(apps.key, key))) },
    async updateMeta(tenantId, actorId, key, update) { await updateMeta(db, tenantId, actorId, key, update) },
    async listFiles(tenantId, key) {
      const app = await requireActive(db, tenantId, key)
      return db.select().from(appFiles).where(and(eq(appFiles.tenantId, tenantId), eq(appFiles.versionId, app.activeVersionId!))).orderBy(asc(appFiles.path))
    },
    async readFile(tenantId, key, path) {
      const app = await requireActive(db, tenantId, key)
      const [file] = await db.select().from(appFiles).where(and(eq(appFiles.tenantId, tenantId), eq(appFiles.versionId, app.activeVersionId!), eq(appFiles.path, path))).limit(1)
      return file ?? null
    },
    async writeFile(tenantId, actorId, key, file) {
      const app = await requireActive(db, tenantId, key)
      if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9._\-/]+$/i.test(file.path)) throw new AppError('invalid file path')
      if (file.content.length > 2 * 1024 * 1024) throw new AppError('file too large (max 2 MB)')
      const endpointFiles = new Set(app.manifest!.endpoints.map((endpoint) => endpoint.file))
      const kind = endpointFiles.has(file.path) ? 'backend' : file.path.startsWith('objects/') ? 'object' : file.path === app.manifest!.frontend.entry || file.path.startsWith('frontend/') ? 'frontend' : 'asset'
      const { contentType } = contentTypeFor(file.path)
      await db.insert(appFiles).values({ tenantId, appId: app.id, versionId: app.activeVersionId!, path: file.path, kind, contentType, content: file.content, isBinary: Boolean(file.isBinary), size: file.content.length, createdBy: actorId, updatedBy: actorId }).onConflictDoUpdate({
        target: [appFiles.versionId, appFiles.path],
        set: { kind, contentType, content: file.content, isBinary: Boolean(file.isBinary), size: file.content.length, updatedAt: new Date(), updatedBy: actorId },
      })
    },
    async deleteFile(tenantId, key, path) {
      const app = await requireActive(db, tenantId, key)
      if (path === app.manifest!.frontend.entry) throw new AppError('cannot delete the frontend entry file', 409)
      const endpoint = app.manifest!.endpoints.find((candidate) => candidate.file === path)
      if (endpoint) throw new AppError(`cannot delete: endpoint "${endpoint.name}" uses this file`, 409)
      await db.delete(appFiles).where(and(eq(appFiles.tenantId, tenantId), eq(appFiles.versionId, app.activeVersionId!), eq(appFiles.path, path)))
    },
    storage(tenantId, appId) { return drizzleStorage(db, tenantId, appId) },
    async recordRun(run) { await db.insert(appRuns).values(run) },
    async listRuns(tenantId, appId, limit = 100) { return db.select().from(appRuns).where(and(eq(appRuns.tenantId, tenantId), eq(appRuns.appId, appId))).orderBy(desc(appRuns.at)).limit(Math.min(Math.max(limit, 1), 500)) },
    async listListings({ query, page, perPage }) {
      const where = and(eq(appListings.isActive, true), query ? or(ilike(appListings.name, `%${query}%`), ilike(appListings.key, `%${query}%`), ilike(appListings.description, `%${query}%`)) : undefined)
      const [rows, totals] = await Promise.all([
        db.select().from(appListings).where(where).orderBy(asc(appListings.name)).limit(perPage).offset((page - 1) * perPage),
        db.select({ value: count() }).from(appListings).where(where),
      ])
      return { listings: rows.map(toListing), total: totals[0]?.value ?? 0 }
    },
    async publish(tenantId, actorId, key) {
      const app = await requireActive(db, tenantId, key)
      const [existing] = await db.select().from(appListings).where(eq(appListings.key, key)).limit(1)
      if (existing && existing.publisherTenantId !== tenantId) throw new AppError(`"${key}" is already published by another tenant`, 409)
      const files = await db.select({ path: appFiles.path, content: appFiles.content, isBinary: appFiles.isBinary }).from(appFiles).where(eq(appFiles.versionId, app.activeVersionId!)).orderBy(asc(appFiles.path))
      const values = { publisherTenantId: tenantId, key, name: app.name, description: app.description, iconKey: app.iconKey, version: app.version!, manifest: app.manifest!, files, isActive: true, createdBy: actorId, updatedBy: actorId, updatedAt: new Date() }
      const [listing] = await db.insert(appListings).values(values).onConflictDoUpdate({ target: appListings.key, set: values }).returning()
      if (!listing) throw new AppError('listing was not visible after publication', 500)
      return toListing(listing)
    },
    async getListing(listingId) {
      const [listing] = await db.select().from(appListings).where(eq(appListings.id, listingId)).limit(1)
      return listing ? toListing(listing) : null
    },
  }
}

async function getApp(db: Db, tenantId: string, key: string): Promise<InstalledApp | null> {
  const [row] = await db.select({ app: apps, version: appVersions }).from(apps).leftJoin(appVersions, eq(apps.activeVersionId, appVersions.id)).where(and(eq(apps.tenantId, tenantId), eq(apps.key, key))).limit(1)
  return row ? toInstalled(row.app, row.version) : null
}

async function requireActive(db: Db, tenantId: string, key: string): Promise<InstalledApp> {
  const app = await getApp(db, tenantId, key)
  if (!app) throw new AppError('app not found', 404)
  if (!app.activeVersionId || !app.manifest) throw new AppError('app has no active version', 409)
  return app
}

async function updateMeta(db: Db, tenantId: string, actorId: string, key: string, update: AppMetaUpdate): Promise<void> {
  const app = await requireActive(db, tenantId, key)
  const manifest = structuredClone(app.manifest!)
  const appSet: Partial<typeof apps.$inferInsert> = { updatedAt: new Date(), updatedBy: actorId }
  if (update.name !== undefined) { appSet.name = update.name; manifest.name = update.name }
  if (update.description !== undefined) { appSet.description = update.description; manifest.description = update.description ?? undefined }
  if (update.iconKey !== undefined) { appSet.iconKey = update.iconKey; manifest.icon = update.iconKey }
  if (update.requestedPermissions !== undefined) manifest.permissions = [...new Set(update.requestedPermissions)]
  if (update.grantedPermissions !== undefined) appSet.grantedPermissions = update.grantedPermissions.filter((permission) => manifest.permissions.includes(permission))
  else if (update.requestedPermissions !== undefined) appSet.grantedPermissions = app.grantedPermissions.filter((permission) => manifest.permissions.includes(permission))
  if (update.showInNav !== undefined) { appSet.showInNav = update.showInNav; manifest.nav = { ...manifest.nav, show: update.showInNav } }
  if (update.sortOrder !== undefined) appSet.sortOrder = update.sortOrder
  if (update.frontendEntry !== undefined) manifest.frontend.entry = update.frontendEntry
  if (update.endpoints !== undefined) manifest.endpoints = update.endpoints
  if (update.version !== undefined) manifest.version = update.version
  const parsed = parseManifest(manifest)
  if (!parsed.ok || !parsed.manifest) throw new AppError(`invalid manifest: ${parsed.errors.join('; ')}`)
  await db.transaction(async (tx) => {
    await tx.update(apps).set(appSet).where(eq(apps.id, app.id))
    await tx.update(appVersions).set({ manifest: parsed.manifest, ...(update.version !== undefined ? { version: update.version } : {}), updatedAt: new Date(), updatedBy: actorId }).where(eq(appVersions.id, app.activeVersionId!))
  })
}

function drizzleStorage(db: Db, tenantId: string, appId: string) {
  return {
    async get(key: string, namespace: string) {
      const [row] = await db.select({ value: appStorage.value }).from(appStorage).where(and(eq(appStorage.tenantId, tenantId), eq(appStorage.appId, appId), eq(appStorage.namespace, namespace), eq(appStorage.key, key))).limit(1)
      return row?.value ?? null
    },
    async set(key: string, value: unknown, namespace: string) {
      await db.insert(appStorage).values({ tenantId, appId, namespace, key, value }).onConflictDoUpdate({ target: [appStorage.appId, appStorage.namespace, appStorage.key], set: { value, updatedAt: new Date() } })
    },
    async list(prefix: string, namespace: string) {
      return db.select({ key: appStorage.key, value: appStorage.value }).from(appStorage).where(and(eq(appStorage.tenantId, tenantId), eq(appStorage.appId, appId), eq(appStorage.namespace, namespace), like(appStorage.key, `${escapeLike(prefix)}%`))).orderBy(asc(appStorage.key)).limit(500)
    },
    async delete(key: string, namespace: string) { await db.delete(appStorage).where(and(eq(appStorage.tenantId, tenantId), eq(appStorage.appId, appId), eq(appStorage.namespace, namespace), eq(appStorage.key, key))) },
  }
}

function toInstalled(app: typeof apps.$inferSelect, version: typeof appVersions.$inferSelect | null): InstalledApp {
  return {
    id: app.id, tenantId: app.tenantId, key: app.key, name: app.name, description: app.description,
    iconKey: app.iconKey, status: app.status, activeVersionId: app.activeVersionId,
    grantedPermissions: app.grantedPermissions, showInNav: app.showInNav, sortOrder: app.sortOrder,
    provisionedObjects: app.provisionedObjects, version: version?.version ?? null, manifest: version?.manifest ?? null,
  }
}

function toListing(row: typeof appListings.$inferSelect): AppListing {
  return { id: row.id, publisherTenantId: row.publisherTenantId, key: row.key, name: row.name, description: row.description, iconKey: row.iconKey, version: row.version, manifest: row.manifest, files: row.files, isActive: row.isActive, updatedAt: row.updatedAt }
}

function escapeLike(value: string): string { return value.replace(/[%_\\]/g, (match) => `\\${match}`) }

export { apps, appVersions, appFiles, appStorage, appRuns, appListings, APP_TENANT_TABLES } from './schema'
export type { AppFile, AppRun, AppListing }
