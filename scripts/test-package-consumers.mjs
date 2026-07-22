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
          'drizzle-orm': '^0.45.2',
          fabric: '^7.0.0',
          'lucide-react': '^1.24.0',
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
    `import assert from 'node:assert/strict'\nimport React from 'react'\nimport { renderToStaticMarkup } from 'react-dom/server'\nimport { parseFormula } from '@appkit/analytics'\nimport { color } from '@appkit/tokens'\nimport { Button } from '@appkit/ui'\nimport { emptyFormSchema, validateFormSchema } from '@appkit/forms-core'\nimport { createDesignDocument } from '@appkit/design-studio'\nimport { DesignStudioEditor } from '@appkit/design-studio/react'\nimport { ReportPaper, ReportTable, ReportTableBody, ReportTableCell, ReportTableRow } from '@appkit/reports/react'\nimport { defaultListView } from '@appkit/customization'\nimport { createMemoryListViewStore } from '@appkit/customization/memory'\n\nassert.equal(parseFormula('count()', { resolveField: () => null }).ok, true)\nassert.equal(color('primary').startsWith('rgb('), true)\nassert.equal(validateFormSchema(emptyFormSchema('Smoke')).title, 'Smoke')\nassert.match(renderToStaticMarkup(React.createElement(Button, null, 'Ready')), /Ready/)\nconst design = createDesignDocument({ name: 'Smoke', theme: { primary: '#0f766e', accent: '#d97706', paper: '#ffffff', ink: '#0f172a', muted: '#64748b' } })\nassert.match(renderToStaticMarkup(React.createElement(DesignStudioEditor, { document: design, onChange() {}, catalog: { fields: [] } })), /Smoke/)\nassert.match(renderToStaticMarkup(React.createElement(ReportPaper, { organization: 'Example', title: 'Report' }, React.createElement(ReportTable, null, React.createElement(ReportTableBody, null, React.createElement(ReportTableRow, null, React.createElement(ReportTableCell, null, 'Ready')))))), /data-report-paper/)\nconst listStore = createMemoryListViewStore({ createId: () => 'view-1' })\nconst savedView = await listStore.save({ recordType: 'vendor_bill', name: 'Mine', scope: 'user', config: defaultListView('vendor_bill'), actor: { userId: 'user-1' } })\nassert.equal((await listStore.list('vendor_bill', 'user-1'))[0]?.id, savedView.id)\n`,
  )
  await writeFile(
    join(directory, 'smoke.ts'),
    `${typePackages.map((name, index) => `import type * as Package${index} from '${name}'`).join('\n')}\nimport type { DesignStudioEditorProps } from '@appkit/design-studio/react'\nimport type { ReportDrillLoader, ReportPaperData } from '@appkit/reports'\nimport type { ReportDrillDrawerText, ReportStudioValue, StatementMatrixView } from '@appkit/reports/react'\nimport type { DrizzleListViewStoreOptions } from '@appkit/customization/drizzle'\nimport type { MemoryListViewStoreOptions } from '@appkit/customization/memory'\nimport type { PersistedListViewScope } from '@appkit/customization/persistence-schema'\n${typePackages.map((_, index) => `type PackageContract${index} = typeof Package${index}`).join('\n')}\n${typePackages.map((_, index) => `void (null as unknown as PackageContract${index})`).join('\n')}\nvoid (null as unknown as DesignStudioEditorProps)\nvoid (null as unknown as ReportPaperData)\nvoid (null as unknown as ReportDrillLoader<unknown>)\nvoid (null as unknown as ReportDrillDrawerText)\nvoid (null as unknown as ReportStudioValue)\nvoid (null as unknown as StatementMatrixView)\nvoid (null as unknown as DrizzleListViewStoreOptions)\nvoid (null as unknown as MemoryListViewStoreOptions)\nvoid (null as unknown as PersistedListViewScope)\n`,
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
