import { AgentToolError, type AgentToolManifest } from './manifest'

/**
 * One package the base image must contain, traced back to the tool that
 * declared it so a conflict or a removal can be attributed.
 */
export interface ImageManifestPackage {
  name: string
  version: string
  toolId: string
}

/**
 * Everything a golden base image must contain to satisfy a set of tool
 * manifests. Plain JSON-able data, deterministically ordered, so two builds
 * from the same shelf produce byte-identical input regardless of the order
 * the manifests arrived in.
 */
export interface ImageManifest {
  aptPackages: ImageManifestPackage[]
  npmPackages: ImageManifestPackage[]
  binaryPaths: string[]
}

/**
 * Fold a set of tool manifests into base-image build input.
 *
 * Two tools may pin the same package at the same version — the image only
 * contains it once, attributed to the lexicographically-first tool id so
 * attribution is order-independent. Two tools pinning the same package at
 * *different* versions is a contradiction the image cannot satisfy, so it
 * throws rather than letting one pin silently win.
 */
export function imageManifest(tools: readonly AgentToolManifest[]): ImageManifest {
  const seenToolIds = new Set<string>()
  const aptPackages = new Map<string, ImageManifestPackage>()
  const npmPackages = new Map<string, ImageManifestPackage>()
  const binaryPaths = new Set<string>()

  for (const tool of tools) {
    if (seenToolIds.has(tool.id)) {
      throw new AgentToolError(`Two manifests share the tool id ${tool.id}.`)
    }
    seenToolIds.add(tool.id)

    switch (tool.sourceKind) {
      case 'apt-package':
        addPackage(aptPackages, 'apt', {
          name: requirePin(tool, tool.aptPackage, 'aptPackage'),
          version: requirePin(tool, tool.aptVersion, 'aptVersion'),
          toolId: tool.id,
        })
        break
      case 'npm-package':
        addPackage(npmPackages, 'npm', {
          name: requirePin(tool, tool.packageName, 'packageName'),
          version: requirePin(tool, tool.packageVersion, 'packageVersion'),
          toolId: tool.id,
        })
        break
      case 'binary-path':
        binaryPaths.add(requirePin(tool, tool.binaryPath, 'binaryPath'))
        break
    }
  }

  return {
    aptPackages: sortedPackages(aptPackages),
    npmPackages: sortedPackages(npmPackages),
    binaryPaths: [...binaryPaths].sort((left, right) => left.localeCompare(right)),
  }
}

/**
 * The `apt-get install` fragment for a Dockerfile `RUN` or an mmdebstrap
 * hook: every apt-pinned tool, exactly versioned, sorted one per line so the
 * fragment diffs cleanly between image builds. Empty when no tool needs apt.
 */
export function renderAptInstallFragment(tools: readonly AgentToolManifest[]): string {
  const { aptPackages } = imageManifest(tools)
  if (aptPackages.length === 0) return ''
  const lines = aptPackages.map((entry) => `  ${entry.name}=${entry.version}`)
  return `apt-get install -y --no-install-recommends \\\n${lines.join(' \\\n')}`
}

function addPackage(
  bucket: Map<string, ImageManifestPackage>,
  ecosystem: 'apt' | 'npm',
  entry: ImageManifestPackage,
): void {
  const existing = bucket.get(entry.name)
  if (!existing) {
    bucket.set(entry.name, entry)
    return
  }
  if (existing.version !== entry.version) {
    throw new AgentToolError(
      `Conflicting pins for ${ecosystem} package ${entry.name}: ` +
        `${existing.version} (tool ${existing.toolId}) vs ${entry.version} (tool ${entry.toolId}).`,
    )
  }
  // Same package, same version: keep the entry whose tool id sorts first so
  // the attribution does not depend on input order.
  if (entry.toolId.localeCompare(existing.toolId) < 0) {
    bucket.set(entry.name, entry)
  }
}

function sortedPackages(bucket: Map<string, ImageManifestPackage>): ImageManifestPackage[] {
  return [...bucket.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function requirePin(tool: AgentToolManifest, value: string | undefined, field: string): string {
  // `defineAgentTool` guarantees these; this guards manifests that skipped it.
  if (!value) {
    throw new AgentToolError(`${tool.id} is missing ${field}. Validate it with defineAgentTool first.`)
  }
  return value
}
