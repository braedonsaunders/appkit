import assert from 'node:assert/strict'
import test from 'node:test'
import { auditRegistryDependencyClosure } from './registry-dependency-closure.mjs'

test('follows regular internal dependencies recursively and reports the failing path', async () => {
  const manifests = new Map([
    ['@braedonsaunders/appkit-ai@1.0.3', {
      name: '@braedonsaunders/appkit-ai',
      version: '1.0.3',
      dependencies: { '@braedonsaunders/appkit-egress-proxy': '^0.1.1' },
    }],
  ])

  await assert.rejects(
    auditRegistryDependencyClosure(
      [{ name: '@braedonsaunders/appkit-ai', range: '1.0.3' }],
      async (name, range) => {
        const request = `${name}@${range}`
        const manifest = manifests.get(request)
        if (!manifest) throw new Error(`missing ${request}`)
        return manifest
      },
    ),
    /appkit-ai@1\.0\.3 -> @braedonsaunders\/appkit-egress-proxy@\^0\.1\.1.*missing/,
  )
})

test('ignores peer, optional, and development dependencies', async () => {
  const loaded = []
  const manifests = await auditRegistryDependencyClosure(
    [{ name: '@braedonsaunders/appkit-forms-pdf', range: '1.0.0' }],
    async (name, range) => {
      loaded.push(`${name}@${range}`)
      return {
        name,
        version: '1.0.0',
        peerDependencies: { '@braedonsaunders/appkit-sync': '^1.1.0' },
        optionalDependencies: { '@braedonsaunders/appkit-sync': '^1.1.0' },
        devDependencies: { '@braedonsaunders/appkit-sync': 'workspace:*' },
      }
    },
  )

  assert.deepEqual(loaded, ['@braedonsaunders/appkit-forms-pdf@1.0.0'])
  assert.equal(manifests.size, 1)
})

test('deduplicates repeated dependency requests', async () => {
  const loadCounts = new Map()
  await auditRegistryDependencyClosure(
    [
      { name: '@braedonsaunders/appkit-ai', range: '1.0.3' },
      { name: '@braedonsaunders/appkit-jobs', range: '0.2.2' },
    ],
    async (name, range) => {
      const request = `${name}@${range}`
      loadCounts.set(request, (loadCounts.get(request) ?? 0) + 1)
      return {
        name,
        version: range,
        dependencies: name === '@braedonsaunders/appkit-egress-proxy'
          ? {}
          : { '@braedonsaunders/appkit-egress-proxy': '^0.1.1' },
      }
    },
  )

  assert.equal(loadCounts.get('@braedonsaunders/appkit-egress-proxy@^0.1.1'), 1)
})
