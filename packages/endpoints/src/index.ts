import { forbidden, runSandbox, type SandboxHostFunction, type SandboxLimits } from '@appkit/sandbox'

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

export interface HostFunction {
  cost: number
  handler: (args: unknown[]) => Promise<unknown> | unknown
}

export interface HostAdapters {
  storage: StorageAdapter
  records?: RecordsAdapter
  /** Additional governed functions, including dotted names such as `journal.create`. */
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

export const DEFAULT_COSTS = {
  log: 1,
  storageGet: 5,
  storageList: 5,
  storageSet: 10,
  storageDelete: 10,
  recordsList: 10,
  recordsGet: 5,
} as const

/**
 * Execute `handler(request)` inside the shared QuickJS sandbox. Storage,
 * records, and application-specific functions exist only when supplied by the
 * host, keeping tenant scope and authorization outside authored code.
 */
export async function runEndpoint(options: {
  source: string
  request: EndpointRequest
  adapters: HostAdapters
  globalName?: string
  costs?: Partial<typeof DEFAULT_COSTS>
} & SandboxLimits): Promise<EndpointResult> {
  const globalName = options.globalName ?? 'app'
  const costs = { ...DEFAULT_COSTS, ...options.costs }
  const functions: Record<string, SandboxHostFunction> = {
    'storage.get': {
      cost: costs.storageGet,
      handler: ([key, namespace]) => options.adapters.storage.get(String(key), namespaceValue(namespace)),
    },
    'storage.set': {
      cost: costs.storageSet,
      handler: async ([key, value, namespace]) => {
        await options.adapters.storage.set(String(key), value ?? null, namespaceValue(namespace))
        return null
      },
    },
    'storage.list': {
      cost: costs.storageList,
      handler: ([prefix, namespace]) => options.adapters.storage.list(String(prefix ?? ''), namespaceValue(namespace)),
    },
    'storage.delete': {
      cost: costs.storageDelete,
      handler: async ([key, namespace]) => {
        await options.adapters.storage.delete(String(key), namespaceValue(namespace))
        return null
      },
    },
    'records.list': {
      cost: costs.recordsList,
      handler: ([typeKey, filters]) => {
        if (!options.adapters.records) forbidden('record reads are not granted to this endpoint')
        return options.adapters.records.list(String(typeKey), isRecord(filters) ? filters : {})
      },
    },
    'records.get': {
      cost: costs.recordsGet,
      handler: ([typeKey, id]) => {
        if (!options.adapters.records) forbidden('record reads are not granted to this endpoint')
        return options.adapters.records.get(String(typeKey), String(id))
      },
    },
    ...options.adapters.functions,
  }

  const result = await runSandbox({
    source: options.source,
    entrypoint: 'handler',
    input: options.request,
    globalName,
    values: { request: options.request },
    functions,
    timeoutMs: options.timeoutMs,
    unitBudget: options.unitBudget,
    memoryBytes: options.memoryBytes,
    stackBytes: options.stackBytes,
    logCost: costs.log,
  })

  if (result.status !== 'ok') {
    return {
      status: result.status === 'forbidden' ? 'forbidden' : result.status === 'timeout' ? 'timeout' : 'error',
      error: result.error,
      logs: result.logs,
      units: result.units,
      durationMs: result.durationMs,
    }
  }
  return {
    status: 'ok',
    response: normalizeResponse(result.value),
    logs: result.logs,
    units: result.units,
    durationMs: result.durationMs,
  }
}

function namespaceValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'default' : String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeResponse(output: unknown): { status: number; body: unknown } {
  if (output && typeof output === 'object' && 'status' in output && typeof (output as { status: unknown }).status === 'number') {
    const response = output as { status: number; body?: unknown }
    return { status: response.status, body: 'body' in response ? response.body : null }
  }
  return { status: 200, body: output ?? null }
}
