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
          '@xyflow/react': '^12.10.0',
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
    `import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseFormula } from '@appkit/analytics'
import { color } from '@appkit/tokens'
import { Button, PagedTable, PromptRoot, SubtabNav } from '@appkit/ui'
import { emptyFormSchema, validateFormSchema } from '@appkit/forms-core'
import { createDesignDocument } from '@appkit/design-studio'
import { DesignStudioEditor } from '@appkit/design-studio/react'
import { ReportPaper, ReportTable, ReportTableBody, ReportTableCell, ReportTableRow } from '@appkit/reports/react'
import { defaultListView } from '@appkit/customization'
import { createMemoryListViewStore } from '@appkit/customization/memory'
import { createMemoryAttachmentAdapter } from '@appkit/storage/memory'
import { AttachmentPanel } from '@appkit/storage/react'
import { createMemoryRecordApprovalAdapter } from '@appkit/workflows'
import { ApprovalActions, ApprovalHistory, RecordApprovalProvider } from '@appkit/workflows/approval-react'

assert.equal(parseFormula('count()', { resolveField: () => null }).ok, true)
assert.equal(color('primary').startsWith('rgb('), true)
assert.equal(validateFormSchema(emptyFormSchema('Smoke')).title, 'Smoke')
assert.match(renderToStaticMarkup(React.createElement(Button, null, 'Ready')), /Ready/)
const design = createDesignDocument({ name: 'Smoke', theme: { primary: '#0f766e', accent: '#d97706', paper: '#ffffff', ink: '#0f172a', muted: '#64748b' } })
assert.match(renderToStaticMarkup(React.createElement(DesignStudioEditor, { document: design, onChange() {}, catalog: { fields: [] } })), /Smoke/)
assert.match(renderToStaticMarkup(React.createElement(ReportPaper, { organization: 'Example', title: 'Report' }, React.createElement(ReportTable, null, React.createElement(ReportTableBody, null, React.createElement(ReportTableRow, null, React.createElement(ReportTableCell, null, 'Ready')))))), /data-report-paper/)
assert.match(renderToStaticMarkup(React.createElement(PagedTable, { rows: [{ id: '1', name: 'Ready' }], columns: [{ key: 'name', header: 'Name', cell: row => row.name }], empty: 'Empty', rowKey: row => row.id })), /Ready/)
assert.match(renderToStaticMarkup(React.createElement(SubtabNav, { tabs: [{ key: 'details', label: 'Details' }], active: 'details' })), /aria-selected="true"/)
assert.equal(renderToStaticMarkup(React.createElement(PromptRoot)), '')
const approvalAdapter = createMemoryRecordApprovalAdapter()
assert.equal(renderToStaticMarkup(React.createElement(RecordApprovalProvider, { adapter: approvalAdapter }, React.createElement(React.Fragment, null, React.createElement(ApprovalActions, { subjectKind: 'record', subjectId: 'one' }), React.createElement(ApprovalHistory, { subjectKind: 'record', subjectId: 'one' })))), '')
const attachmentAdapter = createMemoryAttachmentAdapter()
assert.match(renderToStaticMarkup(React.createElement(AttachmentPanel, { targetTable: 'records', targetId: 'one', canEdit: true, adapter: attachmentAdapter })), /Attachments/)
const listStore = createMemoryListViewStore({ createId: () => 'view-1' })
const savedView = await listStore.save({ recordType: 'vendor_bill', name: 'Mine', scope: 'user', config: defaultListView('vendor_bill'), actor: { userId: 'user-1' } })
assert.equal((await listStore.list('vendor_bill', 'user-1'))[0]?.id, savedView.id)
`,
  )
  await writeFile(
    join(directory, 'smoke.ts'),
    `${typePackages.map((name, index) => `import type * as Package${index} from '${name}'`).join('\n')}
import type { PagedColumn, SubtabNavProps } from '@appkit/ui'
import type { AttachmentPanelProps } from '@appkit/storage/react'
import type { MemoryAttachmentAdapterOptions } from '@appkit/storage/memory'
import type { DesignStudioEditorProps } from '@appkit/design-studio/react'
import type { ReportDrillLoader, ReportPaperData } from '@appkit/reports'
import type { ReportDrillDrawerText, ReportStudioValue, StatementMatrixView } from '@appkit/reports/react'
import type { DrizzleListViewStoreOptions } from '@appkit/customization/drizzle'
import type { MemoryListViewStoreOptions } from '@appkit/customization/memory'
import type { PersistedListViewScope } from '@appkit/customization/persistence-schema'
import type { PromptDialogOptions } from '@appkit/ui'
import type { RecordApprovalAdapter, RecordApprovalState } from '@appkit/workflows'
import type { ApprovalActionsProps, ApprovalHistoryProps, RecordApprovalProviderProps } from '@appkit/workflows/approval-react'
${typePackages.map((_, index) => `type PackageContract${index} = typeof Package${index}`).join('\n')}
${typePackages.map((_, index) => `void (null as unknown as PackageContract${index})`).join('\n')}
void (null as unknown as PagedColumn<{ id: string }>)
void (null as unknown as SubtabNavProps)
void (null as unknown as AttachmentPanelProps)
void (null as unknown as MemoryAttachmentAdapterOptions)
void (null as unknown as DesignStudioEditorProps)
void (null as unknown as ReportPaperData)
void (null as unknown as ReportDrillLoader<unknown>)
void (null as unknown as ReportDrillDrawerText)
void (null as unknown as ReportStudioValue)
void (null as unknown as StatementMatrixView)
void (null as unknown as DrizzleListViewStoreOptions)
void (null as unknown as MemoryListViewStoreOptions)
void (null as unknown as PersistedListViewScope)
void (null as unknown as PromptDialogOptions)
void (null as unknown as RecordApprovalAdapter)
void (null as unknown as RecordApprovalState)
void (null as unknown as ApprovalActionsProps)
void (null as unknown as ApprovalHistoryProps)
void (null as unknown as RecordApprovalProviderProps)
`,
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
