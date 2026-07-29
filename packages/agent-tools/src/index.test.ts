import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  AgentToolError,
  agentToolScope,
  createAgentToolRuntime,
  createMemoryAgentToolStore,
  defineAgentTool,
  evaluateAgentToolPolicy,
  isSafeAgentTool,
  type AgentToolPolicy,
  type AgentToolStore,
  type SandboxCommand,
  type SandboxResult,
  type SandboxRunner,
} from './index'

const TENANT = 'tenant-one'

const RIPGREP = defineAgentTool({
  id: 'ripgrep',
  name: 'ripgrep',
  description: 'Fast recursive search across files.',
  sourceKind: 'npm-package',
  risk: 'low',
  packageName: '@microsoft/ripgrep-prebuilt',
  packageVersion: '0.1.2',
  capabilities: ['search'],
  bins: [{ name: 'rg', bin: 'rg', healthCheckArgs: ['--version'] }],
  limits: { cpuSeconds: 30, processes: 32 },
})

const UPLOADER = defineAgentTool({
  id: 'uploader',
  name: 'Uploader',
  description: 'Pushes artifacts to a remote host.',
  sourceKind: 'npm-package',
  risk: 'high',
  packageName: 'uploader-cli',
  packageVersion: '2.0.0',
  bins: [{ name: 'upload', bin: 'upload' }],
  requiresNetwork: true,
})

interface Harness {
  runtime: ReturnType<typeof createAgentToolRuntime>
  store: AgentToolStore
  commands: SandboxCommand[]
  root: string
  cleanup: () => Promise<void>
  advance: (ms: number) => void
}

async function harness(
  policy: Partial<AgentToolPolicy> = {},
  result: Partial<SandboxResult> = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'appkit-agent-tools-'))
  const commands: SandboxCommand[] = []
  let clock = Date.parse('2026-07-29T12:00:00.000Z')
  let counter = 0

  const runner: SandboxRunner = async (command) => {
    commands.push(command)
    // An npm install is expected to leave the declared executables behind.
    if (command.args[0] === 'install') {
      const binDir = join(command.cwd, 'node_modules', '.bin')
      await mkdir(binDir, { recursive: true })
      await writeFile(join(binDir, 'rg'), '#!/bin/sh\n', 'utf8')
      await writeFile(join(binDir, 'upload'), '#!/bin/sh\n', 'utf8')
    }
    return {
      status: 'completed',
      exitCode: 0,
      stdout: '',
      stderr: '',
      truncated: false,
      durationMs: 4,
      ...result,
    }
  }

  const store = createMemoryAgentToolStore()
  const runtime = createAgentToolRuntime({
    store,
    runner,
    installRoot: join(root, 'tools'),
    policy: () => ({
      install: 'approval',
      execute: 'allow_safe',
      pendingTtlMs: 60_000,
      grantTtlMs: 60_000,
      grantUses: 1,
      ...policy,
    }),
    now: () => new Date(clock),
    newId: () => `id-${++counter}`,
  })

  return {
    runtime,
    store,
    commands,
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
    advance: (ms) => {
      clock += ms
    },
  }
}

test('manifests reject version ranges, duplicate commands, and missing pins', () => {
  assert.throws(
    () =>
      defineAgentTool({
        id: 'ranged',
        name: 'Ranged',
        description: 'Pinned to a range.',
        sourceKind: 'npm-package',
        risk: 'low',
        packageName: 'thing',
        packageVersion: '^1.2.3',
        bins: [{ name: 'thing', bin: 'thing' }],
      }),
    /exact semver version, not a range/,
  )
  assert.throws(
    () =>
      defineAgentTool({
        id: 'nameless',
        name: 'Nameless',
        description: 'No package name.',
        sourceKind: 'npm-package',
        risk: 'low',
        packageVersion: '1.0.0',
        bins: [{ name: 'thing', bin: 'thing' }],
      }),
    /packageName is required/,
  )
  assert.throws(
    () =>
      defineAgentTool({
        id: 'doubled',
        name: 'Doubled',
        description: 'Two commands with one name.',
        sourceKind: 'binary-path',
        risk: 'low',
        binaryPath: '/usr/bin/true',
        bins: [
          { name: 'go', bin: 'a' },
          { name: 'go', bin: 'b' },
        ],
      }),
    /duplicate command name go/,
  )
})

test('a low-risk tool that reaches the network is not a safe tool', () => {
  assert.equal(isSafeAgentTool(RIPGREP), true)
  assert.equal(isSafeAgentTool(UPLOADER), false)
  const chatty = defineAgentTool({
    id: 'chatty',
    name: 'Chatty',
    description: 'Low risk, but phones out.',
    sourceKind: 'binary-path',
    risk: 'low',
    binaryPath: '/usr/bin/true',
    bins: [{ name: 'chatty', bin: 'true' }],
    requiresNetwork: true,
  })
  assert.equal(isSafeAgentTool(chatty), false)
  assert.equal(
    evaluateAgentToolPolicy({ mode: 'allow_safe', manifest: chatty, action: 'execute' }).outcome,
    'ask',
  )
  assert.equal(
    evaluateAgentToolPolicy({ mode: 'allow_safe', manifest: RIPGREP, action: 'execute' }).outcome,
    'allow',
  )
  assert.equal(
    evaluateAgentToolPolicy({ mode: 'deny', manifest: RIPGREP, action: 'execute' }).outcome,
    'deny',
  )
})

test('approval scope separates different argument vectors', () => {
  const base = { action: 'execute' as const, toolId: 'ripgrep' }
  const needle = agentToolScope({ ...base, detail: { command: 'rg', argv: ['needle'] } })
  const other = agentToolScope({ ...base, detail: { command: 'rg', argv: ['--files'] } })
  assert.notEqual(needle, other)
  // Key order must not change the digest.
  assert.equal(
    needle,
    agentToolScope({ ...base, detail: { argv: ['needle'], command: 'rg' } }),
  )
  // A `command` scope deliberately collapses argument differences.
  assert.equal(
    agentToolScope({ ...base, detail: { command: 'rg', argv: ['needle'] }, approvalScope: 'command' }),
    agentToolScope({ ...base, detail: { command: 'rg', argv: ['--files'] }, approvalScope: 'command' }),
  )
})

test('installing waits for a person, then runs npm with lifecycle scripts off', async () => {
  const h = await harness()
  try {
    await h.runtime.register(TENANT, RIPGREP)

    const blocked = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    assert.equal(blocked.outcome, 'blocked')
    assert.equal(h.commands.length, 0, 'nothing runs before the request is answered')
    if (blocked.outcome !== 'blocked') throw new Error('unreachable')

    await h.runtime.approve({
      tenantId: TENANT,
      approvalId: blocked.approval.id,
      decidedBy: 'operator',
    })
    const installed = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    assert.equal(installed.outcome, 'ok')
    if (installed.outcome !== 'ok') throw new Error('unreachable')
    assert.equal(installed.tool.status, 'installed')
    assert.equal(installed.tool.health, 'healthy')

    const install = h.commands[0]
    assert.ok(install)
    assert.ok(install.args.includes('--ignore-scripts'))
    assert.ok(install.args.includes('@microsoft/ripgrep-prebuilt@0.1.2'))
    assert.equal(install.network, 'host', 'an install legitimately reaches the registry')
    assert.deepEqual(install.writablePaths, [install.cwd])
    assert.equal(install.environment.HOME, install.cwd)

    // The health probe runs isolated.
    const health = h.commands[1]
    assert.ok(health)
    assert.equal(health.network, 'none')
    assert.deepEqual(health.args, ['--version'])
  } finally {
    await h.cleanup()
  }
})

test('an install grant does not authorize a second install', async () => {
  const h = await harness()
  try {
    await h.runtime.register(TENANT, RIPGREP)
    const first = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    if (first.outcome !== 'blocked') throw new Error('expected a pending request')
    await h.runtime.approve({ tenantId: TENANT, approvalId: first.approval.id, decidedBy: 'operator' })
    assert.equal((await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })).outcome, 'ok')

    const again = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    assert.equal(again.outcome, 'blocked', 'the spent grant must not authorize another install')
    if (again.outcome !== 'blocked') throw new Error('unreachable')
    assert.notEqual(again.approval.id, first.approval.id)
  } finally {
    await h.cleanup()
  }
})

test('a safe tool runs network-isolated with only its workdir writable', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(TENANT, RIPGREP)
    const workdir = join(h.root, 'home')
    const ran = await h.runtime.execute({
      tenantId: TENANT,
      toolId: 'ripgrep',
      command: 'rg',
      argv: ['--json', 'needle'],
      workdir,
      installIfMissing: true,
      actor: 'agent',
    })
    assert.equal(ran.outcome, 'ran')
    if (ran.outcome !== 'ran') throw new Error('unreachable')
    assert.equal(ran.run.status, 'completed')
    assert.deepEqual(ran.run.argv, ['--json', 'needle'])

    const execution = h.commands.at(-1)
    assert.ok(execution)
    assert.equal(execution.network, 'none', 'search has no business reaching out')
    assert.deepEqual(execution.writablePaths, [workdir])
    assert.equal(execution.cwd, workdir)
    assert.deepEqual(execution.limits, { cpuSeconds: 30, processes: 32 })
    // The tool's own bytes are readable but not rewritable by the run.
    assert.ok(execution.readOnlyPaths?.some((path) => path.includes('/tools/tenant-one/ripgrep')))
    assert.ok(!execution.writablePaths.some((path) => path.includes('/tools/')))

    const runs = await h.runtime.listRuns(TENANT)
    assert.equal(runs.length, 1)
    assert.equal(runs[0]?.toolId, 'ripgrep')
  } finally {
    await h.cleanup()
  }
})

test('a network-reaching tool asks every time, and one yes covers one run', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(TENANT, UPLOADER)
    const workdir = join(h.root, 'home')
    const request = {
      tenantId: TENANT,
      toolId: 'uploader',
      command: 'upload',
      argv: ['./report.pdf'],
      workdir,
      installIfMissing: true,
      actor: 'agent',
    }

    const blocked = await h.runtime.execute(request)
    assert.equal(blocked.outcome, 'blocked')
    if (blocked.outcome !== 'blocked') throw new Error('unreachable')

    // Asking again while it is pending reuses the same request rather than
    // filing a second one.
    const repeat = await h.runtime.execute(request)
    if (repeat.outcome !== 'blocked') throw new Error('unreachable')
    assert.equal(repeat.approval.id, blocked.approval.id)

    await h.runtime.approve({ tenantId: TENANT, approvalId: blocked.approval.id, decidedBy: 'operator' })
    const ran = await h.runtime.execute(request)
    assert.equal(ran.outcome, 'ran')
    if (ran.outcome !== 'ran') throw new Error('unreachable')
    assert.equal(ran.run.approvalId, blocked.approval.id)
    assert.equal(h.commands.at(-1)?.network, 'host')

    const third = await h.runtime.execute(request)
    assert.equal(third.outcome, 'blocked', 'a single-use grant is spent after one run')
  } finally {
    await h.cleanup()
  }
})

test('a grant never widens to a different argument vector', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(TENANT, UPLOADER)
    const workdir = join(h.root, 'home')
    const base = {
      tenantId: TENANT,
      toolId: 'uploader',
      command: 'upload',
      workdir,
      installIfMissing: true,
      actor: 'agent',
    }
    const blocked = await h.runtime.execute({ ...base, argv: ['./report.pdf'] })
    if (blocked.outcome !== 'blocked') throw new Error('unreachable')
    await h.runtime.approve({ tenantId: TENANT, approvalId: blocked.approval.id, decidedBy: 'operator' })

    const elsewhere = await h.runtime.execute({ ...base, argv: ['/etc/shadow'] })
    assert.equal(elsewhere.outcome, 'blocked', 'a different argv is a different question')
  } finally {
    await h.cleanup()
  }
})

test('a refusal stands, and an unanswered request goes stale', async () => {
  const h = await harness({ install: 'allow_all', grantTtlMs: 30_000, pendingTtlMs: 10_000 })
  try {
    await h.runtime.register(TENANT, UPLOADER)
    const workdir = join(h.root, 'home')
    const request = {
      tenantId: TENANT,
      toolId: 'uploader',
      command: 'upload',
      argv: ['./report.pdf'],
      workdir,
      installIfMissing: true,
      actor: 'agent',
    }

    const blocked = await h.runtime.execute(request)
    if (blocked.outcome !== 'blocked') throw new Error('unreachable')
    await h.runtime.deny({
      tenantId: TENANT,
      approvalId: blocked.approval.id,
      decidedBy: 'operator',
      reason: 'That file does not leave the building.',
    })

    const refused = await h.runtime.execute(request)
    assert.equal(refused.outcome, 'denied')
    if (refused.outcome !== 'denied') throw new Error('unreachable')
    assert.match(refused.reason, /does not leave the building/)

    // Once the refusal's window passes, the question may be asked again.
    h.advance(31_000)
    const asked = await h.runtime.execute(request)
    assert.equal(asked.outcome, 'blocked')

    h.advance(11_000)
    assert.equal(await h.runtime.expireStale(TENANT), 1)
    const stale = await h.runtime.listApprovals(TENANT)
    assert.ok(stale.some((approval) => approval.status === 'expired'))
  } finally {
    await h.cleanup()
  }
})

test('unknown commands, disabled tools, and hostile arguments are refused', async () => {
  const h = await harness({ install: 'allow_all', execute: 'allow_all' })
  try {
    const tool = await h.runtime.register(TENANT, RIPGREP)
    const workdir = join(h.root, 'home')

    const unknown = await h.runtime.execute({
      tenantId: TENANT,
      toolId: 'ripgrep',
      command: 'sh',
      workdir,
      actor: 'agent',
    })
    assert.equal(unknown.outcome, 'unavailable')
    if (unknown.outcome !== 'unavailable') throw new Error('unreachable')
    assert.equal(unknown.reason, 'unknown_command')

    await assert.rejects(
      h.runtime.execute({
        tenantId: TENANT,
        toolId: 'ripgrep',
        command: 'rg',
        argv: ['need\0le'],
        workdir,
        actor: 'agent',
      }),
      AgentToolError,
    )

    await h.store.upsertTool({ ...tool, enabled: false })
    const off = await h.runtime.execute({
      tenantId: TENANT,
      toolId: 'ripgrep',
      command: 'rg',
      workdir,
      actor: 'agent',
    })
    assert.equal(off.outcome, 'denied')
  } finally {
    await h.cleanup()
  }
})

test('a binary tool outside the allowed roots never installs', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(
      TENANT,
      defineAgentTool({
        id: 'smuggled',
        name: 'Smuggled',
        description: 'Points at a writable path.',
        sourceKind: 'binary-path',
        risk: 'low',
        binaryPath: '/data/agent-homes/tenant/person/payload',
        bins: [{ name: 'payload', bin: 'payload' }],
      }),
    )
    const result = await h.runtime.install({ tenantId: TENANT, toolId: 'smuggled', actor: 'agent' })
    assert.equal(result.outcome, 'failed')
    if (result.outcome !== 'failed') throw new Error('unreachable')
    assert.match(result.error, /outside the allowed binary roots/)
  } finally {
    await h.cleanup()
  }
})

test('re-pinning a version puts the tool back to uninstalled', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(TENANT, RIPGREP)
    const installed = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    assert.equal(installed.outcome, 'ok')

    const repinned = await h.runtime.register(TENANT, { ...RIPGREP, packageVersion: '0.1.3' })
    assert.equal(repinned.status, 'not_installed')
    assert.deepEqual(repinned.binPaths, {})
    assert.equal(repinned.installedVersion, undefined)
  } finally {
    await h.cleanup()
  }
})

test('a failing install records the reason and leaves the tool in error', async () => {
  const h = await harness({ install: 'allow_all' }, {
    status: 'failed',
    exitCode: 1,
    stderr: 'ETARGET No matching version',
  })
  try {
    await h.runtime.register(TENANT, RIPGREP)
    const result = await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    assert.equal(result.outcome, 'failed')
    if (result.outcome !== 'failed') throw new Error('unreachable')
    assert.match(result.error, /ETARGET/)

    const tool = await h.runtime.get(TENANT, 'ripgrep')
    assert.equal(tool?.status, 'error')
    assert.equal(tool?.health, 'unavailable')
    assert.match(tool?.lastError ?? '', /ETARGET/)
  } finally {
    await h.cleanup()
  }
})

test('tenants never see or share each other tools', async () => {
  const h = await harness({ install: 'allow_all' })
  try {
    await h.runtime.register(TENANT, RIPGREP)
    assert.equal((await h.runtime.list('tenant-two')).length, 0)
    assert.equal(await h.runtime.get('tenant-two', 'ripgrep'), undefined)

    await h.runtime.install({ tenantId: TENANT, toolId: 'ripgrep', actor: 'agent' })
    await h.runtime.register('tenant-two', RIPGREP)
    const other = await h.runtime.get('tenant-two', 'ripgrep')
    assert.equal(other?.status, 'not_installed')
    assert.notEqual(other?.installDir, (await h.runtime.get(TENANT, 'ripgrep'))?.installDir)
  } finally {
    await h.cleanup()
  }
})
