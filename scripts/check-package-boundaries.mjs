import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesRoot = join(root, 'packages')
const errors = []
const adapterOnlyPeerPackages = new Set([
  '@appkit/dashboard',
  '@appkit/design-studio',
  '@appkit/forms-pdf',
  '@appkit/notifications',
  '@appkit/pdf',
  '@appkit/workflows',
])
const featureMigrationPackages = new Set(['@appkit/dashboard', '@appkit/notifications'])

const packages = new Map(
  readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(packagesRoot, entry.name, 'package.json')
      if (!existsSync(path)) return null
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      return [manifest.name, { directory: entry.name, manifest, path }]
    })
    .filter(Boolean),
)

const appkitRuntimeAllowlists = {
  '@appkit/db': [],
  '@appkit/ui': ['@appkit/tokens'],
  '@appkit/forms-core': [],
  '@appkit/dashboard': ['@appkit/analytics'],
  '@appkit/notifications': [],
  '@appkit/workflows': [],
  '@appkit/design-studio': ['@appkit/tokens'],
  '@appkit/pdf': ['@appkit/tokens'],
  '@appkit/forms-pdf': ['@appkit/tokens'],
}

const forbiddenRuntimeDependencies = {
  '@appkit/db': ['@appkit/analytics', '@appkit/dashboard', '@appkit/notifications', '@appkit/ui'],
  '@appkit/ui': [
    '@appkit/analytics',
    '@tiptap/extension-link',
    '@tiptap/extension-placeholder',
    '@tiptap/react',
    '@tiptap/starter-kit',
    'react-grid-layout',
  ],
  '@appkit/forms-core': ['@appkit/email-render', '@appkit/i18n', '@appkit/tokens'],
  '@appkit/design-studio': ['fabric'],
  '@appkit/pdf': ['isomorphic-dompurify', 'puppeteer-core'],
  '@appkit/forms-pdf': ['@appkit/design-studio', '@appkit/pdf'],
}

for (const [name, { directory, manifest }] of packages) {
  const dependencies = manifest.dependencies ?? {}
  const appkitDependencies = Object.keys(dependencies).filter((dependency) => dependency.startsWith('@appkit/'))
  const allowlist = appkitRuntimeAllowlists[name]

  if (allowlist) {
    for (const dependency of appkitDependencies) {
      if (!allowlist.includes(dependency)) {
        errors.push(`${name} may not take a runtime dependency on ${dependency}`)
      }
    }
  }

  for (const dependency of forbiddenRuntimeDependencies[name] ?? []) {
    if (dependency in dependencies) {
      errors.push(`${name} must keep ${dependency} behind an optional adapter export`)
    }
  }

  for (const [dependency, metadata] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
    if (!(dependency in (manifest.peerDependencies ?? {}))) {
      errors.push(`${name} declares metadata for missing peer ${dependency}`)
    }
    if (metadata?.optional !== true) {
      errors.push(`${name} adapter peer ${dependency} must be optional`)
    }
  }

  if (adapterOnlyPeerPackages.has(name)) {
    for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[dependency]?.optional !== true) {
        errors.push(`${name} peer ${dependency} must stay optional because it belongs to an adapter export`)
      }
    }
  }

  if (featureMigrationPackages.has(name)) {
    const migrationDirectory = join(packagesRoot, directory, 'drizzle')
    const shipsMigrations = (manifest.files ?? []).includes('drizzle')
    const hasSql = existsSync(migrationDirectory)
      && readdirSync(migrationDirectory).some((file) => file.endsWith('.sql'))
    if (!shipsMigrations || !hasSql) {
      errors.push(`${name} must ship its feature-owned Drizzle migrations`)
    }
  }

  for (const [exportName, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== 'string' || exportName === './package.json') continue
    if (!existsSync(join(packagesRoot, directory, target))) {
      errors.push(`${name} export ${exportName} points to missing file ${target}`)
    }
  }
}

const runtimeGraph = new Map(
  [...packages].map(([name, { manifest }]) => [
    name,
    Object.keys(manifest.dependencies ?? {}).filter((dependency) => packages.has(dependency)),
  ]),
)
const visited = new Set()
const active = new Set()

function visit(name, path = []) {
  if (active.has(name)) {
    const start = path.indexOf(name)
    errors.push(`runtime dependency cycle: ${[...path.slice(start), name].join(' -> ')}`)
    return
  }
  if (visited.has(name)) return

  active.add(name)
  for (const dependency of runtimeGraph.get(name) ?? []) visit(dependency, [...path, name])
  active.delete(name)
  visited.add(name)
}

for (const name of runtimeGraph.keys()) visit(name)

if (errors.length > 0) {
  console.error(`Package boundary check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(`Package boundaries valid across ${packages.size} packages; runtime graph is acyclic.`)
