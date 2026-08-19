import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderManifestsForPublication,
  releasePriorityPackageNames,
} from './publish-order.mjs'

test('every cutover package is ordered before optional publication targets', () => {
  const optionalNames = [
    '@braedonsaunders/appkit-analytics',
    '@braedonsaunders/appkit-integrations',
    '@braedonsaunders/appkit-mcp',
    '@braedonsaunders/appkit-query-console',
  ]
  const manifests = [...optionalNames, ...releasePriorityPackageNames.toReversed()]
    .map((name) => ({ name }))

  const ordered = orderManifestsForPublication(manifests).map(({ name }) => name)

  assert.deepEqual(
    ordered.slice(0, releasePriorityPackageNames.length),
    releasePriorityPackageNames,
  )
  assert.deepEqual(
    ordered.slice(releasePriorityPackageNames.length),
    optionalNames.toSorted(),
  )
})

test('publication ordering does not mutate the manifest inventory', () => {
  const manifests = [
    { name: '@braedonsaunders/appkit-sync' },
    { name: '@braedonsaunders/appkit-ai' },
  ]
  const original = [...manifests]

  orderManifestsForPublication(manifests)

  assert.deepEqual(manifests, original)
})

test('remaining new package names publish before the create-appkit update', () => {
  const ordered = orderManifestsForPublication([
    { name: '@braedonsaunders/appkit-reports' },
    { name: '@braedonsaunders/appkit-scheduling' },
    { name: '@braedonsaunders/appkit-sync' },
    { name: '@braedonsaunders/create-appkit' },
  ]).map(({ name }) => name)

  assert.deepEqual(ordered, [
    '@braedonsaunders/appkit-reports',
    '@braedonsaunders/appkit-scheduling',
    '@braedonsaunders/appkit-sync',
    '@braedonsaunders/create-appkit',
  ])
})
