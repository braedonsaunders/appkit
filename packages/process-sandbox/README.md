# @appkit/process-sandbox

Fail-closed Linux process isolation for workspace-bound coding agents and other
trusted application workers.

The package owns the reusable bubblewrap policy: user, process, IPC, UTS and
cgroup namespaces; capability dropping; an explicitly rebuilt environment;
read-only system roots; masked host data; a private PID namespace; fresh
`/dev`, `/tmp`, and `/run`; and an explicit set of writable
binds. Secret environment values are
passed in the sanitized child environment rather than serialized into process
arguments. The consuming application still owns authentication,
tenant-to-workspace resolution, egress policy, resource limits, and the command
being launched.

Procfs is unavailable by default for compatibility with container hosts that
prohibit nested proc mounts. A consumer can set `mountProc: true` to mount a
fresh procfs scoped to the sandbox's private PID namespace. For native runtimes
that only require `current_exe()`, prefer `syntheticSelfExecutable`: AppKit
creates only `/proc/self/exe` as a symlink to that explicitly approved absolute
path, exposing no process metadata. The two modes are mutually exclusive.

The working directory may be a writable bind for build/edit agents or a
read-only bind for question-and-answer and inspection workers.

```ts
import { spawnBubblewrappedProcess } from '@appkit/process-sandbox'

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
