import { newAsyncContext } from 'quickjs-emscripten'

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const FAULT_PREFIX = '__APPKIT_SANDBOX_FAULT__'
const GOVERNANCE_CODE = 'governance'

export type SandboxStatus = 'ok' | 'error' | 'timeout' | 'forbidden' | 'aborted' | 'governance'

export interface SandboxLimits {
  timeoutMs?: number
  unitBudget?: number
  memoryBytes?: number
  stackBytes?: number
}

export interface SandboxHostFunction {
  /** Governance units charged before each invocation. */
  cost: number
  handler: (args: unknown[]) => Promise<unknown> | unknown
}

export interface SandboxOptions extends SandboxLimits {
  source: string
  /** Function declared by the authored source. Defaults to `main`. */
  entrypoint?: string
  /** Frozen argument passed to the entrypoint. */
  input: unknown
  /** Host object exposed in the sandbox. Defaults to `app`. */
  globalName?: string
  /** Dotted host methods become nested functions, such as `storage.get`. */
  functions?: Record<string, SandboxHostFunction>
  /** Frozen values copied onto the host object before execution. */
  values?: Record<string, unknown>
  /** Cost of one host log call. Defaults to one unit. */
  logCost?: number
}

export interface SandboxResult {
  status: SandboxStatus
  value?: unknown
  error?: string
  code?: string
  logs: string[]
  units: number
  durationMs: number
}

/** A host adapter may throw this to return a classified, non-ambient fault. */
export class SandboxFault extends Error {
  override readonly name = 'SandboxFault'

  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function forbidden(message: string): never {
  throw new SandboxFault('forbidden', message)
}

export function abort(message: string): never {
  throw new SandboxFault('aborted', message)
}

/**
 * Execute authored JavaScript in a fresh QuickJS WASM runtime. The authored
 * program has no Node globals, filesystem, network, process, module loader, or
 * database connection. Every capability is an explicit host function.
 */
export async function runSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const globalName = options.globalName ?? 'app'
  const entrypoint = options.entrypoint ?? 'main'
  assertIdentifier(globalName, 'globalName')
  assertIdentifier(entrypoint, 'entrypoint')
  const functions = options.functions ?? {}
  for (const [name, definition] of Object.entries(functions)) {
    assertPath(name)
    if (!Number.isFinite(definition.cost) || definition.cost < 0) {
      throw new Error(`host function cost must be a non-negative number: ${name}`)
    }
  }
  for (const name of Object.keys(options.values ?? {})) assertIdentifier(name, 'host value name')

  const timeoutMs = clamp(options.timeoutMs ?? 3_000, 1, 15_000)
  const unitBudget = clamp(options.unitBudget ?? 1_000, 1, 1_000_000)
  const memoryBytes = clamp(options.memoryBytes ?? 64 * 1024 * 1024, 8 * 1024 * 1024, 256 * 1024 * 1024)
  const stackBytes = clamp(options.stackBytes ?? 1024 * 1024, 128 * 1024, 8 * 1024 * 1024)
  const logCost = clamp(options.logCost ?? 1, 0, 100_000)

  const vm = await newAsyncContext()
  const runtime = vm.runtime
  runtime.setMemoryLimit(memoryBytes)
  runtime.setMaxStackSize(stackBytes)
  const deadline = Date.now() + timeoutMs
  runtime.setInterruptHandler(() => Date.now() > deadline)

  const logs: string[] = []
  let units = 0
  const started = Date.now()

  const charge = (cost: number) => {
    units += cost
    if (units > unitBudget) {
      return { error: vm.newError(encodeFault(GOVERNANCE_CODE, `governance budget exceeded (${units}/${unitBudget} units)`)) }
    }
    return null
  }

  try {
    const host = vm.newObject()
    const log = vm.newFunction('log', (...handles) => {
      const over = charge(logCost)
      if (over) return over
      logs.push(handles.map((handle) => formatLogValue(vm.dump(handle))).join(' '))
      return vm.undefined
    })
    vm.setProp(host, 'log', log)
    const disposables = [log]

    const registrations = Object.entries(functions).map(([path, definition], index) => {
      const internalName = `__host_${index}`
      const fn = vm.newAsyncifiedFunction(internalName, async (argsHandle) => {
        const over = charge(definition.cost)
        if (over) return over
        try {
          const raw = vm.dump(argsHandle)
          const args = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : []
          const value = await definition.handler(args)
          return vm.newString(JSON.stringify(value === undefined ? null : value))
        } catch (error) {
          const fault = error instanceof SandboxFault
            ? error
            : new SandboxFault('host_error', error instanceof Error ? error.message : String(error))
          return { error: vm.newError(encodeFault(fault.code, fault.message)) }
        }
      })
      vm.setProp(host, internalName, fn)
      disposables.push(fn)
      return { path, internalName }
    })

    vm.setProp(vm.global, globalName, host)
    for (const disposable of [...disposables, host]) disposable.dispose()

    const values = Object.entries(options.values ?? {})
      .map(([name, value]) => `${globalName}[${JSON.stringify(name)}] = __deepFreeze(${safeJson(value)});`)
      .join('\n')
    const wrappers = registrations.map(({ path, internalName }) => wrapperSource(globalName, path, internalName)).join('\n')
    const program = `
      ${options.source}
      ;(() => {
        const __deepFreeze = (value) => {
          if (value && typeof value === "object" && !Object.isFrozen(value)) {
            Object.values(value).forEach(__deepFreeze);
            Object.freeze(value);
          }
          return value;
        };
        const __input = __deepFreeze(${safeJson(options.input)});
        ${values}
        ${wrappers}
        if (typeof ${entrypoint} !== "function") throw new Error(${JSON.stringify(`script must define function ${entrypoint}(input)`)});
        const __result = ${entrypoint}(__input);
        return JSON.stringify(__result === undefined ? null : __result);
      })()
    `

    const result = await vm.evalCodeAsync(program)
    if (result.error) {
      const dumped = vm.dump(result.error)
      result.error.dispose()
      const message = errorMessage(dumped)
      if (Date.now() > deadline || /interrupted/i.test(message)) {
        return finish('timeout', started, logs, units, 'execution timed out')
      }
      const fault = decodeFault(message)
      if (fault) {
        const status = statusForCode(fault.code)
        return finish(status, started, logs, units, fault.message, fault.code)
      }
      return finish('error', started, logs, units, message)
    }

    const dumped = vm.dump(result.value)
    result.value.dispose()
    const value = typeof dumped === 'string' ? JSON.parse(dumped) : null
    return { status: 'ok', value, logs, units, durationMs: Date.now() - started }
  } catch (error) {
    return finish('error', started, logs, units, error instanceof Error ? error.message : String(error))
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

function wrapperSource(globalName: string, path: string, internalName: string): string {
  const parts = path.split('.')
  const leaf = parts.pop()!
  let cursor = globalName
  const declarations: string[] = []
  for (const part of parts) {
    const next = `${cursor}[${JSON.stringify(part)}]`
    declarations.push(`${next} = ${next} || {};`)
    cursor = next
  }
  declarations.push(`${cursor}[${JSON.stringify(leaf)}] = function() {
    const value = ${globalName}[${JSON.stringify(internalName)}](JSON.stringify(Array.prototype.slice.call(arguments)));
    return value === undefined ? undefined : JSON.parse(value);
  };`)
  return declarations.join('\n')
}

function finish(
  status: Exclude<SandboxStatus, 'ok'>,
  started: number,
  logs: string[],
  units: number,
  error: string,
  code?: string,
): SandboxResult {
  return { status, error, ...(code ? { code } : {}), logs, units, durationMs: Date.now() - started }
}

function safeJson(value: unknown): string {
  const encoded = JSON.stringify(value === undefined ? null : value)
  if (encoded === undefined) throw new Error('sandbox input must be JSON-serializable')
  return encoded.replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}

function encodeFault(code: string, message: string): string {
  return `${FAULT_PREFIX}${JSON.stringify({ code, message })}`
}

function decodeFault(message: string): { code: string; message: string } | null {
  const at = message.indexOf(FAULT_PREFIX)
  if (at < 0) return null
  try {
    const parsed = JSON.parse(message.slice(at + FAULT_PREFIX.length)) as { code?: unknown; message?: unknown }
    return typeof parsed.code === 'string' && typeof parsed.message === 'string' ? parsed as { code: string; message: string } : null
  } catch {
    return null
  }
}

function statusForCode(code: string): Exclude<SandboxStatus, 'ok'> {
  if (code === 'forbidden') return 'forbidden'
  if (code === 'aborted') return 'aborted'
  if (code === GOVERNANCE_CODE) return 'governance'
  return 'error'
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value
  const encoded = JSON.stringify(value)
  return encoded === undefined ? String(value) : encoded
}

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must be a valid JavaScript identifier`)
}

function assertPath(value: string): void {
  if (!value.split('.').every((part) => IDENTIFIER.test(part))) throw new Error(`host function path must contain identifiers: ${value}`)
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new Error('sandbox limit must be finite')
  return Math.max(minimum, Math.min(maximum, Math.floor(value)))
}
