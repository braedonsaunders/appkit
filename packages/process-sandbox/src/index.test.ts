import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBubblewrapPlan,
  DEFAULT_PRLIMIT_PATH,
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
    launcherIdentity: { uid: 1000, gid: 1000 },
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
  assert.equal(plan.mountProc, false)
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
  assert.deepEqual(plan.launcherIdentity, { uid: 1000, gid: 1000 })
  assert.equal(plan.network, 'host')
  assert.ok(!plan.args.includes('--unshare-net'))
  assert.deepEqual(plan.limits, {})
})

test('keeps the host network namespace by default and unshares it on request', () => {
  const options = {
    command: '/usr/bin/true',
    cwd: '/workspace',
    writablePaths: ['/workspace'],
  }
  const shared = buildBubblewrapPlan(options, { pathExists: allPathsExist })
  assert.equal(shared.network, 'host')
  assert.ok(!shared.args.includes('--unshare-net'))

  const isolated = buildBubblewrapPlan({ ...options, network: 'none' }, { pathExists: allPathsExist })
  assert.equal(isolated.network, 'none')
  assert.ok(isolated.args.includes('--unshare-net'))
  // Isolation is declared alongside the other namespaces, before any mount work.
  assert.ok(isolated.args.indexOf('--unshare-net') < isolated.args.indexOf('--cap-drop'))
})

test('applies kernel resource ceilings through prlimit inside the namespace', () => {
  const plan = buildBubblewrapPlan({
    command: '/usr/bin/rg',
    args: ['--json', 'needle'],
    cwd: '/workspace',
    writablePaths: ['/workspace'],
    limits: { cpuSeconds: 30, addressSpaceBytes: 1_073_741_824, processes: 64 },
  }, { pathExists: allPathsExist })

  assert.deepEqual(plan.limits, {
    cpuSeconds: 30,
    addressSpaceBytes: 1_073_741_824,
    processes: 64,
  })
  assert.deepEqual(plan.args.slice(plan.args.indexOf('--')), [
    '--',
    DEFAULT_PRLIMIT_PATH,
    '--cpu=30:30',
    '--as=1073741824:1073741824',
    '--nproc=64:64',
    '--',
    '/usr/bin/rg',
    '--json',
    'needle',
  ])
})

test('fails closed when resource ceilings are requested without prlimit', () => {
  assert.throws(
    () => buildBubblewrapPlan({
      command: '/usr/bin/true',
      cwd: '/workspace',
      writablePaths: ['/workspace'],
      limits: { cpuSeconds: 5 },
    }, { pathExists: (path) => path !== DEFAULT_PRLIMIT_PATH }),
    /prlimit was not found/,
  )
  assert.throws(
    () => buildBubblewrapPlan({
      command: '/usr/bin/true',
      cwd: '/workspace',
      writablePaths: ['/workspace'],
      limits: { cpuSeconds: 0 },
    }, { pathExists: allPathsExist }),
    /limits.cpuSeconds must be a positive integer/,
  )
})

test('leaves argv free of prlimit when no ceilings are requested', () => {
  const plan = buildBubblewrapPlan({
    command: '/usr/bin/true',
    cwd: '/workspace',
    writablePaths: ['/workspace'],
    limits: {},
  }, { pathExists: (path) => path !== DEFAULT_PRLIMIT_PATH })

  assert.deepEqual(plan.args.slice(-2), ['--', '/usr/bin/true'])
})

test('can mount a private procfs when the container host permits it', () => {
  const plan = buildBubblewrapPlan({
    command: '/usr/bin/true',
    cwd: '/workspace',
    writablePaths: ['/workspace'],
    mountProc: true,
  }, { pathExists: allPathsExist })

  assert.equal(plan.mountProc, true)
  const procIndex = plan.args.indexOf('--proc')
  assert.ok(procIndex >= 0)
  assert.equal(plan.args[procIndex + 1], '/proc')
})

test('can expose only an approved synthetic self executable without procfs', () => {
  const executable = '/usr/local/bin/codex'
  const plan = buildBubblewrapPlan({
    command: '/usr/bin/node',
    cwd: '/workspace',
    writablePaths: ['/workspace'],
    syntheticSelfExecutable: executable,
  }, { pathExists: allPathsExist })

  assert.equal(plan.mountProc, false)
  assert.equal(plan.syntheticSelfExecutable, executable)
  assert.ok(!plan.args.includes('--proc'))
  assert.deepEqual(
    plan.args.slice(plan.args.indexOf('--dir', plan.args.indexOf('--tmpfs'))).slice(0, 7),
    ['--dir', '/proc', '--dir', '/proc/self', '--symlink', executable, '/proc/self/exe'],
  )
  assert.throws(
    () => buildBubblewrapPlan({
      command: '/usr/bin/node',
      cwd: '/workspace',
      writablePaths: ['/workspace'],
      mountProc: true,
      syntheticSelfExecutable: executable,
    }, { pathExists: allPathsExist }),
    /mutually exclusive/,
  )
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

test('rejects root and malformed launcher identities', () => {
  const options = {
    command: '/usr/bin/true',
    cwd: '/workspace',
    writablePaths: ['/workspace'],
  }
  assert.throws(
    () => buildBubblewrapPlan({ ...options, launcherIdentity: { uid: 0, gid: 0 } }),
    /uid must be an integer between 1 and 2147483647/,
  )
  assert.throws(
    () => buildBubblewrapPlan({ ...options, launcherIdentity: { uid: 1000, gid: -1 } }),
    /gid must be an integer between 0 and 2147483647/,
  )
  assert.throws(
    () => buildBubblewrapPlan({
      ...options,
      launcherIdentity: { uid: 2_147_483_648, gid: 1000 },
    }),
    /uid must be an integer between 1 and 2147483647/,
  )
  assert.throws(
    () => buildBubblewrapPlan({
      ...options,
      launcherIdentity: { uid: 1000, gid: 2_147_483_648 },
    }),
    /gid must be an integer between 0 and 2147483647/,
  )
})
