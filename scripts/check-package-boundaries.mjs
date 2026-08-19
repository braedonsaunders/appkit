import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesRoot = join(root, 'packages')
const errors = []
const adapterOnlyPeerPackages = new Set([
  '@braedonsaunders/appkit-dashboard',
  '@braedonsaunders/appkit-design-studio',
  '@braedonsaunders/appkit-forms-pdf',
  '@braedonsaunders/appkit-integrations',
  '@braedonsaunders/appkit-notifications',
  '@braedonsaunders/appkit-pdf',
  '@braedonsaunders/appkit-workflows',
  '@braedonsaunders/appkit-sync',
])
const featureMigrationPackages = new Set(['@braedonsaunders/appkit-dashboard', '@braedonsaunders/appkit-integrations', '@braedonsaunders/appkit-notifications', '@braedonsaunders/appkit-sync', '@braedonsaunders/appkit-workflows'])

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
  '@braedonsaunders/appkit-db': [],
  '@braedonsaunders/appkit-ui': ['@braedonsaunders/appkit-tokens'],
  '@braedonsaunders/appkit-forms-core': ['@braedonsaunders/appkit-i18n'],
  '@braedonsaunders/appkit-dashboard': ['@braedonsaunders/appkit-analytics'],
  '@braedonsaunders/appkit-notifications': [],
  '@braedonsaunders/appkit-workflows': [],
  '@braedonsaunders/appkit-sync': ['@braedonsaunders/appkit-egress-proxy'],
  '@braedonsaunders/appkit-integrations': [],
  '@braedonsaunders/appkit-design-studio': ['@braedonsaunders/appkit-tokens'],
  '@braedonsaunders/appkit-pdf': ['@braedonsaunders/appkit-tokens'],
  '@braedonsaunders/appkit-forms-pdf': ['@braedonsaunders/appkit-tokens'],
}

const forbiddenRuntimeDependencies = {
  '@braedonsaunders/appkit-db': ['@braedonsaunders/appkit-analytics', '@braedonsaunders/appkit-dashboard', '@braedonsaunders/appkit-notifications', '@braedonsaunders/appkit-ui'],
  '@braedonsaunders/appkit-ui': [
    '@braedonsaunders/appkit-analytics',
    '@tiptap/extension-link',
    '@tiptap/extension-placeholder',
    '@tiptap/react',
    '@tiptap/starter-kit',
    'react-grid-layout',
  ],
  '@braedonsaunders/appkit-forms-core': ['@braedonsaunders/appkit-email-render', '@braedonsaunders/appkit-tokens'],
  '@braedonsaunders/appkit-design-studio': ['fabric'],
  '@braedonsaunders/appkit-pdf': ['isomorphic-dompurify', 'puppeteer-core'],
  '@braedonsaunders/appkit-forms-pdf': ['@braedonsaunders/appkit-design-studio', '@braedonsaunders/appkit-pdf'],
}

for (const [name, { directory, manifest }] of packages) {
  const dependencies = manifest.dependencies ?? {}
  const appkitDependencies = Object.keys(dependencies).filter((dependency) => dependency.startsWith('@braedonsaunders/appkit-'))
  const allowlist = appkitRuntimeAllowlists[name]

  if (manifest.scripts?.build !== 'node ../../scripts/build-package.mjs') {
    errors.push(`${name} must build its publish directory with the shared package compiler`)
  }
  if (
    manifest.publishConfig?.directory !== 'dist'
    || manifest.publishConfig?.linkDirectory !== false
    || manifest.publishConfig?.access !== 'public'
    || manifest.publishConfig?.provenance !== true
  ) {
    errors.push(`${name} must publish the provenance-enabled dist directory as a public package`)
  }
  if (!manifest.repository?.url || manifest.repository.directory !== `packages/${directory}`) {
    errors.push(`${name} must identify its package directory in the AppKit repository`)
  }
  if (manifest.license !== 'AGPL-3.0-or-later') {
    errors.push(`${name} must declare the repository license`)
  }

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
