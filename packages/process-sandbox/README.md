# @appkit/process-sandbox

Fail-closed Linux process isolation for workspace-bound coding agents and other
trusted application workers.

The package owns the reusable bubblewrap policy: user, process, IPC, UTS and
cgroup namespaces; capability dropping; an explicitly rebuilt environment;
read-only system roots; masked host data; a private PID namespace with no host
`/proc` view; fresh `/dev`, `/tmp`, and `/run`; and an explicit set of writable
binds. Secret environment values are
passed in the sanitized child environment rather than serialized into process
arguments. The consuming application still owns authentication,
tenant-to-workspace resolution, egress policy, resource limits, and the command
being launched.

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
})
```

Do not fall back to an unsandboxed child process when this package reports an
unsupported platform or missing bubblewrap binary. Desktop/single-user local
execution is a separate, explicit deployment mode.

Call `verifyProcessSandbox()` during a server's startup. It runs a minimal
command inside the real sandbox so blocked namespace or mount syscalls are
detected before the service accepts agent work.
