# @appkit/process-sandbox

Fail-closed Linux process isolation for workspace-bound coding agents and other
trusted application workers.

The package owns the reusable bubblewrap policy: user, process, IPC, UTS and
cgroup namespaces; capability dropping; an explicitly rebuilt environment;
read-only system roots; masked host data; a private PID namespace with its own
procfs; fresh `/dev`, `/tmp`, and `/run`; and an explicit set of writable
binds. Secret environment values are
passed in the sanitized child environment rather than serialized into process
arguments. The consuming application still owns authentication,
tenant-to-workspace resolution, egress policy, resource limits, and the command
being launched.

The isolated procfs is enabled by default so native runtimes can safely resolve
their executable through `/proc/self/exe`. It contains only processes in the
sandbox's private PID namespace; it is not a bind of the host or application
container's `/proc`. Set `mountProc: false` only for a constrained workload
that does not require procfs. The startup verifier exercises the same default.

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
