import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRegistryDependencyClosure, loadNpmManifest } from './registry-dependency-closure.mjs'
import { releasePriorityPackageNames } from './publish-order.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(root, 'packages')
const excludedNonConsumerPackages = new Set(['@braedonsaunders/appkit-sync'])
const packageManifests = new Map()

for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifest = JSON.parse(await readFile(join(packagesRoot, entry.name, 'package.json'), 'utf8'))
  packageManifests.set(manifest.name, manifest)
}

const roots = releasePriorityPackageNames
  .filter((name) => !excludedNonConsumerPackages.has(name))
  .map((name) => {
    const manifest = packageManifests.get(name)
    if (!manifest) throw new Error(`Release-priority package ${name} has no local manifest`)
    return { name, range: manifest.version }
  })

const manifests = await auditRegistryDependencyClosure(roots, loadNpmManifest)
console.log(`Registry dependency closure passed for ${roots.length} consumer roots and ${manifests.size} exact dependency requests.`)
