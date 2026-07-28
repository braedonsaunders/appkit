# @appkit/process-sandbox

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
