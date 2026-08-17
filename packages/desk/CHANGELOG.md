# Changelog

## 0.2.2

- `verifyDeskHost` accepts `kernelCmdline`. The boot probe was always using the default, so on a partitioned cloud image it panicked and reported an unusable host — a false negative that looks exactly like missing KVM.

## 0.2.1

- Add optional `initramfsPath` to the launch plan and `DeskHostOptions` (defaults to `<imageRoot>/initrd` when present). A modular distro cloud kernel panics with "VFS: Unable to mount root fs" without one; CH now boots with `--initramfs` when provided.

## 0.2.0

Fixes found while deploying the Cloud Hypervisor backend against live CH v53.

- **Raw base + reflink copy-on-write overlays.** Cloud Hypervisor cannot follow
  disk backing chains: a qcow2 overlay over a qcow2/raw base is rejected with
  `UnsupportedFeature` / `MaxNestingDepthExceeded` and can never boot. The
  overlay is now a plain raw file cloned from a **raw** base image with
  `cp --reflink=auto` — an instant, block-sharing CoW clone on XFS/Btrfs and a
  graceful full-copy fallback on ext4. The `create: null` short-circuit for an
  existing overlay is unchanged.
- **Explicit `image_type=raw` disk.** The `--disk` argument is now
  `path=<overlay>,image_type=raw` so CH does not rely on deprecated image-format
  auto-detection (which warns).
- **`kernelCmdline` threaded through `DeskHostOptions`.** `createDeskHost` now
  accepts an optional `kernelCmdline` and forwards it to `buildDeskLaunchPlan`,
  so partitioned cloud images whose root is not `/dev/vda` (e.g.
  `root=/dev/vda3 rw quiet`) can boot. When omitted, the plan still falls back to
  `DEFAULT_KERNEL_CMDLINE`.

## 0.1.0

Initial release.
