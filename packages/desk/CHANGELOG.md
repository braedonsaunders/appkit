# Changelog

## 0.2.5

- A delivered frame anchors the coordinate space, as an `observe()` does. The contract is that a
  click lands in the pixel space of the most recent view of the screen, and a live viewer is shown
  the frame stream, never `observe()` — so watching frames and clicking what you see was refused
  for never having observed. Technically true, and useless.

## 0.2.4

- Bound each vsock handshake attempt. Cloud Hypervisor accepts a connection on the vsock socket
  even when nothing in the guest is listening yet, and can then answer nothing at all — no reply,
  no error, no close. The attempt promise never settled, so the retry loop stopped iterating and
  the overall deadline was never re-checked: a boot hung indefinitely instead of failing. Each
  attempt now has its own timeout, and a close before the banner is treated as a refusal.

## 0.2.3

- Drain the VMM child's stdout and stderr. Both were spawned as pipes and never read, so once
  roughly 64KB of Cloud Hypervisor logging accumulated the VMM blocked on its next write and the
  guest froze partway through boot: the process alive, the guest agent never reaching vsock, and
  every symptom pointing at the image. The tail of that output now travels with a boot failure.

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
