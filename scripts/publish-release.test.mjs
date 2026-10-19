import assert from 'node:assert/strict'
import test from 'node:test'
import { publishRelease } from './publish-release.mjs'

const manifest = (name) => ({ name, version: '1.2.3', directory: `/packages/${name}` })
const visible = async (name, version) => ({ name, version })

test('publishes every package in release order before the first propagation wait', async () => {
  const events = []
  const published = await publishRelease([
    manifest('@braedonsaunders/appkit-ui'),
    manifest('@braedonsaunders/appkit-tokens'),
  ], {
    isPublished: async () => false,
    publish: async (directory, name) => events.push(`publish ${name}`),
    loadManifest: async (name, version) => {
      events.push(`verify ${name}`)
      return visible(name, version)
    },
    sleep: async () => {},
  })

  assert.deepEqual(events, [
    'publish @braedonsaunders/appkit-tokens',
    'publish @braedonsaunders/appkit-ui',
    'verify @braedonsaunders/appkit-tokens',
    'verify @braedonsaunders/appkit-ui',
  ])
  assert.equal(published.length, 2)
})

test('partial release recovery skips existing exact versions and verifies only new writes', async () => {
  const inspected = []
  const writes = []
  const reads = []
  await publishRelease([manifest('a'), manifest('b')], {
    isPublished: async (name, version) => {
      inspected.push(`${name}@${version}`)
      return name === 'a'
    },
    publish: async (directory, name, version) => writes.push([directory, name, version]),
    loadManifest: async (name, version) => {
      reads.push(`${name}@${version}`)
      return visible(name, version)
    },
  })
  assert.deepEqual(inspected, ['a@1.2.3', 'b@1.2.3'])
  assert.deepEqual(writes, [['/packages/b', 'b', '1.2.3']])
  assert.deepEqual(reads, ['b@1.2.3'])
})

test('keeps minimum write spacing without charging skipped versions or lookup time twice', async () => {
  let clock = 0
  const writes = []
  const sleeps = []
  await publishRelease(['a', 'b', 'c', 'd'].map(manifest), {
    isPublished: async (name) => {
      if (name === 'b') return true
      if (name === 'c') clock += 1_000
      if (name === 'd') clock += 4_000
      return false
    },
    publish: async (directory, name) => writes.push([name, clock]),
    loadManifest: visible,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
  })
  assert.deepEqual(writes, [['a', 0], ['c', 3_500], ['d', 7_500]])
  assert.deepEqual(sleeps, [2_500])
})

test('final verification failures reject completion after settling all bounded checks', async () => {
  let active = 0
  let maximumActive = 0
  let completed = 0
  const verified = []
  let releaseFirstBatch
  const firstBatch = new Promise((resolve) => { releaseFirstBatch = resolve })
  const packages = Array.from({ length: 8 }, (_, i) => manifest(`package-${i}`))
  await assert.rejects(publishRelease(packages, {
    isPublished: async () => false,
    publish: async () => {},
    sleep: async () => {},
    loadManifest: async (name, version) => {
      verified.push(name)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (active === 4) releaseFirstBatch()
      await firstBatch
      active -= 1
      completed += 1
      if (name === 'package-0') throw new Error('E404 propagation deadline expired')
      return visible(name, version)
    },
  }), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.errors.length, 1)
    assert.match(error.errors[0].message, /package-0@1.2.3/)
    assert.match(error.errors[0].cause.message, /propagation deadline expired/)
    return true
  })
  assert.equal(maximumActive, 4)
  assert.equal(active, 0)
  assert.equal(completed, packages.length)
  assert.deepEqual(verified.toSorted(), packages.map(({ name }) => name))
})

test('an incorrect registry version cannot pass final verification', async () => {
  await assert.rejects(publishRelease([manifest('a')], {
    isPublished: async () => false,
    publish: async () => {},
    loadManifest: async (name) => ({ name, version: '1.2.2' }),
  }), (error) => {
    assert.match(error.errors[0].cause.message, /unexpected manifest/)
    return true
  })
})

test('a failed write stops publication without starting registry verification', async () => {
  const writes = []
  await assert.rejects(publishRelease(['a', 'b', 'c'].map(manifest), {
    isPublished: async () => false,
    publish: async (directory, name) => {
      writes.push(name)
      if (name === 'b') throw new Error('publish failed')
    },
    loadManifest: async () => assert.fail('verification started before writes finished'),
    sleep: async () => {},
  }), /publish failed/)
  assert.deepEqual(writes, ['a', 'b'])
})

test('an already complete release performs no writes or propagation waits', async () => {
  const result = await publishRelease([manifest('a')], {
    isPublished: async () => true,
    publish: async () => assert.fail('published an existing version'),
    loadManifest: async () => assert.fail('waited on an existing version'),
  })
  assert.deepEqual(result, [])
})
