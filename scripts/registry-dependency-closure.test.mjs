import assert from 'node:assert/strict'
import test from 'node:test'
import { auditRegistryDependencyClosure, loadNpmManifest } from './registry-dependency-closure.mjs'

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

// --- a version we just published is "not yet", not "never" ------------------
//
// This audit runs immediately after `npm publish`, and a version is not
// queryable the instant publish returns. Twice a release published every package
// successfully and then failed its own verification with E404 on the package it
// had just pushed — which reports a healthy release as a broken one and teaches
// everybody to ignore a red Release run.
test('a package missing only because it was just published is retried', async () => {
  let clock = 0
  let attempts = 0
  const slept = []
  const manifest = await loadNpmManifest('@braedonsaunders/appkit-desk', '0.6.0', {
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms)
      clock += ms
    },
    // Injected so the test drives the retry rather than shelling out to npm.
    // Two 404s, then the registry catches up.
    timeoutMs: 60_000,
    retryMs: 1_000,
    run: async () => {
      attempts += 1
      if (attempts < 3) {
        const error = new Error('npm view failed')
        error.stderr = "npm error code E404\nnpm error 404 '@braedonsaunders/appkit-desk@0.6.0' is not in this registry."
        throw error
      }
      return { stdout: JSON.stringify({ name: '@braedonsaunders/appkit-desk', version: '0.6.0', dependencies: {} }) }
    },
  })
  assert.equal(attempts, 3, 'it kept asking')
  assert.deepEqual(slept, [1_000, 1_000], 'waiting between attempts')
  assert.equal(manifest.version, '0.6.0')
})

test('a failure that is not absence is not retried, and neither is a timeout', async () => {
  // An auth failure or a malformed range will never come good by waiting, so
  // retrying one only delays a real error by two minutes.
  let attempts = 0
  await assert.rejects(
    () =>
      loadNpmManifest('@braedonsaunders/appkit-desk', '0.6.0', {
        now: () => 0,
        sleep: async () => {},
        run: async () => {
          attempts += 1
          const error = new Error('nope')
          error.stderr = 'npm error code E401\nnpm error Incorrect or missing password.'
          throw error
        },
      }),
    /E401/,
  )
  assert.equal(attempts, 1, 'failed on the first attempt')

  // And absence still fails once the window closes, rather than hanging forever.
  let clock = 0
  await assert.rejects(
    () =>
      loadNpmManifest('@braedonsaunders/appkit-desk', '9.9.9', {
        now: () => clock,
        timeoutMs: 5_000,
        retryMs: 1_000,
        sleep: async (ms) => {
          clock += ms
        },
        run: async () => {
          const error = new Error('gone')
          error.stderr = "npm error 404 '@braedonsaunders/appkit-desk@9.9.9' is not in this registry."
          throw error
        },
      }),
    /not in this registry/,
  )
})
