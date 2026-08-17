# Changelog

## 0.3.2

- A desk survives losing its guest connection mid-lease. 0.3.1 stopped the host trusting a hollow
  handshake at CONNECT time, but that only covered the first connection. A channel that dropped
  later — a guest agent restart, the socat bridge going away, a transient vsock error, a guest
  wedged for a moment — still failed every pending request and marked the machine permanently dead,
  so the desk answered "no longer connected" for the rest of its lease while the guest behind it
  answered a fresh connection perfectly. The transport can lie about being connected, so the host
  now treats a live connection as something to RE-ESTABLISH rather than a fact it learned once: an
  unexpected close reconnects over the same retry path, with the same `confirmGuest` ping, under a
  bounded window (`reconnectWindowMs`) and a backing-off delay (`reconnectRetryDelayMs`).

- It never reconnects after an explicit `shutdown()`, and never once the VMM child has exited. A
  dead VMM is not a connection problem: there is no guest to get back to, and retrying against a
  corpse only delays the fresh boot the desk actually needs.

- **A request that was in flight when the channel dropped rejects with
  `DeskRequestFateUnknownError`.** It cannot be silently retried, because the frame already reached
  the guest and whether the guest ran it is not knowable from the host — an `exec` may have sent
  mail, a `click` may have landed. Replaying a side-effecting operation to paper over a blip is the
  wrong kind of resilience, so the ambiguity is named and the caller decides. A request that
  arrives *during* a reconnect instead WAITS for it, up to the same window, and one that fails
  after the desk is lost rejects with a plain `DeskError` — it never left the host, so repeating it
  is safe. The difference between those two errors is the whole contract.

- **Event subscriptions survive.** They belong to the machine, not to the socket under it, so a
  frames or video consumer keeps its subscription across a reconnect. The guest's own capture state
  does NOT survive its agent restarting, and the host does not pretend otherwise: on a reconnect it
  ENDS live `frames()`/`video()` iterators — a video consumer resumed on a fresh encoder, without
  its init segment and away from a keyframe, decodes nothing at all and says so nowhere — and
  clears the coordinate anchor, since the screen behind it may be gone or a different size. An
  active handover is deliberately left alone: unmasking a session a human may still be in fails in
  the wrong direction, so it expires on its TTL.

- **Reconnects are visible.** `DeskHostStats` gains `reconnects`, `lastReconnectAt` and
  `lastReconnectDeskId`, and every reconnect also writes `lastError` with the downtime and the
  reason. A count that climbs is a desk flapping — a guest agent restarting in a loop — and a
  reconnect that hid that would be a debugging trap. `DeskMachine.onConnectionChange` is the port
  underneath it. A desk whose connection cannot be recovered is suspended rather than left resident
  and dead, so the next `resume()` boots a healthy one instead of returning the same broken handle.

## 0.3.1

- A vsock handshake is no longer taken as proof of a guest. Cloud Hypervisor answers `CONNECT` with
  `OK` even while the guest is still booting and nothing is listening, then closes the socket a
  moment later — and because a closed machine was never retried, the desk stayed dead for the whole
  lease with a healthy guest sitting behind it. The backend now sends a ping and waits for a reply
  before adopting the connection; a hollow one is just another failed attempt.

## 0.3.0

The live view is bounded by BYTES BETWEEN THE GUEST AND THE HOST, not by encode time. Measured on a
nested guest at 1280x900: `x11grab` sustains 30fps of PNG, but at roughly 500KB a frame — 15MB/s on
an ordinary desktop and 54MB/s on dense content. That floods vsock, and about 2fps survived end to
end whether 5 or 30 were asked for. This release fixes it at the source rather than compressing the
symptom.

- **`screen.video()`** — a new async iterable beside `frames()`, delivering `DeskVideoChunk`s: the
  init segment first, then one unit per media fragment. A video codec ships the DIFFERENCE between
  pictures, and a desktop is mostly still, so the same screen costs about 1.5MB/s at 30fps on
  content dense enough to defeat prediction entirely, and far less in ordinary use. The guest
  encoder's `video-start`/`video-stop` and a `video-chunk` guest event carry it.

  A chunk carries `kind` ('init' | 'media'), the RFC 6381 `codec` string read out of the bytes
  rather than assumed, its `width`/`height`, and `keyframe`. Ordering is load-bearing: a consumer
  that never receives the init segment, or that is resumed anywhere but at a keyframe, decodes
  nothing — silently, with no error to explain it. `keyframe` is what lets a relay resync a late
  subscriber correctly.

  Video is deliberately not modelled as a kind of frame. A frame stands alone; a video chunk does
  not, and a type that blurs the two produces exactly the black-picture bug above.

- **Video anchors the coordinate space**, as `observe()` and `frames()` do (0.2.5), on every chunk
  rather than only the first — so an encoder that restarts at a new resolution re-asserts the space
  instead of leaving a stale one. Without this, a viewer driving by video has every click refused.

- **Video is masked**, exactly as frames are: nothing reaches a `video()` consumer while a handover
  is active.

- **Frames carry their encoding.** `DeskFrame` gains `format` ('png' | 'jpeg'), `frames()` accepts a
  `format`, and the guest's frame event carries it. A frame with no `format` on the wire is a PNG,
  so an older guest keeps working unchanged. `frames()` remains the right tool for a still-image
  consumer — one that hands pictures to an encoder of its own, or that cannot decode H.264 — and
  JPEG makes it an order of magnitude cheaper than it was.

- `observe()` is untouched and stays lossless PNG on demand. It feeds a model's vision and anchors
  coordinates, it is asked for rarely, and it takes the opposite trade from everything above.

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
