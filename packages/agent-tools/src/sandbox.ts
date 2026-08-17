import {
  DEFAULT_PROCESS_PATH,
  isProcessSandboxSupported,
  spawnBubblewrappedProcess,
  type ProcessSandboxLauncherIdentity,
  type ProcessSandboxLimits,
  type ProcessSandboxNetwork,
} from '@appkitjs/process-sandbox'
import { AgentToolError } from './manifest'

/** One isolated command, fully resolved and ready to run. */
export interface SandboxCommand {
  command: string
  args: string[]
  cwd: string
  writablePaths: string[]
  readOnlyPaths?: string[]
  environment: Record<string, string>
  network: ProcessSandboxNetwork
  limits?: ProcessSandboxLimits
  timeoutMs: number
}

export interface SandboxResult {
  status: 'completed' | 'failed' | 'timeout'
  exitCode: number | null
  stdout: string
  stderr: string
  /** Whether either stream hit the cap and was cut. */
  truncated: boolean
  durationMs: number
}

/**
 * How the runtime actually runs things. The default implementation goes through
 * `@appkitjs/process-sandbox`; tests and non-Linux hosts substitute their own,
 * which is the only supported way to run this package's lifecycle without
 * bubblewrap.
 */
export type SandboxRunner = (command: SandboxCommand) => Promise<SandboxResult>

export interface ProcessSandboxRunnerOptions {
  bubblewrapPath?: string
  prlimitPath?: string
  launcherIdentity?: ProcessSandboxLauncherIdentity
  readOnlyPaths?: readonly string[]
  maskedPaths?: readonly string[]
  /** Bytes retained per stream before output is cut. */
  maxOutputBytes?: number
}

export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

/**
 * The production runner. Output is capped per stream so a chatty tool cannot
 * flood the caller — an agent's context window is the usual destination.
 */
export function createProcessSandboxRunner(
  options: ProcessSandboxRunnerOptions = {},
): SandboxRunner {
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES

  return async (command) => {
    if (!isProcessSandboxSupported({ bubblewrapPath: options.bubblewrapPath })) {
      throw new AgentToolError(
        'Managed tools require the Linux process sandbox, which is unavailable on this host.',
      )
    }

    const startedAt = Date.now()
    const child = spawnBubblewrappedProcess({
      command: command.command,
      args: command.args,
      cwd: command.cwd,
      writablePaths: command.writablePaths,
      ...(command.readOnlyPaths ? { readOnlyPaths: command.readOnlyPaths } : {}),
      ...(options.readOnlyPaths && !command.readOnlyPaths
        ? { readOnlyPaths: options.readOnlyPaths }
        : {}),
      ...(options.maskedPaths ? { maskedPaths: options.maskedPaths } : {}),
      environment: { PATH: DEFAULT_PROCESS_PATH, ...command.environment },
      network: command.network,
      ...(command.limits ? { limits: command.limits } : {}),
      ...(options.bubblewrapPath ? { bubblewrapPath: options.bubblewrapPath } : {}),
      ...(options.prlimitPath ? { prlimitPath: options.prlimitPath } : {}),
      ...(options.launcherIdentity ? { launcherIdentity: options.launcherIdentity } : {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let truncated = false
    const collect = (append: (text: string) => void, current: () => string) => (chunk: Buffer) => {
      const room = maxOutputBytes - current().length
      if (room <= 0) {
        truncated = true
        return
      }
      const text = chunk.toString('utf8')
      if (text.length > room) truncated = true
      append(text.slice(0, room))
    }
    child.stdout?.on('data', collect((text) => { stdout += text }, () => stdout))
    child.stderr?.on('data', collect((text) => { stderr += text }, () => stderr))

    const outcome = await new Promise<{ status: SandboxResult['status']; exitCode: number | null }>(
      (resolvePromise) => {
        let settled = false
        const settle = (value: { status: SandboxResult['status']; exitCode: number | null }) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolvePromise(value)
        }
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          settle({ status: 'timeout', exitCode: null })
        }, command.timeoutMs)
        child.once('error', (error) => {
          stderr = stderr.length > 0 ? `${stderr}\n${error.message}` : error.message
          settle({ status: 'failed', exitCode: null })
        })
        child.once('exit', (code) => {
          settle({ status: code === 0 ? 'completed' : 'failed', exitCode: code })
        })
      },
    )

    return {
      ...outcome,
      stdout,
      stderr,
      truncated,
      durationMs: Date.now() - startedAt,
    }
  }
}
