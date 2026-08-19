import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const internalPackagePrefix = '@braedonsaunders/appkit-'

export function packageRequest(name, range) {
  return `${name}@${range}`
}

export async function auditRegistryDependencyClosure(roots, loadManifest) {
  const queue = roots.map((root) => ({ ...root, path: [packageRequest(root.name, root.range)] }))
  const visited = new Map()

  while (queue.length > 0) {
    const request = queue.shift()
    const key = packageRequest(request.name, request.range)
    if (visited.has(key)) continue

    let manifest
    try {
      manifest = await loadManifest(request.name, request.range)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Registry dependency is unavailable through ${request.path.join(' -> ')}: ${detail}`)
    }
    if (!manifest || manifest.name !== request.name || typeof manifest.version !== 'string') {
      throw new Error(`Registry returned an invalid manifest for ${key} through ${request.path.join(' -> ')}`)
    }

    visited.set(key, manifest)
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!name.startsWith(internalPackagePrefix) || typeof range !== 'string') continue
      queue.push({ name, range, path: [...request.path, packageRequest(name, range)] })
    }
  }

  return visited
}

export async function loadNpmManifest(name, range) {
  const request = packageRequest(name, range)
  let stdout
  try {
    ;({ stdout } = await run('npm', ['view', request, 'name', 'version', 'dependencies', '--json'], {
      maxBuffer: 10 * 1024 * 1024,
    }))
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter(Boolean).join('\n').trim()
    throw new Error(output || `npm view failed for ${request}`)
  }

  const result = JSON.parse(stdout)
  const manifests = Array.isArray(result) ? result : [result]
  const manifest = manifests.at(-1)
  if (!manifest) throw new Error(`npm returned no matching version for ${request}`)
  return manifest
}
