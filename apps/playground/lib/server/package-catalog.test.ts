import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { PACKAGE_CATALOG, PACKAGE_CATEGORIES } from './package-catalog'

test('the demo catalog has one unique route for every workspace package manifest', async () => {
  const packagesDirectory = path.resolve(process.cwd(), '../../packages')
  const directories = await readdir(packagesDirectory, { withFileTypes: true })
  const manifestNames = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifest = JSON.parse(await readFile(path.join(packagesDirectory, entry.name, 'package.json'), 'utf8')) as { name: string }
        return manifest.name
      }),
  )

  assert.deepEqual(
    PACKAGE_CATALOG.map((item) => item.name).sort(),
    manifestNames.sort(),
  )
  assert.equal(new Set(PACKAGE_CATALOG.map((item) => item.slug)).size, PACKAGE_CATALOG.length)
  assert.equal(new Set(PACKAGE_CATEGORIES.flatMap((category) => category.names)).size, PACKAGE_CATALOG.length)
  for (const item of PACKAGE_CATALOG) {
    assert.match(item.demoHref, /^\/[^#]+$/, `${item.name} must have an internal demo route`)
    assert.notEqual(item.demoHref, `/packages/${item.slug}`, `${item.name} demo must not reload its detail page`)
  }
})

test('server-oriented packages use dedicated, package-specific demos', () => {
  for (const slug of [
    'crypto',
    'email-render',
    'emails',
    'jobs',
    'mailbox',
    'office',
    'process-sandbox',
    'scene',
    'superadmin',
    'sms',
    'telephony',
    'voice',
  ]) {
    const item = PACKAGE_CATALOG.find((candidate) => candidate.slug === slug)
    assert.equal(item?.demoHref, `/packages/${slug}/demo`)
  }
})
