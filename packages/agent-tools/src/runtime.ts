import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  AgentToolError,
  agentToolCommands,
  type AgentToolManifest,
} from './manifest'
import {
  agentToolScope,
  DEFAULT_AGENT_TOOL_POLICY,
  evaluateAgentToolPolicy,
  isGrantUsable,
  isPendingApprovalExpired,
  spentGrantStatus,
  type AgentToolGateOutcome,
  type AgentToolPolicy,
} from './policy'
import type { SandboxCommand, SandboxRunner } from './sandbox'
import type {
  AgentToolAction,
  AgentToolApproval,
  AgentToolRecord,
  AgentToolRun,
  AgentToolStore,
} from './store'

/** Roots a `binary-path` manifest may point into unless the host says otherwise. */
export const DEFAULT_ALLOWED_BINARY_ROOTS = [
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/opt',
] as const

export const DEFAULT_EXECUTION_TIMEOUT_MS = 60_000
export const DEFAULT_INSTALL_TIMEOUT_MS = 300_000
export const DEFAULT_HEALTH_TIMEOUT_MS = 20_000
const MAX_ARGUMENTS = 128
const MAX_ARGUMENT_LENGTH = 4_096

export interface AgentToolAuditEntry {
  tenantId: string
  toolId: string
  action: 'register' | 'install' | 'health' | 'execute' | 'approval_requested' | 'approval_decided'
  actor: string
  message: string
  context: Record<string, unknown>
  at: string
}

export interface AgentToolRuntimeOptions {
  store: AgentToolStore
  /** How commands actually run. Use `createProcessSandboxRunner()` in production. */
  runner: SandboxRunner
  /**
   * Absolute root for npm installs. Each tool gets
   * `<installRoot>/<tenantId>/<toolId>`, so tenants never share bytes.
   */
  installRoot: string
  /** Resolves the tenant's policy. Defaults to `DEFAULT_AGENT_TOOL_POLICY`. */
  policy?: (tenantId: string) => Promise<AgentToolPolicy> | AgentToolPolicy
  allowedBinaryRoots?: readonly string[]
  npmExecutable?: string
  /** Registry the install runs against. Omitted means npm's own default. */
  npmRegistryUrl?: string
  now?: () => Date
  newId?: () => string
  audit?: (entry: AgentToolAuditEntry) => Promise<void> | void
}

export interface AgentToolInstallInput {
  tenantId: string
  toolId: string
  actor: string
  reason?: string
}

export interface AgentToolExecuteInput {
  tenantId: string
  toolId: string
  /** A command name the manifest declares. */
  command: string
  argv?: string[]
  /** Absolute writable directory the command runs in — the only writable place. */
  workdir: string
  timeoutMs?: number
  installIfMissing?: boolean
  healthCheckBeforeRun?: boolean
  actor: string
  reason?: string
}

export type AgentToolLifecycleResult =
  | { outcome: 'ok'; tool: AgentToolRecord; summary: string }
  | { outcome: 'blocked'; approval: AgentToolApproval; summary: string }
  | { outcome: 'denied'; reason: string; summary: string }
  | { outcome: 'failed'; error: string; summary: string }

export type AgentToolExecutionResult =
  | { outcome: 'ran'; run: AgentToolRun; summary: string }
  | { outcome: 'blocked'; approval: AgentToolApproval; summary: string }
  | { outcome: 'denied'; reason: string; summary: string }
  | { outcome: 'unavailable'; reason: string; summary: string }

export interface AgentToolRuntime {
  /** Put a manifest on a tenant's shelf, or update the one already there. */
  register(tenantId: string, manifest: AgentToolManifest, actor?: string): Promise<AgentToolRecord>
  list(tenantId: string): Promise<AgentToolRecord[]>
  get(tenantId: string, toolId: string): Promise<AgentToolRecord | undefined>
  install(input: AgentToolInstallInput): Promise<AgentToolLifecycleResult>
  checkHealth(tenantId: string, toolId: string): Promise<AgentToolLifecycleResult>
  execute(input: AgentToolExecuteInput): Promise<AgentToolExecutionResult>
  listApprovals(tenantId: string): Promise<AgentToolApproval[]>
  approve(input: {
    tenantId: string
    approvalId: string
    decidedBy: string
    reason?: string
  }): Promise<AgentToolApproval | undefined>
  deny(input: {
    tenantId: string
    approvalId: string
    decidedBy: string
    reason?: string
  }): Promise<AgentToolApproval | undefined>
  /** Sweep unanswered requests and spent grants past their windows. */
  expireStale(tenantId: string): Promise<number>
  listRuns(tenantId: string, filter?: { toolId?: string; limit?: number }): Promise<AgentToolRun[]>
}

export function createAgentToolRuntime(options: AgentToolRuntimeOptions): AgentToolRuntime {
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? randomUUID
  const allowedBinaryRoots = (options.allowedBinaryRoots ?? DEFAULT_ALLOWED_BINARY_ROOTS).map(
    (root) => resolve(root),
  )
  const installRoot = requireAbsolute(options.installRoot, 'installRoot')
  const npmExecutable = options.npmExecutable ?? '/usr/local/bin/npm'
  const nowIso = (): string => now().toISOString()

  const audit = async (entry: Omit<AgentToolAuditEntry, 'at'>): Promise<void> => {
    await options.audit?.({ ...entry, at: nowIso() })
  }

  const policyFor = async (tenantId: string): Promise<AgentToolPolicy> =>
    options.policy ? await options.policy(tenantId) : DEFAULT_AGENT_TOOL_POLICY

  function installDirFor(tenantId: string, toolId: string): string {
    return join(installRoot, pathSegment(tenantId, 'tenantId'), pathSegment(toolId, 'toolId'))
  }

  function resolveBinPath(tool: AgentToolRecord, command: string): string | undefined {
    const known = tool.binPaths[command]
    if (known) return known
    const declared = tool.manifest.bins.find((bin) => bin.name === command)
    if (!declared) return undefined
    if (tool.manifest.sourceKind === 'binary-path' && tool.manifest.binaryPath) {
      return resolve(tool.manifest.binaryPath)
    }
    return undefined
  }

  /**
   * Decide an action, consulting policy first and stored decisions second. A
   * usable grant is spent here, so the caller never has to remember to.
   */
  async function gate(input: {
    tenantId: string
    tool: AgentToolRecord
    action: AgentToolAction
    detail: Record<string, unknown>
    reason: string
    actor: string
  }): Promise<AgentToolGateOutcome> {
    const policy = await policyFor(input.tenantId)
    const mode = input.action === 'install' ? policy.install : policy.execute
    const evaluated = evaluateAgentToolPolicy({
      mode,
      manifest: input.tool.manifest,
      action: input.action,
    })
    if (evaluated.outcome === 'deny') {
      return { decision: 'deny', reason: evaluated.reason }
    }
    if (evaluated.outcome === 'allow') {
      return { decision: 'allow' }
    }

    const scope = agentToolScope({
      action: input.action,
      toolId: input.tool.toolId,
      detail: input.detail,
      ...(input.action === 'execute'
        ? { approvalScope: input.tool.manifest.approvalScope }
        : {}),
    })
    const current = now()
    const existing = (
      await options.store.listApprovals(input.tenantId, {
        toolId: input.tool.toolId,
        action: input.action,
      })
    ).filter((approval) => approval.scope === scope)

    const grant = existing.find((approval) => isGrantUsable(approval, current))
    if (grant) {
      const consumed = await options.store.consumeGrant(input.tenantId, grant.id)
      if (consumed) return { decision: 'allow', approval: consumed }
    }

    // A refusal stands for the life of the decision, so an agent that was told
    // no cannot re-file the same question in a loop.
    const refusal = existing.find(
      (approval) =>
        approval.status === 'denied' &&
        (!approval.grantExpiresAt || new Date(approval.grantExpiresAt).getTime() > current.getTime()),
    )
    if (refusal) {
      return {
        decision: 'deny',
        reason: refusal.decisionReason?.trim()
          ? refusal.decisionReason
          : `A person declined this ${input.action} for ${input.tool.manifest.name}.`,
        approval: refusal,
      }
    }

    const pending = existing.find(
      (approval) => approval.status === 'pending' && !isPendingApprovalExpired(approval, current),
    )
    if (pending) {
      return { decision: 'await_approval', approval: pending, reason: pending.reason }
    }

    const approval = await options.store.upsertApproval({
      id: newId(),
      tenantId: input.tenantId,
      toolId: input.tool.toolId,
      action: input.action,
      status: 'pending',
      scope,
      request: input.detail,
      reason: input.reason,
      requestedBy: input.actor,
      requestedAt: nowIso(),
      expiresAt: new Date(current.getTime() + policy.pendingTtlMs).toISOString(),
    })
    await audit({
      tenantId: input.tenantId,
      toolId: input.tool.toolId,
      action: 'approval_requested',
      actor: input.actor,
      message: `${input.action === 'install' ? 'Install' : 'Execution'} of ${input.tool.manifest.name} needs review`,
      context: { approvalId: approval.id, ...input.detail },
    })
    return { decision: 'await_approval', approval, reason: input.reason }
  }

  async function saveTool(record: AgentToolRecord): Promise<AgentToolRecord> {
    return options.store.upsertTool({ ...record, updatedAt: nowIso() })
  }

  async function installNpmTool(tool: AgentToolRecord): Promise<AgentToolRecord> {
    const { manifest } = tool
    if (!manifest.packageName || !manifest.packageVersion) {
      throw new AgentToolError(`${manifest.id} is missing packageName or packageVersion.`)
    }
    const installDir = installDirFor(tool.tenantId, tool.toolId)
    const cacheDir = join(installDir, '.npm-cache')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(
      join(installDir, 'package.json'),
      `${JSON.stringify(
        { name: `appkit-agent-tool-${manifest.id}`, version: '0.0.0', private: true },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const result = await options.runner({
      command: npmExecutable,
      args: [
        'install',
        '--no-save',
        '--no-package-lock',
        // Lifecycle scripts are arbitrary code from the registry running with
        // the installer's reach. A CLI that needs them is not a managed tool.
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        `${manifest.packageName}@${manifest.packageVersion}`,
      ],
      cwd: installDir,
      writablePaths: [installDir],
      environment: {
        HOME: installDir,
        npm_config_cache: cacheDir,
        npm_config_update_notifier: 'false',
        ...(options.npmRegistryUrl ? { npm_config_registry: options.npmRegistryUrl } : {}),
      },
      // An install is the one lifecycle step that legitimately reaches out.
      network: 'host',
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
    })

    if (result.status !== 'completed') {
      const detail = result.stderr.trim() || result.stdout.trim()
      throw new AgentToolError(
        `Installing ${manifest.packageName}@${manifest.packageVersion} ${
          result.status === 'timeout' ? 'timed out' : 'failed'
        }${detail ? `: ${detail}` : '.'}`,
      )
    }

    const binPaths: Record<string, string> = {}
    for (const bin of manifest.bins) {
      const candidate = join(installDir, 'node_modules', '.bin', bin.bin)
      if (existsSync(candidate)) binPaths[bin.name] = candidate
    }
    const missing = agentToolCommands(manifest).filter((name) => !binPaths[name])
    if (missing.length > 0) {
      throw new AgentToolError(
        `${manifest.packageName} installed but did not provide: ${missing.join(', ')}.`,
      )
    }

    return saveTool({
      ...tool,
      status: 'installed',
      health: 'unknown',
      installDir,
      binPaths,
      installedVersion:
        (await installedPackageVersion(installDir, manifest.packageName)) ?? manifest.packageVersion,
      lastInstalledAt: nowIso(),
      lastError: undefined,
    })
  }

  async function installBinaryTool(tool: AgentToolRecord): Promise<AgentToolRecord> {
    const declared = tool.manifest.binaryPath
    if (!declared) {
      throw new AgentToolError(`${tool.manifest.id} does not declare a binaryPath.`)
    }
    const binaryPath = requireAbsolute(declared, 'binaryPath')
    if (!allowedBinaryRoots.some((root) => contains(root, binaryPath))) {
      throw new AgentToolError(
        `${binaryPath} is outside the allowed binary roots (${allowedBinaryRoots.join(', ')}).`,
      )
    }
    if (!existsSync(binaryPath)) {
      throw new AgentToolError(`No executable at ${binaryPath}.`)
    }
    const binPaths: Record<string, string> = {}
    for (const bin of tool.manifest.bins) binPaths[bin.name] = binaryPath

    return saveTool({
      ...tool,
      status: 'installed',
      health: 'unknown',
      binPaths,
      lastInstalledAt: nowIso(),
      lastError: undefined,
    })
  }

  const runtime: AgentToolRuntime = {
    async register(tenantId, manifest, actor = 'system') {
      const existing = await options.store.getTool(tenantId, manifest.id)
      const timestamp = nowIso()
      if (!existing) {
        const created = await options.store.upsertTool({
          id: newId(),
          tenantId,
          toolId: manifest.id,
          manifest,
          enabled: true,
          status: 'not_installed',
          health: 'unknown',
          ...(manifest.sourceKind === 'npm-package'
            ? { installDir: installDirFor(tenantId, manifest.id) }
            : {}),
          binPaths: {},
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        await audit({
          tenantId,
          toolId: manifest.id,
          action: 'register',
          actor,
          message: `Catalogued ${manifest.name}`,
          context: { risk: manifest.risk, sourceKind: manifest.sourceKind },
        })
        return created
      }

      // Re-pinning a version means the bytes on disk are no longer the bytes
      // the manifest describes, so the tool goes back to uninstalled.
      const pinChanged =
        existing.manifest.packageVersion !== manifest.packageVersion ||
        existing.manifest.binaryPath !== manifest.binaryPath ||
        existing.manifest.sourceKind !== manifest.sourceKind
      return saveTool({
        ...existing,
        manifest,
        ...(pinChanged
          ? { status: 'not_installed', health: 'unknown', binPaths: {}, installedVersion: undefined }
          : {}),
      })
    },

    async list(tenantId) {
      return options.store.listTools(tenantId)
    },

    async get(tenantId, toolId) {
      return options.store.getTool(tenantId, toolId)
    },

    async install(input) {
      const tool = await options.store.getTool(input.tenantId, input.toolId)
      if (!tool) {
        return {
          outcome: 'denied',
          reason: 'not_catalogued',
          summary: `${input.toolId} is not in this workspace's tool catalogue.`,
        }
      }
      if (!tool.enabled) {
        return {
          outcome: 'denied',
          reason: 'disabled',
          summary: `${tool.manifest.name} is turned off for this workspace.`,
        }
      }

      const gated = await gate({
        tenantId: input.tenantId,
        tool,
        action: 'install',
        detail:
          tool.manifest.sourceKind === 'npm-package'
            ? {
                packageName: tool.manifest.packageName ?? null,
                packageVersion: tool.manifest.packageVersion ?? null,
              }
            : { binaryPath: tool.manifest.binaryPath ?? null },
        reason: input.reason ?? `Install ${tool.manifest.name}`,
        actor: input.actor,
      })
      if (gated.decision === 'deny') {
        return {
          outcome: 'denied',
          reason: gated.reason,
          summary: `Installing ${tool.manifest.name} was refused. ${gated.reason}`,
        }
      }
      if (gated.decision === 'await_approval') {
        return {
          outcome: 'blocked',
          approval: gated.approval,
          summary: `Installing ${tool.manifest.name} is waiting on a person to approve it.`,
        }
      }

      await saveTool({ ...tool, status: 'installing', lastError: undefined })
      try {
        const installed =
          tool.manifest.sourceKind === 'npm-package'
            ? await installNpmTool(tool)
            : await installBinaryTool(tool)
        await audit({
          tenantId: input.tenantId,
          toolId: tool.toolId,
          action: 'install',
          actor: input.actor,
          message: `Installed ${tool.manifest.name}`,
          context: { version: installed.installedVersion ?? null },
        })
        const health = await runtime.checkHealth(input.tenantId, tool.toolId)
        return health.outcome === 'ok'
          ? health
          : {
              outcome: 'ok',
              tool: installed,
              summary: `${tool.manifest.name} installed, but its health check did not pass.`,
            }
      } catch (error) {
        const message = errorMessage(error)
        await saveTool({ ...tool, status: 'error', health: 'unavailable', lastError: message })
        return {
          outcome: 'failed',
          error: message,
          summary: `${tool.manifest.name} did not install. ${message}`,
        }
      }
    },

    async checkHealth(tenantId, toolId) {
      const tool = await options.store.getTool(tenantId, toolId)
      if (!tool) {
        return {
          outcome: 'denied',
          reason: 'not_catalogued',
          summary: `${toolId} is not in this workspace's tool catalogue.`,
        }
      }
      if (tool.status !== 'installed') {
        const updated = await saveTool({
          ...tool,
          health: 'unavailable',
          lastCheckedAt: nowIso(),
        })
        return {
          outcome: 'ok',
          tool: updated,
          summary: `${tool.manifest.name} is not installed.`,
        }
      }

      let healthy = true
      let detail = `${tool.manifest.name} is ready.`
      for (const bin of tool.manifest.bins) {
        const binPath = resolveBinPath(tool, bin.name)
        if (!binPath || !existsSync(binPath)) {
          healthy = false
          detail = `The ${bin.name} command is missing from ${tool.manifest.name}.`
          break
        }
        if (!bin.healthCheckArgs?.length) continue
        const result = await options.runner({
          command: binPath,
          args: [...bin.healthCheckArgs],
          cwd: tool.installDir ?? installRoot,
          writablePaths: [],
          readOnlyPaths: readOnlyRootsFor(tool),
          environment: { HOME: '/tmp' },
          network: 'none',
          timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
        })
        if (result.status !== 'completed') {
          healthy = false
          detail =
            result.stderr.trim() || result.stdout.trim() || `${bin.name} failed its health check.`
          break
        }
      }

      const updated = await saveTool({
        ...tool,
        health: healthy ? 'healthy' : 'degraded',
        lastCheckedAt: nowIso(),
        lastError: healthy ? undefined : detail,
      })
      await audit({
        tenantId,
        toolId,
        action: 'health',
        actor: 'system',
        message: detail,
        context: { healthy },
      })
      return { outcome: 'ok', tool: updated, summary: detail }
    },

    async execute(input) {
      const argv = validateArgv(input.argv ?? [])
      const workdir = requireAbsolute(input.workdir, 'workdir')
      let tool = await options.store.getTool(input.tenantId, input.toolId)
      if (!tool) {
        return {
          outcome: 'unavailable',
          reason: 'not_catalogued',
          summary: `${input.toolId} is not in this workspace's tool catalogue.`,
        }
      }
      if (!tool.enabled) {
        return {
          outcome: 'denied',
          reason: 'disabled',
          summary: `${tool.manifest.name} is turned off for this workspace.`,
        }
      }
      if (!tool.manifest.bins.some((bin) => bin.name === input.command)) {
        return {
          outcome: 'unavailable',
          reason: 'unknown_command',
          summary: `${tool.manifest.name} has no command named ${input.command}. It offers: ${agentToolCommands(tool.manifest).join(', ')}.`,
        }
      }

      if (tool.status !== 'installed') {
        if (!input.installIfMissing) {
          return {
            outcome: 'unavailable',
            reason: 'not_installed',
            summary: `${tool.manifest.name} is not installed yet.`,
          }
        }
        const installed = await runtime.install({
          tenantId: input.tenantId,
          toolId: input.toolId,
          actor: input.actor,
        })
        if (installed.outcome === 'blocked') {
          return { outcome: 'blocked', approval: installed.approval, summary: installed.summary }
        }
        if (installed.outcome !== 'ok') {
          return {
            outcome: 'unavailable',
            reason: installed.outcome === 'denied' ? installed.reason : installed.error,
            summary: installed.summary,
          }
        }
        tool = installed.tool
      }

      if (input.healthCheckBeforeRun) {
        const health = await runtime.checkHealth(input.tenantId, input.toolId)
        if (health.outcome === 'ok' && health.tool.health !== 'healthy') {
          return {
            outcome: 'unavailable',
            reason: 'unhealthy',
            summary: health.summary,
          }
        }
        if (health.outcome === 'ok') tool = health.tool
      }

      const gated = await gate({
        tenantId: input.tenantId,
        tool,
        action: 'execute',
        detail: { command: input.command, argv },
        reason:
          input.reason ??
          `Run ${input.command}${argv.length ? ` ${argv.join(' ')}` : ''} with ${tool.manifest.name}`,
        actor: input.actor,
      })
      if (gated.decision === 'deny') {
        return {
          outcome: 'denied',
          reason: gated.reason,
          summary: `Running ${input.command} was refused. ${gated.reason}`,
        }
      }
      if (gated.decision === 'await_approval') {
        return {
          outcome: 'blocked',
          approval: gated.approval,
          summary: `Running ${input.command} is waiting on a person to approve it.`,
        }
      }

      const binPath = resolveBinPath(tool, input.command)
      if (!binPath) {
        return {
          outcome: 'unavailable',
          reason: 'command_unresolved',
          summary: `${input.command} is declared by ${tool.manifest.name} but no executable was resolved. Reinstall it.`,
        }
      }

      await mkdir(workdir, { recursive: true })
      const startedAt = nowIso()
      const command: SandboxCommand = {
        command: binPath,
        args: argv,
        cwd: workdir,
        // The workdir is the only writable place; the tool's own install
        // directory is mounted read-only so a run cannot rewrite the tool.
        writablePaths: [workdir],
        readOnlyPaths: readOnlyRootsFor(tool),
        environment: { HOME: workdir, TMPDIR: '/tmp', LANG: 'C.UTF-8' },
        network: tool.manifest.requiresNetwork ? 'host' : 'none',
        ...(tool.manifest.limits ? { limits: tool.manifest.limits } : {}),
        timeoutMs:
          input.timeoutMs ?? tool.manifest.defaultTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
      }
      const result = await options.runner(command)

      const run = await options.store.recordRun({
        id: newId(),
        tenantId: input.tenantId,
        toolId: tool.toolId,
        command: input.command,
        argv,
        status: result.status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        durationMs: result.durationMs,
        actor: input.actor,
        ...(gated.approval ? { approvalId: gated.approval.id } : {}),
        startedAt,
      })
      await saveTool({
        ...tool,
        lastRunAt: startedAt,
        lastError: result.status === 'completed' ? undefined : result.stderr.trim() || undefined,
      })
      await audit({
        tenantId: input.tenantId,
        toolId: tool.toolId,
        action: 'execute',
        actor: input.actor,
        message: `Ran ${tool.manifest.name}:${input.command}`,
        context: { argv, status: result.status, exitCode: result.exitCode },
      })

      return {
        outcome: 'ran',
        run,
        summary:
          result.status === 'completed'
            ? `${tool.manifest.name}:${input.command} finished.`
            : result.status === 'timeout'
              ? `${tool.manifest.name}:${input.command} was stopped after ${Math.round(command.timeoutMs / 1000)}s.`
              : `${tool.manifest.name}:${input.command} exited with code ${result.exitCode ?? 'unknown'}.`,
      }
    },

    async listApprovals(tenantId) {
      return options.store.listApprovals(tenantId)
    },

    async approve(input) {
      const approval = await options.store.getApproval(input.tenantId, input.approvalId)
      if (!approval || approval.status !== 'pending') return undefined
      const current = now()
      if (isPendingApprovalExpired(approval, current)) {
        return options.store.upsertApproval({
          ...approval,
          status: 'expired',
          decidedAt: current.toISOString(),
          decidedBy: 'system',
          decisionReason: 'The request expired before it was answered.',
        })
      }
      const policy = await policyFor(input.tenantId)
      const decided = await options.store.upsertApproval({
        ...approval,
        status: 'approved',
        decidedBy: input.decidedBy,
        decidedAt: current.toISOString(),
        ...(input.reason ? { decisionReason: input.reason } : {}),
        grantExpiresAt: new Date(current.getTime() + policy.grantTtlMs).toISOString(),
        // An install is a one-time act; an execution grant may cover a few runs.
        usesRemaining: approval.action === 'install' ? 1 : Math.max(1, policy.grantUses),
      })
      await audit({
        tenantId: input.tenantId,
        toolId: approval.toolId,
        action: 'approval_decided',
        actor: input.decidedBy,
        message: `Approved ${approval.action} for ${approval.toolId}`,
        context: {
          approvalId: approval.id,
          grantExpiresAt: decided.grantExpiresAt ?? null,
          usesRemaining: decided.usesRemaining ?? null,
        },
      })
      return decided
    },

    async deny(input) {
      const approval = await options.store.getApproval(input.tenantId, input.approvalId)
      if (!approval || approval.status !== 'pending') return undefined
      const current = now()
      const policy = await policyFor(input.tenantId)
      const decided = await options.store.upsertApproval({
        ...approval,
        status: 'denied',
        decidedBy: input.decidedBy,
        decidedAt: current.toISOString(),
        ...(input.reason ? { decisionReason: input.reason } : {}),
        // The refusal stands for as long as an approval would have.
        grantExpiresAt: new Date(current.getTime() + policy.grantTtlMs).toISOString(),
      })
      await audit({
        tenantId: input.tenantId,
        toolId: approval.toolId,
        action: 'approval_decided',
        actor: input.decidedBy,
        message: `Declined ${approval.action} for ${approval.toolId}`,
        context: { approvalId: approval.id, reason: input.reason ?? null },
      })
      return decided
    },

    async expireStale(tenantId) {
      const current = now()
      let expired = 0
      for (const approval of await options.store.listApprovals(tenantId)) {
        if (isPendingApprovalExpired(approval, current)) {
          await options.store.upsertApproval({
            ...approval,
            status: 'expired',
            decidedBy: 'system',
            decidedAt: current.toISOString(),
            decisionReason: 'The request expired before it was answered.',
          })
          expired += 1
          continue
        }
        if (approval.status === 'approved' && !isGrantUsable(approval, current)) {
          await options.store.upsertApproval({
            ...approval,
            status: spentGrantStatus(approval, current),
          })
          expired += 1
        }
      }
      return expired
    },

    async listRuns(tenantId, filter) {
      return options.store.listRuns(tenantId, filter)
    },
  }

  function readOnlyRootsFor(tool: AgentToolRecord): string[] {
    const roots = ['/usr', '/etc', '/opt']
    if (tool.installDir) roots.push(tool.installDir)
    if (tool.manifest.sourceKind === 'binary-path' && tool.manifest.binaryPath) {
      roots.push(resolve(tool.manifest.binaryPath))
    }
    return [...new Set(roots)]
  }

  return runtime
}

async function installedPackageVersion(
  installDir: string,
  packageName: string,
): Promise<string | undefined> {
  const manifestPath = join(installDir, 'node_modules', packageName, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
    const version = (parsed as { version?: unknown }).version
    return typeof version === 'string' && version.trim().length > 0 ? version : undefined
  } catch {
    // A package that ships an unreadable manifest still installed; the pinned
    // version from the tool manifest is the honest fallback.
    return undefined
  }
}

function requireAbsolute(value: string, field: string): string {
  if (!value || !isAbsolute(value)) {
    throw new AgentToolError(`${field} must be an absolute path.`)
  }
  return resolve(value)
}

function pathSegment(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new AgentToolError(`${field} must be a plain identifier; received ${JSON.stringify(value)}.`)
  }
  return value
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

/**
 * Arguments reach the executable directly — there is no shell to quote for — so
 * this rejects only what cannot survive an execve, and leaves the sandbox to be
 * the actual boundary.
 */
function validateArgv(argv: readonly string[]): string[] {
  if (argv.length > MAX_ARGUMENTS) {
    throw new AgentToolError(`At most ${MAX_ARGUMENTS} arguments are allowed.`)
  }
  return argv.map((argument, index) => {
    if (typeof argument !== 'string') {
      throw new AgentToolError(`Argument ${index} must be a string.`)
    }
    if (argument.includes('\0')) {
      throw new AgentToolError(`Argument ${index} contains a null byte.`)
    }
    if (argument.length > MAX_ARGUMENT_LENGTH) {
      throw new AgentToolError(`Argument ${index} is longer than ${MAX_ARGUMENT_LENGTH} characters.`)
    }
    return argument
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
