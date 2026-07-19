import { newAsyncContext } from 'quickjs-emscripten'

/**
 * Programmable endpoints runtime. User-defined endpoint scripts run in a QuickJS
 * WASM sandbox (no Node, no filesystem, no network, no DB) with a governed host
 * API and a unit budget: every host call costs units, and a script over budget
 * is stopped. (Extracted from the openbooks apps-runtime, generalized: the host
 * global name is configurable, and the app-specific `journal` adapter is
 * replaced by generic injectable host functions.)
 *
 * Isolation via dependency injection: the runtime NEVER touches the database.
 * The caller passes `adapters` — a KV `storage` store, optional `records` reads,
 * and optional `functions` (arbitrary app host calls). The web layer wires
 * tenant/permission-scoped adapters; tests wire in-memory fakes.
 *
 * Contract: an endpoint file defines  function handler(request) { ... }
 *   request = { method, endpoint, path, query, body, user }   (deep-frozen)
 *   return  = the response body, OR { status: <int>, body: <any> }
 *
 * Host API on the global (default `app`):
 *   app.log(...)                       collect log lines
 *   app.request                        the frozen request
 *   app.storage.get/set/list/delete    the endpoint's KV store   (writes governed)
 *   app.records.list(typeKey[,filters]) / app.records.get(typeKey,id)  (if granted)
 *   app.<name>(...args)                 any injected host function (governed by its cost)
 */

export interface EndpointRequest {
  method: string
  endpoint: string
  path?: string
  query: Record<string, string>
  body: unknown
  user: { id: string; name: string; role?: string } | null
}

export interface StorageAdapter {
  get(key: string, namespace: string): Promise<unknown>
  set(key: string, value: unknown, namespace: string): Promise<void>
  list(prefix: string, namespace: string): Promise<{ key: string; value: unknown }[]>
  delete(key: string, namespace: string): Promise<void>
}

export interface RecordsAdapter {
  list(typeKey: string, filters: Record<string, unknown>): Promise<unknown[]>
  get(typeKey: string, id: string): Promise<unknown>
}

/** An injected host call, exposed as `app.<name>(...args)`. */
export interface HostFunction {
  cost: number
  handler: (args: unknown[]) => Promise<unknown> | unknown
}

export interface HostAdapters {
  storage: StorageAdapter
  /** Present only when the endpoint was granted record reads. */
  records?: RecordsAdapter
  /** Arbitrary app-specific host calls (e.g. a `postJournal`), each governed. */
  functions?: Record<string, HostFunction>
}

export interface EndpointResult {
  status: 'ok' | 'error' | 'timeout' | 'forbidden'
  response?: { status: number; body: unknown }
  error?: string
  logs: string[]
  units: number
  durationMs: number
}

/** Governance unit costs per built-in host operation. */
export const DEFAULT_COSTS = {
  log: 1,
  storageGet: 5,
  storageList: 5,
  storageSet: 10,
  storageDelete: 10,
  recordsList: 10,
  recordsGet: 5,
} as const

const DEFAULT_BUDGET = 1000
const DEFAULT_TIMEOUT_MS = 3000
const FORBIDDEN = '__APPKIT_FORBIDDEN__'
const GOVERNANCE = '__APPKIT_GOV__'
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export async function runEndpoint(opts: {
  source: string
  request: EndpointRequest
  adapters: HostAdapters
  /** The sandbox host global name. Default `app`. */
  globalName?: string
  timeoutMs?: number
  unitBudget?: number
  costs?: Partial<typeof DEFAULT_COSTS>
}): Promise<EndpointResult> {
  const g = opts.globalName ?? 'app'
  if (!IDENT.test(g)) throw new Error('globalName must be a valid identifier')
  const COST = { ...DEFAULT_COSTS, ...opts.costs }
  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 15_000)
  const budget = opts.unitBudget ?? DEFAULT_BUDGET
  const { adapters, request } = opts
  const functions = adapters.functions ?? {}
  for (const name of Object.keys(functions)) {
    if (!IDENT.test(name)) throw new Error(`host function name must be an identifier: ${name}`)
  }

  const vm = await newAsyncContext()
  const runtime = vm.runtime
  runtime.setMemoryLimit(64 * 1024 * 1024)
  runtime.setMaxStackSize(1024 * 1024)
  const deadline = Date.now() + timeoutMs
  runtime.setInterruptHandler(() => Date.now() > deadline)

  const logs: string[] = []
  let units = 0
  const started = Date.now()

  const charge = (cost: number): { error: ReturnType<typeof vm.newError> } | null => {
    units += cost
    if (units > budget) {
      return { error: vm.newError(`${GOVERNANCE}governance budget exceeded (${units}/${budget} units)`) }
    }
    return null
  }

  try {
    const hostHandle = vm.newObject()

    const logFn = vm.newFunction('log', (...args) => {
      units += COST.log
      logs.push(args.map((a) => JSON.stringify(vm.dump(a))).join(' '))
    })

    const storageGet = vm.newAsyncifiedFunction('__storage_get', async (keyH, nsH) => {
      const over = charge(COST.storageGet)
      if (over) return over
      const value = await adapters.storage.get(String(vm.dump(keyH)), String(vm.dump(nsH) ?? 'default'))
      return vm.newString(JSON.stringify(value ?? null))
    })
    const storageSet = vm.newAsyncifiedFunction('__storage_set', async (keyH, valH, nsH) => {
      const over = charge(COST.storageSet)
      if (over) return over
      const raw = vm.dump(valH)
      await adapters.storage.set(
        String(vm.dump(keyH)),
        raw === undefined ? null : JSON.parse(String(raw)),
        String(vm.dump(nsH) ?? 'default'),
      )
      return vm.undefined
    })
    const storageList = vm.newAsyncifiedFunction('__storage_list', async (prefixH, nsH) => {
      const over = charge(COST.storageList)
      if (over) return over
      const rows = await adapters.storage.list(String(vm.dump(prefixH) ?? ''), String(vm.dump(nsH) ?? 'default'))
      return vm.newString(JSON.stringify(rows))
    })
    const storageDelete = vm.newAsyncifiedFunction('__storage_delete', async (keyH, nsH) => {
      const over = charge(COST.storageDelete)
      if (over) return over
      await adapters.storage.delete(String(vm.dump(keyH)), String(vm.dump(nsH) ?? 'default'))
      return vm.undefined
    })

    const recordsList = vm.newAsyncifiedFunction('__records_list', async (typeH, filtersH) => {
      if (!adapters.records) return { error: vm.newError(`${FORBIDDEN}record reads not granted to this endpoint`) }
      const over = charge(COST.recordsList)
      if (over) return over
      const filtersRaw = vm.dump(filtersH)
      const filters = filtersRaw ? JSON.parse(String(filtersRaw)) : {}
      const rows = await adapters.records.list(String(vm.dump(typeH)), filters)
      return vm.newString(JSON.stringify(rows))
    })
    const recordsGet = vm.newAsyncifiedFunction('__records_get', async (typeH, idH) => {
      if (!adapters.records) return { error: vm.newError(`${FORBIDDEN}record reads not granted to this endpoint`) }
      const over = charge(COST.recordsGet)
      if (over) return over
      const row = await adapters.records.get(String(vm.dump(typeH)), String(vm.dump(idH)))
      return vm.newString(JSON.stringify(row ?? null))
    })

    vm.setProp(hostHandle, 'log', logFn)
    vm.setProp(hostHandle, '__storage_get', storageGet)
    vm.setProp(hostHandle, '__storage_set', storageSet)
    vm.setProp(hostHandle, '__storage_list', storageList)
    vm.setProp(hostHandle, '__storage_delete', storageDelete)
    vm.setProp(hostHandle, '__records_list', recordsList)
    vm.setProp(hostHandle, '__records_get', recordsGet)
    const disposables = [logFn, storageGet, storageSet, storageList, storageDelete, recordsList, recordsGet]

    // Injected app host functions → app.__fn_<name> (args as a JSON array).
    for (const [name, def] of Object.entries(functions)) {
      const fn = vm.newAsyncifiedFunction(`__fn_${name}`, async (argsH) => {
        const over = charge(def.cost)
        if (over) return over
        try {
          const args = JSON.parse(String(vm.dump(argsH)) || '[]') as unknown[]
          const result = await def.handler(args)
          return vm.newString(JSON.stringify(result ?? null))
        } catch (e) {
          return { error: vm.newError(`${name} failed: ${(e as Error).message}`) }
        }
      })
      vm.setProp(hostHandle, `__fn_${name}`, fn)
      disposables.push(fn)
    }

    vm.setProp(vm.global, g, hostHandle)
    for (const h of [...disposables, hostHandle]) h.dispose()

    const fnWrappers = Object.keys(functions)
      .map((name) => `${g}.${name} = function() { var r = ${g}.__fn_${name}(JSON.stringify(Array.prototype.slice.call(arguments))); return r === undefined ? undefined : JSON.parse(r); };`)
      .join('\n')

    const program = `
      ${opts.source}
      ;(() => {
        const request = ${JSON.stringify(request)};
        const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
        deepFreeze(request);
        ${g}.request = request;
        ${g}.storage = {
          get: function(key, ns) { var r = ${g}.__storage_get(String(key), ns || "default"); return JSON.parse(r); },
          set: function(key, value, ns) { ${g}.__storage_set(String(key), JSON.stringify(value === undefined ? null : value), ns || "default"); },
          list: function(prefix, ns) { return JSON.parse(${g}.__storage_list(prefix || "", ns || "default")); },
          delete: function(key, ns) { ${g}.__storage_delete(String(key), ns || "default"); }
        };
        ${g}.records = {
          list: function(typeKey, filters) { return JSON.parse(${g}.__records_list(String(typeKey), filters ? JSON.stringify(filters) : "")); },
          get: function(typeKey, id) { return JSON.parse(${g}.__records_get(String(typeKey), String(id))); }
        };
        ${fnWrappers}
        if (typeof handler !== "function") throw new Error("endpoint must define function handler(request)");
        const out = handler(request);
        return JSON.stringify(out ?? null);
      })()
    `

    const result = await vm.evalCodeAsync(program)
    if (result.error) {
      const err = vm.dump(result.error)
      result.error.dispose()
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      if (msg.startsWith(FORBIDDEN)) {
        return { status: 'forbidden', error: msg.slice(FORBIDDEN.length), logs, units, durationMs: Date.now() - started }
      }
      if (Date.now() > deadline) {
        return { status: 'timeout', error: 'execution timed out', logs, units, durationMs: Date.now() - started }
      }
      return { status: 'error', error: msg.startsWith(GOVERNANCE) ? msg.slice(GOVERNANCE.length) : msg, logs, units, durationMs: Date.now() - started }
    }

    const raw = vm.dump(result.value)
    result.value.dispose()
    const parsed = typeof raw === 'string' && raw !== 'null' ? JSON.parse(raw) : null
    return { status: 'ok', response: normalizeResponse(parsed), logs, units, durationMs: Date.now() - started }
  } catch (e) {
    return { status: 'error', error: (e as Error).message, logs, units, durationMs: Date.now() - started }
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

/** A handler may return `{ status, body }` or a bare value (→ 200 with body). */
function normalizeResponse(out: unknown): { status: number; body: unknown } {
  if (out && typeof out === 'object' && 'status' in out && typeof (out as { status: unknown }).status === 'number') {
    const o = out as { status: number; body?: unknown }
    return { status: o.status, body: 'body' in o ? o.body : null }
  }
  return { status: 200, body: out ?? null }
}
