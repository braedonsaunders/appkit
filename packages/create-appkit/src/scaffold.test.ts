import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readGeneratedPackage, scaffoldProject } from './scaffold'

test('scaffolds a complete AppKit Next application without performing external actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-appkit-'))
  const target = join(root, 'field-ops')
  try {
    const result = await scaffoldProject({
      directory: target,
      features: ['forms', 'tenancy'],
      install: false,
      initializeGit: false,
    })
    assert.equal(result.directory, target)
    assert.deepEqual(result.packages, [
      '@braedonsaunders/appkit-tokens',
      '@braedonsaunders/appkit-ui',
      '@braedonsaunders/appkit-editor',
      '@braedonsaunders/appkit-forms',
      '@braedonsaunders/appkit-forms-core',
      '@braedonsaunders/appkit-i18n',
      '@braedonsaunders/appkit-db',
      '@braedonsaunders/appkit-tenant',
    ])
    const manifest = await readGeneratedPackage(target)
    const dependencies = manifest.dependencies as Record<string, string>
    assert.equal(dependencies['@braedonsaunders/appkit-forms'], 'latest')
    assert.equal(dependencies['@braedonsaunders/appkit-db'], 'latest')
    assert.match(await readFile(join(target, 'src/components/app-frame.tsx'), 'utf8'), /UiLinkProvider/)
    assert.match(await readFile(join(target, 'src/components/app-frame.tsx'), 'utf8'), /PageTransition/)
    assert.match(await readFile(join(target, 'src/app/layout.tsx'), 'utf8'), /getThemeScript/)
    assert.match(await readFile(join(target, 'src/app/layout.tsx'), 'utf8'), /<PromptRoot \/>/)
    assert.match(await readFile(join(target, 'src/app/layout.tsx'), 'utf8'), /<ConfirmRoot \/>/)
    const styles = await readFile(join(target, 'src/app/globals.css'), 'utf8')
    assert.match(styles, /@braedonsaunders\/appkit-ui\/styles\.css/)
    assert.match(styles, /@braedonsaunders\/appkit-forms\/styles\.css/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refuses to overwrite a non-empty target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-appkit-conflict-'))
  try {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'keep.txt'), 'user data')
    await assert.rejects(
      scaffoldProject({ directory: root, install: false, initializeGit: false }),
      /not empty/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('identity capability installs the complete optional IAM stack', async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-appkit-identity-'))
  const target = join(root, 'workspace')
  try {
    const result = await scaffoldProject({
      directory: target,
      features: ['identity'],
      install: false,
      initializeGit: false,
    })
    assert.deepEqual(result.packages, [
      '@braedonsaunders/appkit-tokens',
      '@braedonsaunders/appkit-ui',
      '@braedonsaunders/appkit-auth',
      '@braedonsaunders/appkit-db',
      '@braedonsaunders/appkit-iam',
      '@braedonsaunders/appkit-tenant',
    ])
    const manifest = await readGeneratedPackage(target)
    const dependencies = manifest.dependencies as Record<string, string>
    assert.equal(dependencies['@braedonsaunders/appkit-iam'], 'latest')
    assert.equal(dependencies['drizzle-orm'], '^0.45.2')
    assert.equal(dependencies.pg, '^8.13.1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('storage capability installs the object runtime and attachment workspace package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-appkit-storage-'))
  const target = join(root, 'workspace')
  try {
    const result = await scaffoldProject({
      directory: target,
      features: ['storage'],
      install: false,
      initializeGit: false,
    })
    assert.deepEqual(result.packages, ['@braedonsaunders/appkit-tokens', '@braedonsaunders/appkit-ui', '@braedonsaunders/appkit-storage'])
    const manifest = await readGeneratedPackage(target)
    const dependencies = manifest.dependencies as Record<string, string>
    assert.equal(dependencies['@braedonsaunders/appkit-storage'], 'latest')
    assert.match(await readFile(join(target, 'src/app/globals.css'), 'utf8'), /@braedonsaunders\/appkit-storage\/styles\.css/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('extensions capability includes the governed query console and its styles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'create-appkit-extensions-'))
  const target = join(root, 'workspace')
  try {
    const result = await scaffoldProject({
      directory: target,
      features: ['extensions'],
      install: false,
      initializeGit: false,
    })
    assert.ok(result.packages.includes('@braedonsaunders/appkit-query-console'))
    const manifest = await readGeneratedPackage(target)
    const dependencies = manifest.dependencies as Record<string, string>
    assert.equal(dependencies['@braedonsaunders/appkit-query-console'], 'latest')
    assert.match(
      await readFile(join(target, 'src/app/globals.css'), 'utf8'),
      /@braedonsaunders\/appkit-query-console\/styles\.css/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
