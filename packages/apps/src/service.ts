import {
  createAppScaffold,
  getFrontendBundle,
  installApp,
  installFromListing,
  runBridgeMethod,
  updateApp,
  type AppBundle,
  type AppMetaUpdate,
  type AppObjectProvisioner,
  type AppRuntimeAdapters,
  type AppStatus,
  type AppStore,
  type AppUser,
} from './index'

export interface AppBridgeInvocation {
  key: string
  user: AppUser
  method: string
  payload: unknown
  userCan: (permission: string) => boolean
}

export interface BoundAppServiceOptions<TBridge extends AppBridgeInvocation> {
  store: AppStore
  capabilityKeys: ReadonlySet<string>
  /** Resolve the package tenant key from an application's existing bridge request. */
  tenantId: (input: TBridge) => string
  /** Supply deployment-owned records, writes, globals, and authorization adapters. */
  runtime: (input: TBridge) => Omit<AppRuntimeAdapters, 'capabilityKeys' | 'userCan'>
  provisioner?: AppObjectProvisioner
}

/**
 * Bind the complete installable-app lifecycle to application-owned adapters.
 * Method signatures deliberately remain positional so existing routes can
 * replace their store import with one configured service export.
 */
export function createBoundAppService<TBridge extends AppBridgeInvocation>(options: BoundAppServiceOptions<TBridge>) {
  return {
    listApps: (tenantId: string) => options.store.listApps(tenantId),
    getAppByKey: (tenantId: string, key: string) => options.store.getApp(tenantId, key),
    async installApp(tenantId: string, actorId: string, bundle: AppBundle) {
      const app = await installApp({ store: options.store, tenantId, actorId, bundle, capabilityKeys: options.capabilityKeys, provisioner: options.provisioner })
      return { key: app.key }
    },
    setAppStatus: (tenantId: string, key: string, status: AppStatus) => options.store.setStatus(tenantId, key, status),
    deleteApp: (tenantId: string, key: string) => options.store.deleteApp(tenantId, key),
    getFrontendBundle: (tenantId: string, key: string) => getFrontendBundle(options.store, tenantId, key),
    runBridgeMethod: (input: TBridge) => runBridgeMethod({
      store: options.store,
      tenantId: options.tenantId(input),
      key: input.key,
      user: input.user,
      method: input.method,
      payload: input.payload,
      adapters: {
        ...options.runtime(input),
        capabilityKeys: options.capabilityKeys,
        userCan: (_user, permission) => input.userCan(permission),
      },
    }),
    async createAppScaffold(tenantId: string, actorId: string, name: string) {
      const app = await createAppScaffold({ store: options.store, tenantId, actorId, name, capabilityKeys: options.capabilityKeys })
      return { key: app.key }
    },
    updateAppMeta: (tenantId: string, actorId: string, key: string, update: AppMetaUpdate) => updateApp({ store: options.store, tenantId, actorId, key, update, capabilityKeys: options.capabilityKeys }),
    listAppFiles: (tenantId: string, key: string) => options.store.listFiles(tenantId, key),
    readAppFile: (tenantId: string, key: string, path: string) => options.store.readFile(tenantId, key, path),
    writeAppFile: (tenantId: string, actorId: string, key: string, path: string, content: string, isBinary = false) => options.store.writeFile(tenantId, actorId, key, { path, content, isBinary }),
    deleteAppFile: (tenantId: string, key: string, path: string) => options.store.deleteFile(tenantId, key, path),
    listListings: (input: { query?: string; page: number; perPage: number }) => options.store.listListings(input),
    async isAppPublished(key: string) { return Boolean((await options.store.listListings({ query: key, page: 1, perPage: 100 })).listings.find((listing) => listing.key === key)) },
    async publishApp(tenantId: string, actorId: string, key: string) { return { id: (await options.store.publish(tenantId, actorId, key)).id } },
    async installFromListing(tenantId: string, actorId: string, listingId: string) {
      const app = await installFromListing({ store: options.store, tenantId, actorId, listingId, capabilityKeys: options.capabilityKeys, provisioner: options.provisioner })
      return { key: app.key }
    },
  }
}
