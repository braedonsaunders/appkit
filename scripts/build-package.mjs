import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const packageRoot = process.cwd()
const repositoryRoot = resolve(import.meta.dirname, '..')
const packagesRoot = join(repositoryRoot, 'packages')

if (!packageRoot.startsWith(`${packagesRoot}${sep}`)) {
  throw new Error('build-package must run from an AppKit package directory')
}

const manifestPath = join(packageRoot, 'package.json')
const tsconfigPath = join(packageRoot, 'tsconfig.json')
const sourceRoot = join(packageRoot, 'src')
const outputRoot = join(packageRoot, 'dist')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

if (existsSync(tsconfigPath)) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) failDiagnostics([configFile.error])

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot)
  const rootNames = parsed.fileNames.filter((file) => !isTestFile(file))
  const options = {
    ...parsed.options,
    declaration: true,
    declarationMap: true,
    incremental: false,
    inlineSources: true,
    noEmit: false,
    outDir: outputRoot,
    rootDir: sourceRoot,
    sourceMap: true,
    tsBuildInfoFile: undefined,
  }
  const program = ts.createProgram({ rootNames, options })
  const result = program.emit()
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]
  if (diagnostics.length > 0) failDiagnostics(diagnostics)
}

await copyStaticSourceFiles(sourceRoot, outputRoot)
await rewriteEmittedSpecifiers(outputRoot)
await copyPublishedAssets()
await writePublishedManifest()
await assertPublishDirectory()

console.log(`${manifest.name}: built publish directory`)

function isTestFile(file) {
  const normalized = file.split(sep).join('/')
  return /(?:^|\/)(?:__tests__\/|.*\.(?:test|spec)\.[cm]?[jt]sx?$)/.test(normalized)
}

function failDiagnostics(diagnostics) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => packageRoot,
      getNewLine: () => '\n',
    }),
  )
  process.exit(1)
}

async function walk(directory) {
  if (!existsSync(directory)) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

async function copyStaticSourceFiles(from, to) {
  for (const file of await walk(from)) {
    if (/\.[cm]?[jt]sx?$/.test(file) || isTestFile(file)) continue
    const target = join(to, relative(from, file))
    await mkdir(dirname(target), { recursive: true })
    let content = await readFile(file)
    if (extname(file) === '.css') {
      content = Buffer.from(
        content.toString('utf8').replaceAll("@source '../src';", "@source './';"),
      )
    }
    await writeFile(target, content)
  }
}

async function rewriteEmittedSpecifiers(directory) {
  for (const file of await walk(directory)) {
    if (!/\.(?:js|d\.ts)$/.test(file)) continue
    const source = await readFile(file, 'utf8')
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    )
    const replacements = []

    const visit = (node) => {
      if (ts.isStringLiteral(node) && isModuleSpecifier(node) && node.text.startsWith('.')) {
        const next = resolveRelativeSpecifier(file, node.text)
        if (next !== node.text) {
          replacements.push({ start: node.getStart(sourceFile) + 1, end: node.getEnd() - 1, next })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    if (replacements.length === 0) continue
    let output = source
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      output = `${output.slice(0, replacement.start)}${replacement.next}${output.slice(replacement.end)}`
    }
    await writeFile(file, output)
  }
}

function isModuleSpecifier(node) {
  const parent = node.parent
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  )
}

function resolveRelativeSpecifier(fromFile, specifier) {
  if (extname(specifier)) return specifier
  const base = resolve(dirname(fromFile), specifier)
  if (existsSync(`${base}.js`)) return `${specifier}.js`
  if (existsSync(join(base, 'index.js'))) return `${specifier.replace(/\/$/, '')}/index.js`
  return specifier
}

async function copyPublishedAssets() {
  const drizzle = join(packageRoot, 'drizzle')
  if (existsSync(drizzle)) await cp(drizzle, join(outputRoot, 'drizzle'), { recursive: true })

  const packageReadme = join(packageRoot, 'README.md')
  if (existsSync(packageReadme)) await copyFile(packageReadme, join(outputRoot, 'README.md'))
  else {
    const title = manifest.name
    const description = manifest.description ?? 'A modular AppKit package.'
    await writeFile(
      join(outputRoot, 'README.md'),
      `# ${title}\n\n${description}\n\n## Install\n\n\`\`\`bash\npnpm add ${title}\n\`\`\`\n\nSee the [AppKit documentation](https://github.com/braedonsaunders/appkit#readme) for package composition, optional adapters, and production guidance.\n`,
    )
  }
  await copyFile(join(repositoryRoot, 'LICENSE'), join(outputRoot, 'LICENSE'))
}

async function writePublishedManifest() {
  const published = structuredClone(manifest)
  published.exports = Object.fromEntries(
    Object.entries(manifest.exports ?? {}).map(([subpath, target]) => [
      subpath,
      publishedExport(target),
    ]),
  )
  const rootExport = published.exports['.']
  published.main = typeof rootExport === 'string' ? rootExport : rootExport.import
  published.types = typeof rootExport === 'string' ? undefined : rootExport.types
  published.dependencies = publishedDependencies(manifest.dependencies)
  published.optionalDependencies = publishedDependencies(manifest.optionalDependencies)
  published.peerDependencies = publishedDependencies(manifest.peerDependencies)
  if (manifest.bin) {
    published.bin = Object.fromEntries(
      Object.entries(manifest.bin).map(([name, target]) => [
        name,
        target.replace(/^\.\/dist\//, './').replace(/^\.\/src\//, './'),
      ]),
    )
  }
  delete published.devDependencies
  delete published.files
  delete published.publishConfig
  delete published.scripts

  await writeFile(join(outputRoot, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)
  for (const target of Object.values(published.bin ?? {})) {
    const path = join(outputRoot, target)
    if (existsSync(path)) await chmod(path, 0o755)
  }
}

function publishedExport(target) {
  if (typeof target !== 'string') throw new Error(`${manifest.name} has an unsupported export target`)
  if (target === './package.json') return target
  if (target.endsWith('.css')) return `./${basename(target)}`
  const sourceRelative = target.replace(/^\.\/src\//, '').replace(/\.(?:tsx?|mts)$/, '')
  return {
    types: `./${sourceRelative}.d.ts`,
    import: `./${sourceRelative}.js`,
    default: `./${sourceRelative}.js`,
  }
}

function publishedDependencies(dependencies) {
  if (!dependencies) return dependencies
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith('workspace:')) return [name, range]
      const packageDirectory = name.replace(/^@appkit\//, '')
      const dependencyManifestPath = join(packagesRoot, packageDirectory, 'package.json')
      if (!existsSync(dependencyManifestPath)) {
        throw new Error(`${manifest.name} references missing workspace package ${name}`)
      }
      const dependencyManifest = JSON.parse(ts.sys.readFile(dependencyManifestPath) ?? '{}')
      const requested = range.slice('workspace:'.length)
      if (requested === '*' || requested === '^') return [name, `^${dependencyManifest.version}`]
      if (requested === '~') return [name, `~${dependencyManifest.version}`]
      return [name, requested]
    }),
  )
}

async function assertPublishDirectory() {
  const files = await walk(outputRoot)
  const relativeFiles = files.map((file) => relative(outputRoot, file).split(sep).join('/'))
  const tests = relativeFiles.filter(isTestFile)
  if (tests.length > 0) throw new Error(`${manifest.name} emitted tests: ${tests.join(', ')}`)

  const published = JSON.parse(await readFile(join(outputRoot, 'package.json'), 'utf8'))
  for (const [subpath, target] of Object.entries(published.exports ?? {})) {
    const values = typeof target === 'string' ? [target] : Object.values(target)
    for (const value of values) {
      const path = join(outputRoot, value)
      if (!existsSync(path)) throw new Error(`${manifest.name} export ${subpath} is missing ${value}`)
    }
  }

  for (const file of files.filter((candidate) => candidate.endsWith('.js'))) {
    const source = await readFile(file, 'utf8')
    if (/\b(?:from|import)\s*\(?\s*['"]\.\.?\/[^'"]+(?<!\.js)['"]/.test(source)) {
      throw new Error(`${manifest.name} emitted an extensionless ESM import in ${relative(outputRoot, file)}`)
    }
  }

  const packageStats = await stat(join(outputRoot, 'package.json'))
  if (packageStats.size === 0) throw new Error(`${manifest.name} emitted an empty package manifest`)
}
