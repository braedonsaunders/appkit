import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const DEFAULT_BUBBLEWRAP_PATH = '/usr/bin/bwrap'
export const DEFAULT_PROCESS_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
export const DEFAULT_READ_ONLY_PATHS = ['/usr', '/etc', '/opt', '/app'] as const
export const DEFAULT_MASKED_PATHS = ['/data', '/home', '/root', '/var'] as const

export interface ProcessSandboxOptions {
  command: string
  args?: readonly string[]
  /** Absolute working directory inside the sandbox. It must be covered by an exposed bind. */
  cwd: string
  /** Absolute host paths mounted read/write at the same path inside the sandbox. */
  writablePaths: readonly string[]
  /** Read-only system/application roots exposed to the child. */
  readOnlyPaths?: readonly string[]
  /** Host roots replaced with empty tmpfs mounts before writable binds are layered on top. */
  maskedPaths?: readonly string[]
  /** The complete child environment. Host process variables are never inherited implicitly. */
  environment?: Readonly<Record<string, string | undefined>>
  bubblewrapPath?: string
  stdio?: StdioOptions
}

export interface BubblewrapPlan {
  command: string
  args: string[]
  /** Complete sanitized wrapper/child environment; never serialized into argv. */
  environment: Record<string, string>
  cwd: string
  writablePaths: string[]
  readOnlyPaths: string[]
  maskedPaths: string[]
}

export interface ProcessSandboxVerification {
  supported: true
  bubblewrapPath: string
}

export class ProcessSandboxError extends Error {
  override readonly name = 'ProcessSandboxError'
}

/** Whether this host can run the Linux bubblewrap implementation. */
export function isProcessSandboxSupported(options: {
  platform?: NodeJS.Platform
  bubblewrapPath?: string
  pathExists?: (path: string) => boolean
} = {}): boolean {
  const platform = options.platform ?? process.platform
  const pathExists = options.pathExists ?? existsSync
  return platform === 'linux' && pathExists(options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH)
}

/**
 * Build the deterministic bubblewrap invocation without spawning it. This is
 * useful for audit logs, deployment readiness checks, tests, and admin UIs.
 */
export function buildBubblewrapPlan(
  options: ProcessSandboxOptions,
  dependencies: { pathExists?: (path: string) => boolean } = {},
): BubblewrapPlan {
  const pathExists = dependencies.pathExists ?? existsSync
  const cwd = absolutePath(options.cwd, 'cwd')
  const writablePaths = uniquePaths(options.writablePaths, 'writablePaths')
  const readOnlyPaths = uniquePaths(
    options.readOnlyPaths ?? DEFAULT_READ_ONLY_PATHS,
    'readOnlyPaths',
  ).filter(pathExists)
  if (
    !writablePaths.some((path) => containsPath(path, cwd))
    && !readOnlyPaths.some((path) => containsPath(path, cwd))
  ) {
    throw new ProcessSandboxError(
      'Sandbox cwd must be contained by a writable or read-only path.',
    )
  }
  const maskedPaths = uniquePaths(options.maskedPaths ?? DEFAULT_MASKED_PATHS, 'maskedPaths')
  const bubblewrapPath = absolutePath(
    options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH,
    'bubblewrapPath',
  )
  const environment = cleanEnvironment(options.environment)
  if (!('PATH' in environment)) environment.PATH = DEFAULT_PROCESS_PATH

  const args: string[] = [
    '--unshare-user',
    '--uid', '0',
    '--gid', '0',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--unshare-cgroup-try',
    '--cap-drop', 'ALL',
    '--new-session',
    '--die-with-parent',
    ...maskedPaths.flatMap((path) => ['--tmpfs', path]),
    '--tmpfs', '/tmp',
    '--tmpfs', '/run',
    ...readOnlyPaths.flatMap((path) => ['--ro-bind', path, path]),
  ]

  if (isAbsolute(options.command)) {
    const commandDirectory = dirname(resolve(options.command))
    if (
      pathExists(commandDirectory)
      && !readOnlyPaths.some((path) => containsPath(path, commandDirectory))
      && !writablePaths.some((path) => containsPath(path, commandDirectory))
    ) {
      args.push('--ro-bind', commandDirectory, commandDirectory)
    }
  }

  args.push(
    '--symlink', 'usr/bin', '/bin',
    '--symlink', 'usr/sbin', '/sbin',
    '--symlink', 'usr/lib', '/lib',
  )
  if (pathExists('/usr/lib64')) args.push('--symlink', 'usr/lib64', '/lib64')

  args.push(
    '--dev', '/dev',
    ...writablePaths.flatMap((path) => ['--bind', path, path]),
    '--chdir', cwd,
  )

  args.push('--', options.command, ...(options.args ?? []))
  return {
    command: bubblewrapPath,
    args,
    environment,
    cwd,
    writablePaths,
    readOnlyPaths,
    maskedPaths,
  }
}

/**
 * Spawn a process under the shared Linux isolation policy. This function is
 * deliberately fail-closed: unsupported platforms, missing binaries, and
 * missing bind sources throw instead of silently running the command directly.
 */
export function spawnBubblewrappedProcess(options: ProcessSandboxOptions): ChildProcess {
  if (process.platform !== 'linux') {
    throw new ProcessSandboxError(
      `The AppKit process sandbox requires Linux; received ${process.platform}.`,
    )
  }

  const plan = buildBubblewrapPlan(options)
  if (!existsSync(plan.command)) {
    throw new ProcessSandboxError(
      `Bubblewrap was not found at ${plan.command}. Install bubblewrap or configure bubblewrapPath.`,
    )
  }
  for (const path of plan.writablePaths) {
    if (!existsSync(path)) {
      throw new ProcessSandboxError(`Writable sandbox path does not exist: ${path}`)
    }
  }

  return spawn(plan.command, plan.args, {
    // Supplying an explicit environment prevents host inheritance without
    // serializing secret values into bwrap argv via `--setenv`.
    env: plan.environment as NodeJS.ProcessEnv,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Execute a minimal child in the real sandbox. Use this during service startup
 * to catch deployment failures that an existence check cannot detect, such as
 * blocked namespace/mount syscalls or an unusable setuid bubblewrap install.
 */
export async function verifyProcessSandbox(options: {
  bubblewrapPath?: string
  timeoutMs?: number
} = {}): Promise<ProcessSandboxVerification> {
  const bubblewrapPath = options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH
  if (!isProcessSandboxSupported({ bubblewrapPath })) {
    throw new ProcessSandboxError(
      process.platform !== 'linux'
        ? `The AppKit process sandbox requires Linux; received ${process.platform}.`
        : `Bubblewrap was not found at ${bubblewrapPath}.`,
    )
  }

  const probeDir = await mkdtemp(`${tmpdir()}/appkit-process-sandbox-`)
  try {
    const child = spawnBubblewrappedProcess({
      command: '/usr/bin/true',
      cwd: probeDir,
      writablePaths: [probeDir],
      bubblewrapPath,
      environment: {},
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    await new Promise<void>((resolvePromise, rejectPromise) => {
      let stderr = ''
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        rejectPromise(new ProcessSandboxError('Bubblewrap verification timed out.'))
      }, options.timeoutMs ?? 10_000)

      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        rejectPromise(
          new ProcessSandboxError(`Bubblewrap verification failed: ${error.message}`),
        )
      })
      child.once('exit', (code, signal) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (code === 0) {
          resolvePromise()
          return
        }
        const detail = stderr.trim()
        rejectPromise(
          new ProcessSandboxError(
            `Bubblewrap verification exited with code ${code ?? 'unknown'}`
              + `${signal ? ` (${signal})` : ''}${detail ? `: ${detail}` : '.'}`,
          ),
        )
      })
    })

    return { supported: true, bubblewrapPath }
  } finally {
    await rm(probeDir, { recursive: true, force: true })
  }
}

function absolutePath(value: string, field: string): string {
  if (!value || !isAbsolute(value)) {
    throw new ProcessSandboxError(`${field} must be an absolute path.`)
  }
  return resolve(value)
}

function uniquePaths(values: readonly string[], field: string): string[] {
  return [...new Set(values.map((value) => absolutePath(value, field)))]
}

function containsPath(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function cleanEnvironment(
  environment: Readonly<Record<string, string | undefined>> | undefined,
): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(environment ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new ProcessSandboxError(`Invalid environment variable name: ${key}`)
    }
    if (typeof value === 'string') clean[key] = value
  }
  return clean
}
