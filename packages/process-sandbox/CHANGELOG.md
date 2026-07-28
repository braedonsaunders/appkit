# @appkit/process-sandbox

## 0.1.5

### Patch Changes

- Add a synthetic `/proc/self/exe` mode for native agent runtimes on container
  hosts that prohibit nested procfs mounts. It exposes only an explicitly
  approved executable path and no process metadata.
- Keep procfs opt-in and reject simultaneous real-proc and synthetic-self modes.

## 0.1.4

### Patch Changes

- Mount a fresh procfs inside the private PID namespace by default so native
  agent runtimes can resolve `/proc/self/exe` without exposing the host or
  application container's process view.
- Expose an explicit `mountProc: false` escape hatch for constrained workloads
  and surface the effective choice in the auditable bubblewrap plan.

## 0.1.3

### Patch Changes

- Support invoking setuid bubblewrap under an explicit unprivileged UID/GID, including an equivalent fail-closed startup verification, so root container services do not need `CAP_SYS_ADMIN`.

## 0.1.2

### Patch Changes

- Add a real startup probe for namespace and mount readiness.
- Keep `/proc` unavailable inside the private PID namespace so constrained
  Docker hosts remain compatible without exposing the container PID view.
- Allow a sandbox working directory to be covered by a read-only bind for
  inspection-only agent modes.

## 0.1.0

### Minor Changes

- Add the generalized, fail-closed bubblewrap policy extracted from Bidwright's
  production multi-tenant coding-agent runtime.
