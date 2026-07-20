import { execFile } from 'node:child_process'
import { readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const packagesRoot = join(root, 'packages')
const outputRoot = join(root, '.artifacts', 'packages')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const directories = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && existsSync(join(packagesRoot, entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort()

const packed = []
for (const directory of directories) {
  const packageRoot = join(packagesRoot, directory)
  const sourceManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (!existsSync(join(packageRoot, 'dist', 'package.json'))) {
    throw new Error(`${sourceManifest.name} is not built; run pnpm build:packages first`)
  }

  const filename = `${sourceManifest.name.replace('@', '').replace('/', '-')}-${sourceManifest.version}.tgz`
  const tarball = join(outputRoot, filename)
  await run('pnpm', ['pack', '--out', tarball], { cwd: packageRoot, maxBuffer: 10 * 1024 * 1024 })
  const { stdout } = await run('tar', ['-tzf', tarball], { maxBuffer: 20 * 1024 * 1024 })
  const files = stdout.trim().split('\n').filter(Boolean)
  const packageJsonPath = files.find((file) => file.endsWith('/package.json'))
  if (!packageJsonPath) throw new Error(`${sourceManifest.name} tarball has no package.json`)
  const manifestText = (await run('tar', ['-xOf', tarball, packageJsonPath], { maxBuffer: 5 * 1024 * 1024 })).stdout
  const manifest = JSON.parse(manifestText)

  assertTarball(sourceManifest.name, manifest, files)
  packed.push({ name: manifest.name, version: manifest.version, tarball, files: files.length })
  console.log(`${manifest.name}: ${files.length} publish file(s), clean tarball`)
}

await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(packed, null, 2)}\n`)
console.log(`Verified ${packed.length} publish tarballs in ${outputRoot}`)

function assertTarball(name, manifest, files) {
  const normalized = files.map((file) => file.replace(/^package\//, ''))
  const forbidden = normalized.filter(
    (file) =>
      file.startsWith('src/') ||
      /(?:^|\/).*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
      /(?:^|\/)__tests__\//.test(file) ||
      (/\.[cm]?tsx?$/.test(file) && !file.endsWith('.d.ts')),
  )
  if (forbidden.length > 0) throw new Error(`${name} ships development sources: ${forbidden.join(', ')}`)
  for (const required of ['README.md', 'LICENSE', 'package.json']) {
    if (!normalized.includes(required)) throw new Error(`${name} tarball is missing ${required}`)
  }
  if (JSON.stringify(manifest).includes('workspace:')) throw new Error(`${name} publishes workspace protocol ranges`)
  if (manifest.devDependencies) throw new Error(`${name} publishes devDependencies`)
  if (manifest.publishConfig?.directory) throw new Error(`${name} publishes its workspace-only directory config`)

  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const targets = typeof target === 'string' ? [target] : Object.values(target)
    for (const value of targets) {
      if (!normalized.includes(value.replace(/^\.\//, ''))) {
        throw new Error(`${name} export ${subpath} points to missing ${value}`)
      }
    }
  }
}
