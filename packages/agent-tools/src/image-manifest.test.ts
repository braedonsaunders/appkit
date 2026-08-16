import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AgentToolError,
  defineAgentTool,
  imageManifest,
  renderAptInstallFragment,
  type AgentToolManifest,
} from './index'

function aptTool(id: string, aptPackage: string, aptVersion: string): AgentToolManifest {
  return defineAgentTool({
    id,
    name: id,
    description: `${id} for image-manifest tests.`,
    sourceKind: 'apt-package',
    risk: 'low',
    aptPackage,
    aptVersion,
    bins: [{ name: id, bin: id }],
  })
}

function npmTool(id: string, packageName: string, packageVersion: string): AgentToolManifest {
  return defineAgentTool({
    id,
    name: id,
    description: `${id} for image-manifest tests.`,
    sourceKind: 'npm-package',
    risk: 'low',
    packageName,
    packageVersion,
    bins: [{ name: id, bin: id }],
  })
}

function binaryTool(id: string, binaryPath: string): AgentToolManifest {
  return defineAgentTool({
    id,
    name: id,
    description: `${id} for image-manifest tests.`,
    sourceKind: 'binary-path',
    risk: 'low',
    binaryPath,
    bins: [{ name: id, bin: id }],
  })
}

test('empty input emits an empty manifest and no apt fragment', () => {
  assert.deepEqual(imageManifest([]), { aptPackages: [], npmPackages: [], binaryPaths: [] })
  assert.equal(renderAptInstallFragment([]), '')
})

test('mixed source kinds are bucketed, attributed, and sorted', () => {
  const tools = [
    npmTool('prettier', 'prettier', '3.6.2'),
    aptTool('ripgrep', 'ripgrep', '14.1.0-1'),
    binaryTool('tar', '/usr/bin/tar'),
    aptTool('jq', 'jq', '1.7.1-3'),
    binaryTool('gzip', '/bin/gzip'),
  ]
  assert.deepEqual(imageManifest(tools), {
    aptPackages: [
      { name: 'jq', version: '1.7.1-3', toolId: 'jq' },
      { name: 'ripgrep', version: '14.1.0-1', toolId: 'ripgrep' },
    ],
    npmPackages: [{ name: 'prettier', version: '3.6.2', toolId: 'prettier' }],
    binaryPaths: ['/bin/gzip', '/usr/bin/tar'],
  })
})

test('emission is deterministic regardless of input order', () => {
  const tools = [
    aptTool('ripgrep', 'ripgrep', '14.1.0-1'),
    aptTool('jq', 'jq', '1.7.1-3'),
    npmTool('prettier', 'prettier', '3.6.2'),
    binaryTool('tar', '/usr/bin/tar'),
  ]
  const forward = imageManifest(tools)
  const backward = imageManifest([...tools].reverse())
  assert.deepEqual(forward, backward)
  assert.equal(
    renderAptInstallFragment(tools),
    renderAptInstallFragment([...tools].reverse()),
  )
})

test('two tools pinning one package at the same version dedupe to the first tool id', () => {
  const first = aptTool('archiver', 'zstd', '1.5.5+dfsg2-2')
  const second = aptTool('compressor', 'zstd', '1.5.5+dfsg2-2')
  const forward = imageManifest([first, second])
  const backward = imageManifest([second, first])
  assert.deepEqual(forward.aptPackages, [
    { name: 'zstd', version: '1.5.5+dfsg2-2', toolId: 'archiver' },
  ])
  assert.deepEqual(forward, backward)
})

test('conflicting version pins for one package throw', () => {
  assert.throws(
    () => imageManifest([aptTool('old-jq', 'jq', '1.6-2'), aptTool('new-jq', 'jq', '1.7.1-3')]),
    (error: unknown) =>
      error instanceof AgentToolError && /Conflicting pins for apt package jq/.test(error.message),
  )
  assert.throws(
    () =>
      imageManifest([
        npmTool('fmt-old', 'prettier', '3.5.0'),
        npmTool('fmt-new', 'prettier', '3.6.2'),
      ]),
    (error: unknown) =>
      error instanceof AgentToolError &&
      /Conflicting pins for npm package prettier/.test(error.message),
  )
})

test('two manifests sharing a tool id throw', () => {
  assert.throws(
    () => imageManifest([aptTool('jq', 'jq', '1.7.1-3'), aptTool('jq', 'jq', '1.7.1-3')]),
    /share the tool id jq/,
  )
})

test('the apt fragment pins one sorted package per continued line', () => {
  const fragment = renderAptInstallFragment([
    aptTool('ripgrep', 'ripgrep', '14.1.0-1'),
    npmTool('prettier', 'prettier', '3.6.2'),
    aptTool('jq', 'jq', '1.7.1-3'),
  ])
  assert.equal(
    fragment,
    'apt-get install -y --no-install-recommends \\\n  jq=1.7.1-3 \\\n  ripgrep=14.1.0-1',
  )
})
