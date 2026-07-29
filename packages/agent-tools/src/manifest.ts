import { z } from 'zod'

/**
 * How much damage a tool can do if it misbehaves. This drives the `allow_safe`
 * policy mode and nothing else — it is a statement about the tool, not about
 * any particular invocation of it.
 */
export type AgentToolRisk = 'low' | 'medium' | 'high'

/**
 * Where the executable comes from.
 *
 * - `npm-package` — a version-pinned package installed into a directory this
 *   package owns, so a tool can be added without rebuilding the image.
 * - `binary-path` — an executable already present in the image, named so it can
 *   be catalogued, health-checked, and governed like any other tool.
 */
export type AgentToolSourceKind = 'npm-package' | 'binary-path'

/**
 * What an approved execution covers.
 *
 * - `exact-argv` (default) — the grant covers precisely the argument vector that
 *   was approved. Anything else asks again.
 * - `command` — the grant covers the named command with any arguments. Only
 *   appropriate for tools whose every invocation is equally safe.
 */
export type AgentToolApprovalScope = 'exact-argv' | 'command'

export const AGENT_TOOL_RISKS: readonly AgentToolRisk[] = ['low', 'medium', 'high']

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be lowercase kebab-case')

const argumentList = z.array(z.string().min(1).max(400)).max(24)

export const agentToolBinarySchema = z.object({
  /** The name an agent calls, e.g. `rg`. Unique within the manifest. */
  name: identifier,
  /** The executable this resolves to inside the install directory or image. */
  bin: z.string().trim().min(1).max(240),
  /** Arguments that print a version, used to record what is installed. */
  versionArgs: argumentList.optional(),
  /** Arguments that exit zero when the tool is usable. */
  healthCheckArgs: argumentList.optional(),
})

export const agentToolLimitsSchema = z.object({
  cpuSeconds: z.number().int().min(1).max(3_600).optional(),
  addressSpaceBytes: z.number().int().min(1_048_576).optional(),
  fileSizeBytes: z.number().int().min(1_024).optional(),
  processes: z.number().int().min(1).max(4_096).optional(),
  openFiles: z.number().int().min(8).max(65_536).optional(),
})

export const agentToolManifestSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2_000),
    sourceKind: z.enum(['npm-package', 'binary-path']),
    risk: z.enum(['low', 'medium', 'high']),
    /** Required for `npm-package`. */
    packageName: z.string().trim().min(1).max(240).optional(),
    /** Required for `npm-package`. An exact version, never a range. */
    packageVersion: z.string().trim().min(1).max(120).optional(),
    /** Required for `binary-path`. Must resolve inside an allowed root. */
    binaryPath: z.string().trim().min(1).max(2_000).optional(),
    docsUrl: z.string().url().optional(),
    /** Free-form labels an application can group and search on. */
    capabilities: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
    bins: z.array(agentToolBinarySchema).min(1).max(32),
    /**
     * Whether the tool needs the network when it *runs*. Installing an npm tool
     * always needs it; running one usually does not, and the default of `false`
     * means an execution is network-isolated unless the manifest says otherwise.
     */
    requiresNetwork: z.boolean().default(false),
    approvalScope: z.enum(['exact-argv', 'command']).default('exact-argv'),
    /** Kernel ceilings applied to every execution of this tool. */
    limits: agentToolLimitsSchema.optional(),
    /** Wall-clock ceiling for a single execution. */
    defaultTimeoutMs: z.number().int().min(1_000).max(900_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceKind === 'npm-package') {
      if (!value.packageName) {
        ctx.addIssue({
          code: 'custom',
          message: 'packageName is required for npm-package tools',
          path: ['packageName'],
        })
      }
      if (!value.packageVersion) {
        ctx.addIssue({
          code: 'custom',
          message: 'packageVersion is required for npm-package tools',
          path: ['packageVersion'],
        })
      } else if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.packageVersion)) {
        // A range would let the installed bytes change under an approval that
        // was granted against a specific version.
        ctx.addIssue({
          code: 'custom',
          message: 'packageVersion must be an exact semver version, not a range',
          path: ['packageVersion'],
        })
      }
    }
    if (value.sourceKind === 'binary-path' && !value.binaryPath) {
      ctx.addIssue({
        code: 'custom',
        message: 'binaryPath is required for binary-path tools',
        path: ['binaryPath'],
      })
    }
    const names = new Set<string>()
    for (const [index, bin] of value.bins.entries()) {
      if (names.has(bin.name)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate command name ${bin.name}`,
          path: ['bins', index, 'name'],
        })
      }
      names.add(bin.name)
    }
  })

export type AgentToolBinary = z.infer<typeof agentToolBinarySchema>
export type AgentToolLimits = z.infer<typeof agentToolLimitsSchema>
export type AgentToolManifest = z.infer<typeof agentToolManifestSchema>
/** A manifest as an author writes it, before defaults are applied. */
export type AgentToolManifestInput = z.input<typeof agentToolManifestSchema>

export class AgentToolError extends Error {
  override readonly name = 'AgentToolError'
}

/** Validate and normalize a manifest, applying declared defaults. */
export function defineAgentTool(manifest: AgentToolManifestInput): AgentToolManifest {
  const parsed = agentToolManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new AgentToolError(`Invalid agent tool manifest: ${detail}`)
  }
  return parsed.data
}

/**
 * Whether a tool is safe enough for the `allow_safe` policy mode: low risk and
 * unable to reach the network while it runs. A low-risk tool that phones out is
 * still a tool that phones out, so it does not qualify.
 */
export function isSafeAgentTool(manifest: AgentToolManifest): boolean {
  return manifest.risk === 'low' && !manifest.requiresNetwork
}

/** The command names a manifest declares. */
export function agentToolCommands(manifest: AgentToolManifest): string[] {
  return manifest.bins.map((bin) => bin.name)
}
