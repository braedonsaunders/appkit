# Cloud Hypervisor incremental snapshot build

This directory pins Cloud Hypervisor v54.0 and seven upstream commits that add
incremental snapshot writes after a copy-on-write restore. `source.json` records
the upstream revisions, patch checksums, resulting Git tree, and Rust toolchain.
The patch files retain their upstream attribution and license notices.

On a native Linux amd64 or arm64 host with Git, Python 3.11+, rustup, a C compiler,
and musl development tools:

```sh
python3 packages/desk/vmm/build.py --output /path/to/new-build-directory --jobs 2
```

The command refuses an existing output directory, fetches the exact source
revision, verifies every patch and the resulting tree, runs the memory-manager
and pagemap tests, and builds static `cloud-hypervisor` and `ch-remote` binaries.
Its `artifacts` directory contains binary checksums, build provenance, and licenses.
`--prepare-only` verifies the source without installing a toolchain or compiling.
Builds do not install or replace a system VMM.

After a compatible copy-on-write restore, the VMM reflinks the original memory
file and overwrites private pages. The result is a complete ordinary snapshot;
restoring it does not require walking a delta chain. The original memory file must
remain immutable throughout the restored VM's lifetime. An initial snapshot still
writes the full memory image. Unsupported reflinks, unavailable pagemap access,
or an incompatible memory layout use the full snapshot path. This does not promise
a particular latency, storage reduction, or memory saving.

The build workflow checks both native architectures. A successful build does not
establish guest restore correctness: run the desk KVM check with the resulting VMM
and remote client, including repeated copy-on-write park/restore and source-file
immutability checks, before selecting these binaries on a host.

A tag matching `desk-vmm-v<baseVersion>-<buildSuffix without appkit->` runs both
native builds and publishes architecture archives with licenses and SHA-256
checksums. Pull requests and manual checks upload CI artifacts only. Package
consumers pin an archive checksum; selecting the new binary remains an explicit
host configuration change.
