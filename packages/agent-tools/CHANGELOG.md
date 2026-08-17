# Changelog

## 0.2.0

The manifest becomes the declaration of what a golden VM base image contains,
alongside its existing role as a governed catalogue.

### Added

- `sourceKind: 'apt-package'` — a Debian package baked into the base image at
  an exact pinned version. A manifest declares `aptPackage` (validated against
  the Debian package-name grammar) and `aptVersion` (an exact Debian version
  string; ranges are refused for the same reason npm ranges are — the bytes in
  the image must be the bytes the shelf describes). npm-only fields on an apt
  manifest, and apt fields on any other kind, are rejected.
- `@braedonsaunders/agent-tools/image-manifest` — a pure emitter that turns a set of
  manifests into base-image build input. `imageManifest(tools)` returns a
  deterministically sorted `{ aptPackages, npmPackages, binaryPaths }`
  structure with each package traced to its tool id, and throws when two tools
  pin the same package at different versions. `renderAptInstallFragment(tools)`
  renders the sorted `apt-get install -y pkg=version` fragment for a
  Dockerfile or mmdebstrap hook.
- Runtime support for apt tools: `install()` does not spawn anything — the
  package is preinstalled in the base image, so it verifies the declared
  executables exist on disk (searched across `DEFAULT_APT_BINARY_ROOTS`) and
  marks the record installed. Re-pinning `aptPackage` or `aptVersion` puts the
  tool back to uninstalled, and health checks run the resolved binary exactly
  as they do for the other source kinds.
- New exports: `imageManifest`, `renderAptInstallFragment`, `ImageManifest`,
  `ImageManifestPackage`, `DEFAULT_APT_BINARY_ROOTS`.

### Unchanged

- The install and execute policy gates are untouched. Consumers not running
  agents on a desk still get the same approval flow, bounded grants, and
  sandboxed execution for `npm-package` and `binary-path` tools; a desk-based
  consumer simply stops calling the gated paths.

## 0.1.0

Initial release: `defineAgentTool`, exact version pinning, the install and
execute policy gates, bounded approval grants, health checks, the tenant
shelf, sandboxed execution via `@braedonsaunders/process-sandbox`, and the in-memory
and Drizzle stores.
