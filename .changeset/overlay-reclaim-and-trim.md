---
'@braedonsaunders/appkit-desk': minor
---

Desk overlays are reclaimed, and they stop ratcheting.

- **Desk lifecycle transitions are serialized per desk.** `start`, `resume`, `suspend`, `destroy`,
  idle sweeps, and connection-loss teardown can no longer boot a replacement while the previous
  Cloud Hypervisor child is still shutting down against the same overlay. Concurrent starts and
  resumes coalesce into one boot and one handle, and a desk is not reported suspended until its VMM
  has actually stopped.

- **`destroy()` now deletes the desk's overlay.** It never did, so every destroyed desk left its
  full-size disk behind and the volume filled with the disks of desks that no longer existed.

- **Only `destroy` may do that.** `teardown()` is shared by `suspend`, `sweep`, and `destroy`, and
  for a suspended desk the overlay IS the desk — its home directory, its installed state, its
  half-written work. Reclaiming on teardown would silently wipe suspended desks, so the unlink lives
  in `reclaimOverlay`, reachable from `destroy` alone, and the contract is stated on both. The
  unlink happens strictly after the machine has stopped: unlinking under a live VMM leaves the guest
  writing into an orphaned inode instead of failing loudly. A failed unlink drops the record anyway
  and is reported through `lastError`, rather than leaving a destroyed desk leaseable.

- **A desk is trimmed in the guest just before it suspends** (`trimOnSuspend`, on by default).
  An overlay only ever grows otherwise: blocks freed inside the guest are never returned to the
  host, so a long-lived desk ratchets upward while reporting itself half empty. The guest image's
  own `fstrim.timer` fires WEEKLY, which a desk that idle-suspends after minutes almost never
  survives to see; suspend is exactly when the guest has stopped needing its scratch. Best-effort
  and bounded (`trimTimeoutMs`) — a wedged guest still suspends promptly. This cannot lose state:
  `fstrim` discards only blocks the guest's filesystem already considers free.

- **`minFreeBytes` refuses a desk the overlay filesystem cannot afford.** A guest that hits ENOSPC
  mid-boot reports a corrupt disk or simply hangs, which reads as a product bug rather than a full
  volume. The check fails OPEN if the filesystem cannot be measured.

- **`verifyOverlayReflink` / `assertOverlayReflink` detect a filesystem without reflink support.**
  `cp --reflink=auto`, which the launch plan uses so a desk still boots anywhere, is SILENT when it
  falls back: on XFS or Btrfs a 20GB base clones instantly for kilobytes, and on ext4 the identical
  command copies all 20GB per desk. The probe uses `--reflink=always`, which refuses to fall back,
  so a host can fail loudly at startup instead of filling a disk sized for sharing after two desks.
