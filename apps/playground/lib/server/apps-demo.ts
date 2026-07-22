import 'server-only'
import {
  createAppScaffold,
  installApp,
  parseZipBundle,
  runBridgeMethod,
  updateApp,
  type AppMetaUpdate,
  type AppStatus,
  type AppStore,
  type InstalledApp,
} from '@appkit/apps'
import { createMemoryAppStore } from '@appkit/apps/memory'

const TENANT_ID = '00000000-0000-0000-0000-000000000010'
const USER_ID = '00000000-0000-0000-0000-000000000020'
export const APP_CAPABILITIES = [
  { key: 'records.read', label: 'Read records', description: 'Read application-approved records through the tenant-scoped records adapter.' },
  { key: 'records.write', label: 'Write records', description: 'Call application-supplied governed record mutation functions.' },
  { key: 'notifications.send', label: 'Send notifications', description: 'Dispatch notifications through an application-owned delivery adapter.' },
] as const
const CAPABILITY_KEYS = new Set(APP_CAPABILITIES.map((capability) => capability.key))

interface DemoState { store: AppStore; ready: Promise<void> }
const processState = globalThis as typeof globalThis & { __appkitAppsDemo?: DemoState }

function state(): DemoState {
  if (processState.__appkitAppsDemo) return processState.__appkitAppsDemo
  const store = createMemoryAppStore()
  const ready = seed(store)
  processState.__appkitAppsDemo = { store, ready }
  return processState.__appkitAppsDemo
}

async function seed(store: AppStore): Promise<void> {
  const app = await createAppScaffold({ store, tenantId: TENANT_ID, actorId: USER_ID, name: 'Operations console', capabilityKeys: CAPABILITY_KEYS })
  await store.updateMeta(TENANT_ID, USER_ID, app.key, {
    description: 'A sandboxed application with an editable frontend, governed backend, storage, permissions, and run history.',
    version: '1.0.0',
    requestedPermissions: ['records.read'],
    grantedPermissions: ['records.read'],
  })
  await store.writeFile(TENANT_ID, USER_ID, app.key, {
    path: 'frontend/index.html',
    content: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="frontend/styles.css"></head><body><main><p class="eyebrow">LIVE APP BUNDLE</p><h1>Operations console</h1><p id="identity">Loading sandbox context…</p><div class="card"><span>Governed calls</span><strong id="count">—</strong><button id="run">Run backend</button></div><pre id="output">The frontend has no direct network access.</pre></main><script>var output=document.getElementById('output'),count=document.getElementById('count');appkit.getContext().then(function(ctx){document.getElementById('identity').textContent='Running for '+ctx.user.name+' in an opaque-origin iframe.';});document.getElementById('run').addEventListener('click',function(){output.textContent='Running in QuickJS…';appkit.callBackend('hello',{source:'preview'}).then(function(response){count.textContent=String(response.body.count);output.textContent=JSON.stringify(response.body,null,2);}).catch(function(error){output.textContent=error.message;});});</script></body></html>`,
  })
  await store.writeFile(TENANT_ID, USER_ID, app.key, {
    path: 'frontend/styles.css',
    content: `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText;font-family:ui-sans-serif,system-ui,sans-serif}main{max-width:52rem;margin:auto;padding:clamp(2rem,7vw,5rem) 1.5rem}.eyebrow{color:GrayText;font-size:.7rem;font-weight:800;letter-spacing:.15em}h1{margin:.5rem 0;font-size:clamp(2.2rem,7vw,5rem);letter-spacing:-.06em;line-height:.95}.card{display:grid;grid-template-columns:1fr auto;gap:.8rem;align-items:center;margin-top:2rem;border:1px solid GrayText;border-radius:1rem;padding:1.2rem}.card strong{font-size:2rem}.card button{grid-column:1/-1;border:1px solid ButtonBorder;border-radius:.7rem;background:ButtonFace;color:ButtonText;padding:.7rem;font:inherit;font-weight:700;cursor:pointer}pre{min-height:7rem;overflow:auto;border-radius:.8rem;background:Field;color:FieldText;padding:1rem;font-size:.78rem}`,
  })
  await store.writeFile(TENANT_ID, USER_ID, app.key, {
    path: 'backend/hello.js',
    content: `function handler(request){var count=appkit.storage.get('runs')||0;count+=1;appkit.storage.set('runs',count);appkit.log('governed call',count,request.user&&request.user.id);return {count:count,message:'Executed in QuickJS with no ambient host access.',received:request.body};}`,
  })
}

export async function appsSnapshot() {
  const current = state()
  await current.ready
  const apps = await current.store.listApps(TENANT_ID)
  const files = Object.fromEntries(await Promise.all(apps.map(async (app) => [app.id, await current.store.listFiles(TENANT_ID, app.key)] as const)))
  const runs = Object.fromEntries(await Promise.all(apps.map(async (app) => [app.id, await current.store.listRuns(TENANT_ID, app.id)] as const)))
  const library = await current.store.listListings({ page: 1, perPage: 50 })
  return { apps, files, runs, listings: library.listings }
}

export async function createDemoApp(name: string) {
  const current = state(); await current.ready
  await createAppScaffold({ store: current.store, tenantId: TENANT_ID, actorId: USER_ID, name, capabilityKeys: CAPABILITY_KEYS })
}

export async function importDemoApp(bytes: Uint8Array) {
  const current = state(); await current.ready
  await installApp({ store: current.store, tenantId: TENANT_ID, actorId: USER_ID, bundle: parseZipBundle(bytes), capabilityKeys: CAPABILITY_KEYS })
}

export async function updateDemoApp(key: string, update: AppMetaUpdate) { const current = state(); await current.ready; await updateApp({ store: current.store, tenantId: TENANT_ID, actorId: USER_ID, key, update, capabilityKeys: CAPABILITY_KEYS }) }
export async function saveDemoAppFile(key: string, file: { path: string; content: string; isBinary?: boolean }) { const current = state(); await current.ready; await current.store.writeFile(TENANT_ID, USER_ID, key, file) }
export async function deleteDemoAppFile(key: string, path: string) { const current = state(); await current.ready; await current.store.deleteFile(TENANT_ID, key, path) }
export async function setDemoAppStatus(key: string, status: AppStatus) { const current = state(); await current.ready; await current.store.setStatus(TENANT_ID, key, status) }
export async function deleteDemoApp(key: string) { const current = state(); await current.ready; await current.store.deleteApp(TENANT_ID, key) }
export async function publishDemoApp(key: string) { const current = state(); await current.ready; await current.store.publish(TENANT_ID, USER_ID, key) }

export async function bridgeDemoApp(app: InstalledApp, method: string, payload: unknown) {
  const current = state(); await current.ready
  return runBridgeMethod({
    store: current.store,
    tenantId: TENANT_ID,
    key: app.key,
    user: { id: USER_ID, name: 'Jordan Lee', role: 'builder' },
    method,
    payload,
    adapters: {
      capabilityKeys: CAPABILITY_KEYS,
      userCan: () => true,
      records: () => ({
        async list(typeKey) { return [{ id: 'record-1', typeKey, name: 'North Tower', status: 'active' }, { id: 'record-2', typeKey, name: 'West Campus', status: 'draft' }] },
        async get(typeKey, id) { return { id, typeKey, name: 'North Tower', status: 'active' } },
      }),
    },
  })
}
