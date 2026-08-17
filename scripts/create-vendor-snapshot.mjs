import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const artifactRoot = join(root, '.artifacts', 'packages')
const manifestPath = join(artifactRoot, 'manifest.json')
const options = parseArguments(process.argv.slice(2))

if (!options.destination) {
  throw new Error('Usage: pnpm vendor:snapshot --destination <vendor/appkit> --packages <name,...> [--replace]')
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packages)) {
  throw new Error('Unsupported artifact manifest; run pnpm test:packages with the current AppKit tooling')
}
if (manifest.sourceDirty) {
  throw new Error('Refusing to vendor artifacts built from a dirty AppKit worktree')
}

const requested = new Set(options.packages)
const packages = manifest.packages.filter((entry) => requested.size === 0 || requested.has(entry.name))
const found = new Set(packages.map((entry) => entry.name))
const missing = [...requested].filter((name) => !found.has(name))
if (missing.length > 0) throw new Error(`Snapshot is missing requested packages: ${missing.join(', ')}`)
if (packages.length === 0) throw new Error('Snapshot selection is empty')

const destination = resolve(options.destination)
await mkdir(destination, { recursive: true })

if (options.replace) {
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tgz')) {
      await rm(join(destination, entry.name), { force: true })
    }
  }
}

const vendored = []
for (const entry of packages) {
  const source = resolve(entry.tarball)
  const filename = basename(source)
  const target = join(destination, filename)
  const bytes = await readFile(source)
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (integrity !== entry.integrity) throw new Error(`${entry.name} failed its artifact checksum`)
  await copyFile(source, target)
  vendored.push({
    name: entry.name,
    version: entry.version,
    file: filename,
    integrity,
  })
}

const vendorManifest = {
  schemaVersion: 1,
  sourceCommit: manifest.sourceCommit,
  createdAt: manifest.createdAt,
  packages: vendored,
}
await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(vendorManifest, null, 2)}\n`)
await writeFile(
  join(destination, 'overrides.json'),
  `${JSON.stringify(
    Object.fromEntries(vendored.map((entry) => [entry.name, `file:./vendor/appkit/${entry.file}`])),
    null,
    2,
  )}\n`,
)
await writeFile(
  join(destination, 'README.md'),
  `# AppKit snapshot\n\nImmutable compiled packages from AppKit commit \`${manifest.sourceCommit}\`.\n\n` +
    `Every filename is commit-qualified and every archive checksum is recorded in \`manifest.json\`. ` +
    `Regenerate this directory with \`pnpm vendor:snapshot\` from a clean, fully validated AppKit checkout.\n`,
)

console.log(
  `Vendored ${vendored.length} package(s) from ${manifest.sourceCommit} into ${destination}`,
)

function parseArguments(args) {
  const parsed = { destination: '', packages: [], replace: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--destination') {
      parsed.destination = args[index + 1] ?? ''
      index += 1
    } else if (argument === '--packages') {
      parsed.packages.push(
        ...(args[index + 1] ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
      index += 1
    } else if (argument === '--replace') {
      parsed.replace = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return parsed
}
