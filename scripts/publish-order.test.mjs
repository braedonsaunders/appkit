import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderManifestsForPublication,
  releasePriorityPackageNames,
} from './publish-order.mjs'

test('every cutover package is ordered before optional publication targets', () => {
  const optionalNames = [
    '@braedonsaunders/appkit-analytics',
    '@braedonsaunders/create-appkit',
    '@braedonsaunders/appkit-integrations',
    '@braedonsaunders/appkit-mcp',
    '@braedonsaunders/appkit-query-console',
    '@braedonsaunders/appkit-reports',
    '@braedonsaunders/appkit-scheduling',
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

test('existing package updates publish before the blocked Sync name', () => {
  const ordered = orderManifestsForPublication([
    { name: '@braedonsaunders/appkit-sync' },
    { name: '@braedonsaunders/appkit-forms-pdf' },
    { name: '@braedonsaunders/appkit-remote-sessions' },
  ]).map(({ name }) => name)

  assert.deepEqual(ordered, [
    '@braedonsaunders/appkit-remote-sessions',
    '@braedonsaunders/appkit-forms-pdf',
    '@braedonsaunders/appkit-sync',
  ])
})
