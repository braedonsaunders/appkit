import { execFile } from 'node:child_process'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const packagesArtifactRoot = join(root, '.artifacts', 'packages')
const consumersRoot = join(root, '.artifacts', 'consumers')
const artifactManifestPath = join(packagesArtifactRoot, 'manifest.json')

if (!existsSync(artifactManifestPath)) {
  throw new Error('Package tarballs are missing; run pnpm test:packages first')
}

const artifacts = JSON.parse(await readFile(artifactManifestPath, 'utf8'))
const tarballs = Object.fromEntries(artifacts.map((entry) => [entry.name, `file:${entry.tarball}`]))
await rm(consumersRoot, { recursive: true, force: true })
await mkdir(consumersRoot, { recursive: true })

await verifyNodeAndReactConsumer()
await verifyNextConsumer()
console.log('Fresh Node, React, and Next.js consumers all passed.')

async function verifyNodeAndReactConsumer() {
  const directory = join(consumersRoot, 'node-react')
  const typePackages = Object.keys(tarballs).sort()
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'appkit-packed-node-react-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...tarballs,
          react: '^19.2.7',
          'react-dom': '^19.2.7',
          typescript: '^5.9.3',
        },
        pnpm: { overrides: tarballs },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(directory, 'smoke.mjs'),
    `import assert from 'node:assert/strict'\nimport React from 'react'\nimport { renderToStaticMarkup } from 'react-dom/server'\nimport { parseFormula } from '@appkit/analytics'\nimport { color } from '@appkit/tokens'\nimport { Button } from '@appkit/ui'\nimport { emptyFormSchema, validateFormSchema } from '@appkit/forms-core'\n\nassert.equal(parseFormula('count()', { resolveField: () => null }).ok, true)\nassert.equal(color('primary').startsWith('rgb('), true)\nassert.equal(validateFormSchema(emptyFormSchema('Smoke')).title, 'Smoke')\nassert.match(renderToStaticMarkup(React.createElement(Button, null, 'Ready')), /Ready/)\n`,
  )
  await writeFile(
    join(directory, 'smoke.ts'),
    `${typePackages.map((name, index) => `import type * as Package${index} from '${name}'`).join('\n')}\n${typePackages.map((_, index) => `type PackageContract${index} = typeof Package${index}`).join('\n')}\n${typePackages.map((_, index) => `void (null as unknown as PackageContract${index})`).join('\n')}\n`,
  )
  await writeFile(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['smoke.ts'],
      },
      null,
      2,
    )}\n`,
  )

  await install(directory)
  await command('node', ['smoke.mjs'], directory)
  await command('pnpm', ['exec', 'tsc', '--noEmit'], directory)
  console.log('Packed Node + React consumer passed')
}

async function verifyNextConsumer() {
  const directory = join(consumersRoot, 'next')
  await command(
    'node',
    [join(root, 'packages/create-appkit/dist/index.js'), directory, '--yes', '--no-install', '--no-git'],
    root,
  )
  const manifestPath = join(directory, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (tarballs[name]) manifest.dependencies[name] = tarballs[name]
  }
  manifest.pnpm = { overrides: tarballs }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await install(directory)
  await command('pnpm', ['typecheck'], directory)
  await command('pnpm', ['build'], directory, 180_000)
  console.log('Packed create-appkit Next.js consumer passed')
}

async function install(directory) {
  await command('pnpm', ['install', '--ignore-workspace'], directory, 180_000)
}

async function command(executable, args, cwd, timeout = 120_000) {
  try {
    return await run(executable, args, { cwd, timeout, maxBuffer: 30 * 1024 * 1024 })
  } catch (error) {
    if (error && typeof error === 'object') {
      if ('stdout' in error && error.stdout) console.error(error.stdout)
      if ('stderr' in error && error.stderr) console.error(error.stderr)
    }
    throw error
  }
}
