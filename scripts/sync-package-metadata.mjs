import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesRoot = join(root, 'packages')
const directories = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const directory of directories) {
  const path = join(packagesRoot, directory, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  manifest.author ??= 'Braedon Saunders'
  manifest.license ??= 'AGPL-3.0-or-later'
  manifest.repository = {
    type: 'git',
    url: 'git+https://github.com/braedonsaunders/appkit.git',
    directory: `packages/${directory}`,
  }
  manifest.homepage = `https://github.com/braedonsaunders/appkit/tree/main/packages/${directory}#readme`
  manifest.bugs = { url: 'https://github.com/braedonsaunders/appkit/issues' }
  manifest.engines = { node: '>=22' }
  manifest.keywords = [...new Set([...(manifest.keywords ?? []), 'appkit', 'typescript', 'application-framework'])].sort()
  manifest.publishConfig = {
    access: 'public',
    directory: 'dist',
    linkDirectory: false,
    provenance: true,
  }
  manifest.scripts = {
    ...(manifest.scripts ?? {}),
    build: 'node ../../scripts/build-package.mjs',
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

console.log(`Synchronized publish metadata across ${directories.length} packages.`)
