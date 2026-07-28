import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBubblewrapPlan,
  DEFAULT_PROCESS_PATH,
  isProcessSandboxSupported,
  ProcessSandboxError,
} from './index'

const allPathsExist = () => true

test('builds a cleared, workspace-bound bubblewrap invocation', () => {
  const plan = buildBubblewrapPlan({
    command: '/usr/local/bin/codex',
    args: ['exec', '--json', 'Inspect the project'],
    cwd: '/data/projects/project-one',
    writablePaths: [
      '/data/projects/project-one',
      '/data/agent-home/users/user-one',
    ],
    environment: {
      CODEX_HOME: '/data/agent-home/users/user-one/.codex',
      OPENAI_API_KEY: 'test-key',
      EMPTY: undefined,
    },
  }, { pathExists: allPathsExist })

  assert.equal(plan.command, '/usr/bin/bwrap')
  assert.deepEqual(plan.writablePaths, [
    '/data/projects/project-one',
    '/data/agent-home/users/user-one',
  ])
  assert.ok(plan.args.includes('--unshare-user'))
  assert.ok(plan.args.includes('--unshare-pid'))
  assert.ok(!plan.args.includes('--proc'))
  assert.ok(!plan.args.includes('/proc'))
  assert.ok(plan.args.includes('--cap-drop'))
  assert.ok(plan.args.includes('ALL'))
  assert.ok(plan.args.includes('--die-with-parent'))
  assert.ok(plan.args.includes('/data/projects/project-one'))
  assert.ok(!plan.args.includes('CODEX_HOME'))
  assert.ok(!plan.args.includes('OPENAI_API_KEY'))
  assert.ok(!plan.args.includes('test-key'))
  assert.equal(plan.environment.CODEX_HOME, '/data/agent-home/users/user-one/.codex')
  assert.equal(plan.environment.OPENAI_API_KEY, 'test-key')
  assert.equal(plan.environment.PATH, DEFAULT_PROCESS_PATH)
  assert.ok(!('EMPTY' in plan.environment))
  assert.deepEqual(plan.args.slice(-5), ['--', '/usr/local/bin/codex', 'exec', '--json', 'Inspect the project'])
})

test('requires an absolute cwd covered by an exposed mount', () => {
  assert.throws(
    () => buildBubblewrapPlan({
      command: 'codex',
      cwd: 'relative/project',
      writablePaths: ['/data/projects/project-one'],
    }),
    ProcessSandboxError,
  )
  assert.throws(
    () => buildBubblewrapPlan({
      command: 'codex',
      cwd: '/data/projects/project-two',
      writablePaths: ['/data/projects/project-one'],
    }),
    /contained by a writable or read-only path/,
  )
  const readOnlyPlan = buildBubblewrapPlan({
    command: '/usr/bin/true',
    cwd: '/data/projects/project-two',
    writablePaths: ['/data/agent-home/users/user-one/runtime/codex'],
    readOnlyPaths: ['/usr', '/data/projects/project-two'],
  }, { pathExists: allPathsExist })
  const maskedDataIndex = readOnlyPlan.args.findIndex(
    (entry, index) => entry === '--tmpfs' && readOnlyPlan.args[index + 1] === '/data',
  )
  const projectBindIndex = readOnlyPlan.args.findIndex(
    (entry, index) =>
      entry === '--ro-bind' &&
      readOnlyPlan.args[index + 1] === '/data/projects/project-two',
  )
  assert.ok(maskedDataIndex >= 0)
  assert.ok(projectBindIndex > maskedDataIndex)
})

test('rejects invalid environment keys instead of passing them to bubblewrap', () => {
  assert.throws(
    () => buildBubblewrapPlan({
      command: 'codex',
      cwd: '/workspace',
      writablePaths: ['/workspace'],
      environment: { 'BAD-NAME': 'secret' },
    }),
    /Invalid environment variable name/,
  )
})

test('support detection is Linux and binary specific', () => {
  assert.equal(isProcessSandboxSupported({ platform: 'linux', pathExists: () => true }), true)
  assert.equal(isProcessSandboxSupported({ platform: 'linux', pathExists: () => false }), false)
  assert.equal(isProcessSandboxSupported({ platform: 'darwin', pathExists: () => true }), false)
})
