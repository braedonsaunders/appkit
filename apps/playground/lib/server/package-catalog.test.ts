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
})
