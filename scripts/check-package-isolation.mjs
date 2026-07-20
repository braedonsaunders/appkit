import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const packageDirectories = [
  'dashboard',
  'db',
  'design-studio',
  'forms-core',
  'forms-pdf',
  'notifications',
  'pdf',
  'ui',
  'workflows',
]
const errors = []

function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

function resolveSourceFile(fromFile, specifier) {
  const candidate = resolve(dirname(fromFile), specifier)
  const candidates = extname(candidate)
    ? [candidate]
    : [
        candidate,
        `${candidate}.ts`,
        `${candidate}.tsx`,
        `${candidate}.mts`,
        join(candidate, 'index.ts'),
        join(candidate, 'index.tsx'),
      ]
  return candidates.find(existsSync)
}

function rootImportClosure(entry) {
  const visited = new Set()
  const bareImports = new Set()

  function visit(file) {
    if (visited.has(file)) return
    visited.add(file)

    const source = readFileSync(file, 'utf8')
    const imports = ts.preProcessFile(source, true, true).importedFiles
    for (const imported of imports) {
      const specifier = imported.fileName
      if (specifier.startsWith('.')) {
        const resolved = resolveSourceFile(file, specifier)
        if (!resolved) errors.push(`${entry}: cannot resolve ${specifier} from ${file}`)
        else visit(resolved)
      } else if (!specifier.startsWith('node:')) {
        bareImports.add(packageName(specifier))
      }
    }
  }

  visit(entry)
  return bareImports
}

for (const directory of packageDirectories) {
  const packageRoot = join(root, 'packages', directory)
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const entry = join(packageRoot, manifest.exports['.'])
  const imports = rootImportClosure(entry)
  const dependencies = new Set(Object.keys(manifest.dependencies ?? {}))
  const requiredPeers = new Set(
    Object.keys(manifest.peerDependencies ?? {}).filter(
      (peer) => manifest.peerDependenciesMeta?.[peer]?.optional !== true,
    ),
  )
  const optionalPeers = new Set(
    Object.keys(manifest.peerDependencies ?? {}).filter(
      (peer) => manifest.peerDependenciesMeta?.[peer]?.optional === true,
    ),
  )
  const allowed = new Set([...dependencies, ...requiredPeers])

  for (const imported of imports) {
    if (optionalPeers.has(imported)) {
      errors.push(`${manifest.name} root imports optional peer ${imported}; move it to an adapter export`)
    } else if (!allowed.has(imported)) {
      errors.push(`${manifest.name} root imports undeclared package ${imported}`)
    }
  }

  console.log(`${manifest.name}: root closes over ${imports.size} declared runtime package(s)`)
}

if (errors.length > 0) {
  console.error(`\nPackage isolation check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log('\nOptional adapter peers are absent from every checked package root.')
