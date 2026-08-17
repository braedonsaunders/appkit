# @braedonsaunders/process-sandbox

Fail-closed Linux process isolation for workspace-bound coding agents and other
trusted application workers.

The package owns the reusable bubblewrap policy: user, process, IPC, UTS and
cgroup namespaces; capability dropping; an explicitly rebuilt environment;
read-only system roots; masked host data; a private PID namespace; fresh
`/dev`, `/tmp`, and `/run`; an explicit set of writable binds; optional network
namespace isolation; and optional kernel resource ceilings. Secret environment
values are passed in the sanitized child environment rather than serialized
into process arguments. The consuming application still owns authentication,
tenant-to-workspace resolution, and the command being launched.

## Supervised executions

`ProcessSandboxSupervisor` decouples a command from the request that started
it. A caller can safely retry a start with the same execution ID, poll from the
last event sequence after a disconnect, cancel it, or retrieve its bounded
terminal result until retention expires. Stream replay and final output are
bounded separately, so slow or disconnected consumers cannot create an
unbounded host-memory log.

```ts
const supervisor = new ProcessSandboxSupervisor({
  defaultTimeoutMs: 120_000,
  defaultRetentionMs: 15 * 60_000,
  maxOutputBytes: 64 * 1024,
})

const started = supervisor.start({
  executionId: request.idempotencyKey,
  maxOutputBytes: request.outputLimit,
  process: {
    command: '/usr/bin/sh',
    args: ['-lc', request.command],
    cwd: workspacePath,
    writablePaths: [workspacePath],
    network: 'none',
  },
})

let sequence = started.latestSequence
while (true) {
  const update = await supervisor.waitForUpdate(started.executionId, sequence)
  if (!update) throw new Error('Execution expired')
  sequence = update.latestSequence
  if (update.result) break
}
```

The built-in launcher remains `spawnBubblewrappedProcess`. An adapter for a
different isolation backend may be supplied through `launcher`, but the adapter
is responsible for providing equivalent confinement and a normal Node
`ChildProcess` lifecycle. The supervisor does not weaken or replace the
bubblewrap boundary.

## Network policy

`network` defaults to `'host'`, which is the behavior of every release before
network policy existed — package installs and agents that call an API keep
working across an upgrade. Pass `network: 'none'` for commands that have no
business reaching out; the child then has only a loopback interface, with no
DNS and no access to services the application container can reach.

```ts
const child = spawnBubblewrappedProcess({
  command: '/opt/tools/ripgrep/rg',
  args: ['--json', pattern],
  cwd: workspacePath,
  writablePaths: [workspacePath],
  network: 'none',
  limits: { cpuSeconds: 30, addressSpaceBytes: 1_073_741_824, processes: 64 },
})
```

## Resource limits

`limits` maps to `prlimit(1)` running inside the namespace, so the ceilings
apply to the command and everything it forks. Soft and hard values are set
together, which means the child cannot raise them. Requesting a limit on a host
without util-linux throws rather than running the command unbounded — silently
dropping a ceiling would fail open on exactly the hosts the caller was trying
to protect. `verifyProcessSandbox()` reports `resourceLimitsSupported` and
`networkIsolationSupported` so a readiness screen can show what this host can
actually enforce.

Procfs is unavailable by default for compatibility with container hosts that
prohibit nested proc mounts. A consumer can set `mountProc: true` to mount a
fresh procfs scoped to the sandbox's private PID namespace. For native runtimes
that only require `current_exe()`, prefer `syntheticSelfExecutable`: AppKit
creates only `/proc/self/exe` as a symlink to that explicitly approved absolute
path, exposing no process metadata. The two modes are mutually exclusive.

The working directory may be a writable bind for build/edit agents or a
read-only bind for question-and-answer and inspection workers.

```ts
import { spawnBubblewrappedProcess } from '@braedonsaunders/process-sandbox'

const child = spawnBubblewrappedProcess({
  command: '/usr/local/bin/codex',
  args: ['exec', '--json', prompt],
  cwd: workspacePath,
  writablePaths: [workspacePath, agentHomePath],
  environment: {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    CODEX_HOME: `${agentHomePath}/.codex`,
  },
  launcherIdentity: { uid: 1000, gid: 1000 },
  syntheticSelfExecutable: '/usr/local/bin/codex',
})
```

When the parent service runs as root inside a container, configure an
unprivileged `launcherIdentity` and install bubblewrap setuid-root. AppKit
invokes only the bubblewrap executable as that identity; the setuid helper
creates the namespaces and drops all capabilities before the agent command is
executed. This avoids granting `CAP_SYS_ADMIN` to the application container.
Writable bind paths must be writable by the launcher identity.

Do not fall back to an unsandboxed child process when this package reports an
unsupported platform or missing bubblewrap binary. Desktop/single-user local
execution is a separate, explicit deployment mode.

Call `verifyProcessSandbox({ launcherIdentity })` during a server's startup
with the same launcher identity used for real agent processes. It runs a
minimal command inside the real sandbox so blocked namespace or mount syscalls
are detected before the service accepts agent work.
