# @braedonsaunders/appkit-desk

Per-agent Debian machines in Cloud Hypervisor microVMs: a terminal, a
filesystem, arbitrary software, and — only when genuinely needed — a real
desktop, all on one machine with one identity.

A desk boots **headless** (a few hundred megabytes of RAM: kernel, filesystem,
network, the guest agent). The desktop environment is installed in the base
image but is not running. When work genuinely needs a screen, the compositor is
started *on the machine the agent is already using* as a service — one
filesystem, one machine, one event stream. This package owns the mechanism and
exposes ports; the consuming application supplies policy behind those ports and
owns the record. The package never touches a database and knows nothing about
tenants, employees, or approvals.

## Choosing a tier

The desk is the middle and top of a cost ladder. Reach for the cheapest tier
that does the job; the expensive tiers are strictly worse at tasks the cheap
tiers already cover.

| Tier | Surface | When | Cost |
| --- | --- | --- | --- |
| Document/tool abilities, in-process script sandboxes | No VM at all | Structured outputs, pure computation | Ordinary model calls |
| **Headless desk** (this package) | Shell, filesystem, background jobs, persistent disk | Real software, persistent state, downloads | A small resident VM |
| **Desk with a screen open** | GUI apps, pixels + opportunistic accessibility tree | Software with no CLI, visual verification | ~1.2GB+ resident, a vision call per unassisted step |

Size the concurrency cap against screen-open desks, not headless ones.

Explicit `suspend` accepts optional sidecar hooks: `beforePark` runs after guest
trim and sync, and `onPaused` runs after the Cloud Hypervisor VM pauses and
before its memory snapshot. The caller must undo partial preparation on failure,
bound hook duration, and provide durable recovery across crashes. A hook failure
is reported to `onPausedError` and ordinary memory parking continues. Backends
without the paused hook report it unavailable and park normally.

## Booting a desk

```ts
import { createDeskHost, isDeskSupported } from '@braedonsaunders/appkit-desk'

if (!isDeskSupported()) {
  // Fail closed: no KVM or no Cloud Hypervisor means no desk ability at all,
  // not a degraded one.
  throw new Error('This host cannot run desks.')
}

const host = createDeskHost({
  imageRoot: '/data/agent-disks',
  capacity: 8,
  idleSuspendMs: 5 * 60_000,
  ports: {
    policy: { allowExec: ({ command }) => policyFor(command) },
    onEvent: (event) => ledger.append(event),   // the typed desk event union
    audit: (entry) => auditLog.append(entry),   // handover boundaries only
  },
})

const desk = await host.start({
  deskId: 'agent-7',
  baseImage: '/data/agent-disks/base.img',
  overlayPath: '/data/agent-disks/overlays/agent-7.img',
  memoryMb: 384,
  vcpus: 2,
})

const result = await desk.exec({ command: '/usr/bin/git', args: ['clone', repo] })
const job = await desk.exec({ command: '/usr/bin/serve', keepAlive: true }) // dies with the lease

const screen = await desk.screen.start({ width: 1280, height: 900 })
const { png, a11y, focused } = await screen.observe() // lossless PNG, on demand
await screen.input.click(640, 320)

// The live view is a different job: H.264, for a human driving the screen.
for await (const chunk of screen.video({ fps: 30 })) {
  send(chunk) // init segment first, then one unit per media fragment
}

await desk.screen.stop() // back to headless; the machine keeps running
```

There are three ways to see the screen and they take different trades.

- **`observe()`** is what a model looks at: a lossless PNG plus windows and the
  accessibility tree, on demand and infrequent.
- **`video()`** is what a person drives by. A video codec ships the difference
  between pictures and a desktop is mostly still, so it costs one to two orders
  of magnitude fewer bytes than the same screen as stills — and bytes between
  the guest and the host are what actually bounds a live view. Chunks are
  ordered: the `init` segment first, then `media` fragments, resumable only at
  one whose `keyframe` is true.
- **`frames()`** is for a consumer that needs whole pictures — one feeding an
  encoder of its own, or one that cannot decode H.264. `format` picks `jpeg`
  (roughly a tenth the bytes) or `png` (exact).

All three are the screen's real size and never rescaled, so all three anchor the
coordinate space a click is aimed in. `video()` and `frames()` are both masked:
neither emits anything while a handover is active.

Every desk boots from one golden **raw** base image plus a per-desk
copy-on-write overlay, so patching the base patches every desk on its next boot
while agent installs and home directories persist. The overlay is a plain raw
file cloned from the base with `cp --reflink=auto` — an instant, block-sharing
CoW clone on XFS/Btrfs and a graceful full-copy fallback on ext4. It is
deliberately *not* a qcow2 backing overlay: Cloud Hypervisor cannot follow disk
backing chains and rejects them (`UnsupportedFeature` /
`MaxNestingDepthExceeded`), so the disk is passed as `image_type=raw` with no
chain to follow. `buildDeskLaunchPlan` produces the entire invocation — VMM
argv, overlay-creation step, vsock socket path, TAP device and MAC — as
inspectable data before anything is spawned, and it fails closed: a missing
`/dev/kvm`, VMM binary, kernel, base image, or overlay directory throws rather
than producing a plan that cannot boot.

## Leases, idle suspend, and the queue

A desk is resident under a lease. `renewLease(ms)` extends it; activity defers
the idle timer; a desk past its lease or idle deadline is suspended — the VM
stops, the disk persists, applications cold-start on `resume`. Keep-alive jobs
die with the lease, and their termination is recorded as `job_exit` so no
process ever runs where an operator cannot see it.

`host.canPause(deskId)` reports whether a resident desk supports in-memory
pause. Cloud Hypervisor supports `await host.pause(deskId)` and
`await host.resume(deskId)`; other backends can decline it. A paused desk keeps
its handle, capacity slot, running jobs and original lease and idle deadlines.
Guest requests are rejected while paused; requests already in flight fail with
unknown fate. A guest connection lost during the pause reconnects on resume.
An active handover prevents pause. Suspend and shutdown resume the desk before
trimming and syncing. Lifecycle operations, including lease sweeps, serialize
per desk. If a control operation fails and the VM state cannot be confirmed,
the desk remains fenced; retry `resume` after the control socket is available.
Existing guest service streams remain open, but cannot make progress while the
VM is paused.

`host.shutdown(deskId)` is a restart, not a destroy: a resident desk is synced
and shut down instead of parked, a parked desk's memory snapshot is discarded,
and the overlay stays, so the next `start` or `resume` cold boots from disk.
Use it when a desk must come back fresh — new memory or vCPU settings, or a
guest wedged in a way a resume would bring straight back.

Residency is bounded by a hard capacity cap. Starts beyond the cap queue FIFO
rather than overcommitting host memory. `host.stats()` reports
`{ resident, queued, capacity, suspended, lastStartedAt, lastSuspendedAt,
reconnects, lastReconnectAt, lastReconnectDeskId, lastError }`; queue depth is
worth alerting on, and so is a `reconnects` count that climbs. With an injected
`now`, tests drive all of this deterministically through `host.sweep()`.

## A connection is re-established, not assumed

The vsock channel to a guest is not a fact learned once at boot. It can drop
mid-lease for reasons that say nothing about whether the desk is usable — the
guest agent restarts, the bridge drops, the guest wedges for a moment — and
treating that as terminal stranded the desk for the rest of its lease with a
healthy guest behind it. So the backend reconnects: same retry path, same
`confirmGuest` ping, bounded window and backoff. It never reconnects after
`shutdown()` or once the VMM has exited, because then the desk genuinely needs
a fresh boot; when the window runs out the host suspends the desk so `resume()`
boots a new one instead of handing back a dead handle.

Two things a caller must handle, because pretending otherwise would be a lie:
a request that was **in flight** when the channel dropped rejects with
`DeskRequestFateUnknownError` — the guest may already have run it, and silently
replaying an `exec` that sent mail is the wrong kind of resilience. And the
guest's own capture state does not survive its agent restarting, so live
`frames()`/`video()` iterators **end** on a reconnect and the coordinate anchor
is cleared; observe (or take a frame) again before aiming.

## The coordinate contract

**Input coordinates are in the pixel space of the most recent `observe()`,
one to one.** Any scaling applied on the way out must be undone on the way in.
The package enforces this rather than documenting it and hoping: coordinate
input before the first `observe()`, or outside its bounds, throws. Getting
this wrong makes every click land slightly off in a way that looks like model
failure and is very hard to diagnose.

Perception is pixels-primary: `observe()` always returns a PNG, and
opportunistically includes the focused application's AT-SPI accessibility tree
(`a11y`) when one is exposed. `screen.a11y.invoke(nodeId, action)` targets by
role and name when a tree exists; the pixel path always works.

## The handover masking contract

`screen.handover.begin({ ttlMs, scope })` returns a URL through which a human
can view or control the screen — for example to complete a login the agent
cannot. The masking rules are load-bearing:

- While a handover is active, **input events never reach the `onEvent`
  recording port** — no `click`, `type`, `key`, `scroll`, `drag`,
  `window_focus`, or `app_launch` is emitted, even though the input itself is
  faithfully forwarded to the guest.
- **Frames are not emitted** to `frames()` consumers for the duration.
- **`clipboard.read()` is refused** during a handover, so a freshly typed
  credential cannot ride the clipboard into the agent's context.
- Only `handover_begin` and `handover_end` cross the boundary, carrying actor,
  scope, and duration — never content. Both reach `onEvent` (for the ledger)
  and the `audit` port.

A handover ends explicitly, at its TTL (`reason: 'expired'`), or when the desk
is suspended (`reason: 'revoked'`). The failure this prevents is concrete:
keystrokes typed by a human during a credential handover leaking into an
append-only record that cannot be edited afterward.

## The event union

`onEvent` receives a closed union — `shell_command`, `app_launch`, `click`,
`type`, `key`, `scroll`, `drag`, `window_focus`, `screen_open`,
`screen_close`, `handover_begin`, `handover_end`, `job_start`, `job_exit`,
`snapshot_cpu_fallback` —
each stamped with `deskId` and an ISO timestamp. The union is defined here so
the consumer's ledger and this package agree on the taxonomy; persistence is
entirely the consumer's concern.

## The backend port and the guest agent

`DeskBackend` is the seam that keeps everything testable without a hypervisor:
`boot(plan)` returns a `DeskMachine` — a request/response channel to the
in-guest agent plus an event subscription. The default is
`cloudHypervisorBackend`, which creates the overlay, spawns Cloud Hypervisor
with the plan's argv, performs the vsock `CONNECT` handshake, and speaks the
framed protocol. Its process-spawning glue is thin on purpose; the launcher
and the socket transport are injectable, and CI substitutes in-memory fakes.

The wire protocol — length-prefixed JSON frames with bounded sizes, strict
field validation, and a closed operation set — is pure code in `protocol.ts`,
shared by both ends. The in-guest agent (`guest-agent.ts`) is the
security-critical piece: it is the only new attack surface in the design, so
it is small enough to read in one sitting, does no parsing it does not need,
dispatches through a closed switch, and treats any framing violation as fatal
to the connection. Its message-handling core is pure and hard-tested; contact
with the guest OS is injected as handlers by the guest's init glue.

`verifyDeskHost()` belongs in service startup: it boots a throwaway microVM
through the backend and distinguishes a host that is unusable (wrong platform,
missing VMM or images — throws) from capabilities that are merely absent,
reported as booleans: `kvm`, `vsock`, and `virtioGpu`.

Every additional provider runs `verifyDeskBackendConformance()` against a
disposable launch plan. The shared check verifies request/capability round trips,
idempotent terminal shutdown, and refusal of work after shutdown. Provider test
suites extend this contract; they do not restate it.

`exportPortableDeskHome()` and `importPortableDeskHome()` are the migration seam
between providers. Sources expose entries and file bytes; exports produce a
bounded, sorted, content-addressed manifest preserving directories, files,
safe relative symlinks, modes, and timestamps. Imports verify every SHA-256,
path, symlink target, size, and aggregate limit before opening a sink, then
stage the complete home and make it authoritative with one `commit()`. Any
failure calls `rollback()`. This moves an agent's working home, not an operating
system image: installed packages and provider-specific machine state remain
the provider's concern.

`createDeskFrameDeduplicator()` assigns exact SHA-256 identities to observations
without retaining their bytes. A repeated identity can reuse the prior audit
frame and omit another model image; reset it whenever the capture session or
masking boundary changes.

Do not fall back to unconfined execution when this package reports an
unsupported host. A deployment without KVM loses the desk ability entirely —
the same fail-closed posture as the rest of AppKit.

## Routed guest networking and TCP services

`deskNetworkIdentity(index)` returns a deterministic TAP name and MAC address. `createDeskNetwork({ gateway, dns, egress, chainPrefix?, allowHostPorts?, prefixLength?, runner?, enableForwarding? })` provides routed point-to-point TAP setup. Set `egress: { mode: 'open' }` to masquerade guest-originated IPv4 traffic for arbitrary TCP and UDP; IPv6 traffic on the TAP is blocked with `ip6tables` so it cannot bypass host isolation; new inbound forwarded connections are dropped. Set `egress: { mode: 'proxied', httpProxyPort, httpsProxyPort }` to transparently redirect HTTP and HTTPS to proxy listeners, pin DNS to the supplied resolver, and drop other guest egress. The proxy supplies destination policy. Both modes drop new connections to host services, except TCP and UDP ports explicitly listed in `allowHostPorts` on the gateway address; proxied mode also permits its proxy listeners. Established replies to host-initiated guest connections are accepted.

The default iptables chain prefix is `desk`. Existing deployments using the `bh` chains must supply `chainPrefix: 'bh'` to retain those names during a rolling upgrade and avoid orphaning the old rules. `ensure({ tap, guest })` must finish before boot; `teardown({ tap, guest })` removes its rules and TAP after the VM stops. Configure Linux IPv4 forwarding, NET_ADMIN, `ip`, and `iptables` in the host namespace; open mode also requires `ip6tables`. When changing egress modes, tear down the old mode before installing the new one. `configureGuest(desk, { tap, guest })` configures the guest interface, route, and resolver through exec. `syncDeskGuestClock(desk, now?)` sets the guest clock after wake. Failures are reported to the caller. Operations on one TAP are serialized within the network instance; use one instance per namespace. Rule replacement uses multiple iptables commands and is not atomic: call `ensure` before the VM starts, and do not refresh rules on a live TAP.

Supply `network: { tapDevice, macAddress, guestAddress }` to `host.start`, then `await desk.connect(port)` returns a Node `Duplex` TCP stream to the guest. The caller owns the stream; suspension closes it. A service must listen on the guest interface, and its protocol and authentication remain the application's responsibility. `connectGuest` on host options injects a dialer for testing.

`freePageReporting: true` on `host.start` configures a zero-size
virtio-balloon with free-page reporting on a Cloud Hypervisor cold boot. It
requires guest driver support; the snapshot retains its original device
configuration. Reporting frees host memory when the guest reports unused pages;
it does not promise a particular snapshot size. Virtualization.framework does
not support this option.

With Cloud Hypervisor v54 or later, `memoryRestoreMode: 'copyonwrite'` opts in
to file-backed restore alongside `parkWithMemory: true`. The parked snapshot is
atomically renamed to a unique source and its parent directory synced before
the VMM starts, so it cannot be replayed after the disk changes. The source is
kept unchanged until the VMM exits, then removed. A host crash or failed stop can
leave a `*.snapshot.source-*` directory; only remove it after verifying that no
VMM maps it. Restore failures can leave one too. The source contains guest RAM
and needs the same protection as a parked snapshot. Copy-on-write restore refuses virtio-fs shares, including shares recorded in
a parked snapshot. Cloud Hypervisor can fall back to eager copying for other
incompatible memory or devices. Separate reflinked
files do not share page-cache identity, and this option does not create cloned
template guests or promise incremental snapshots.

With `parkWithMemory`, new snapshots carry a host CPU signature. A changed signature skips restore and cold boots; Cloud Hypervisor's specific incompatible-CPUID restore error also triggers a cold boot. These outcomes increment `stats().snapshotCpuFallbacks`, set `lastSnapshotCpuFallback`, and emit `snapshot_cpu_fallback`, rather than setting `lastError`. Existing snapshots without a signature are attempted normally. Signatures are conservative CPU identity and feature fingerprints, not a guarantee of CPUID compatibility; a cold boot loses the parked process state. Keep snapshots and their overlays together.

For a disposable real-host check, provide a guest image with the desk agent and Python 3, Cloud Hypervisor, KVM, and a free TAP name and IP pair. Run from the repository root in the target network namespace with privileges to manage TAP and iptables:

```sh
DESK_CHECK_TAP=dsk9001 DESK_CHECK_GUEST=172.30.0.2 DESK_CHECK_GATEWAY=172.30.0.1 \
DESK_CHECK_IMAGE_ROOT=/data/desk-image DESK_CHECK_BASE_IMAGE=/data/desk-image/base.img \
DESK_CHECK_TMPDIR=/data/tmp pnpm --filter @braedonsaunders/appkit-desk exec tsx scripts/check-kvm.mts
```

Set `DESK_CHECK_COW=1` to exercise copy-on-write snapshot restore and `DESK_CHECK_BALLOON=1` to check the guest virtio-balloon driver. Set `DESK_CHECK_KERNEL_CMDLINE` for images that require a custom root device. The check creates and removes a disposable VM, overlay, snapshot, TAP and firewall rules. It verifies resident pause and resume, and a guest HTTP stream before and after memory restore; it does not verify the proxy or cross-CPU migration. Choose addresses that do not overlap existing routes. Set `DESK_CHECK_VIRTIOFSD` to a `virtiofsd` binary to also check a read-only share: the guest mounts it, a write fails, and a file held open across the park reads back after the restore.

The check uses a unique desk ID and private runtime directory. Set `DESK_CHECK_CID`
to a free guest CID when testing alongside other hosts. Put `DESK_CHECK_TMPDIR` on
the same reflink-capable filesystem as the base image to avoid a full disk copy.
Run inside a disposable network namespace when testing on a machine with an active
host. `DESK_CHECK_VMM` selects a test binary without changing the system VMM.

With the [pinned incremental build](vmm/README.md), set `DESK_CHECK_INCREMENTAL=1`
and `DESK_CHECK_COW=1` on XFS or Btrfs. This retains a hard link to the original
memory file, verifies its digest after another park, checks shared filesystem
extents, and confirms the guest HTTP process survives a second restore. It uses
`filefrag` from e2fsprogs. A failed VMM stop leaves the test files in place for
recovery instead of deleting backing files from a live process. The check does
not measure latency or memory savings.

`memoryRestoreMode: 'ondemand'` selects Cloud Hypervisor's userfaultfd page-on-access
restore instead of its default eager copy. It requires Linux 6.6 or newer and
permission to open `/dev/userfaultfd` or use the corresponding syscall. It rejects
virtio-fs shares and does not silently cold boot when restore is unavailable. The
source snapshot is durably retired before boot and retained until the VMM stops;
an interrupted restore leaves a durable fence requiring operator recovery. The
mode can be selected per host or per desk and is separate from copy-on-write
restore: it does not share CoW pages or enable incremental snapshot writes.
Run the disposable check with `DESK_CHECK_RESTORE_MODE=ondemand` to exercise it.

## Host directory shares

A desk can mount host directories over virtio-fs. Pass `shares` to
`host.start` (or `buildDeskLaunchPlan`):

```ts
const desk = await host.start({
  deskId: 'agent-7',
  baseImage: '/data/agent-disks/base.img',
  overlayPath: '/data/agent-disks/overlays/agent-7.img',
  shares: [
    { tag: 'tools', path: '/srv/desk-tools', readOnly: true },
    { tag: 'build', path: '/srv/builds/agent-7', readOnly: false },
  ],
})
await desk.exec({ command: '/bin/sh', args: ['-c', 'mkdir -p /opt/tools && mount -t virtiofs tools /opt/tools'] })
```

A `tag` is 1–36 lowercase letters, digits or hyphens, starting with a letter or
digit, and unique within the desk; it is the name the guest mounts. `path` is an
absolute path to an existing host directory. `readOnly` is required. A read-only
share is enforced by the host's file server, so remounting it read-write in the
guest does not make it writable. The guest kernel needs virtio-fs
(`CONFIG_VIRTIO_FS`; Debian's cloud kernels ship it as the `virtiofs` module).

On Cloud Hypervisor, each share is served by its own `virtiofsd` (the Rust
implementation, 1.13 or later). `virtiofsdPath` on the host options names the
binary; without it the first `virtiofsd` on `PATH` is used, then
`/usr/libexec/virtiofsd`. A desk without shares does not need `virtiofsd`. Each
daemon runs as the launcher identity with:

```sh
virtiofsd --socket-path=<runtimeDir>/desk-<deskId>.<tag>.fs.sock --shared-dir=<path> \
  --sandbox=<namespace|chroot> --cache=auto \
  --migration-mode=find-paths --migration-on-error=guest-error [--readonly]
```

and the VMM gets `--fs tag=<tag>,socket=<socket>` with its memory as
`size=<n>M,shared=on`, which vhost-user devices require; a desk without shares
keeps private memory. `--cache=auto` lets the guest cache for about a second,
so files the host changes under a share appear in running guests.
`virtiofsdSandbox` picks how the daemon confines itself to the directory:
`namespace` (the default) needs CAP_SYS_ADMIN when the launcher is root and
unprivileged user namespaces otherwise; `chroot` needs root and suits a
container that cannot create namespaces. Both prevent symlink escapes. The
backend starts every daemon and waits for its socket before starting the VMM,
on a boot and on a restore, and stops the daemons after the VMM. A daemon that
exits while its VMM runs stops the VMM, so the desk is lost rather than left
with a share that no longer answers. `virtiofsd` also exits when its VMM
disconnects. The share socket path must fit in 107 bytes.

On Virtualization.framework, each share is a
`VZVirtioFileSystemDeviceConfiguration` with a `VZSingleDirectoryShare`, and the
framework enforces `readOnly`. `virtiofsdPath` and `virtiofsdSandbox` are
refused there. When Virtualization.framework reports that a configuration
cannot be saved, the desk parks by shutting down, as for any other device.

Parking keeps a desk's shares with its memory. The backend records them in
`shares.json` beside the snapshot, and a restore uses that record instead of the
start options: a snapshot holds its devices, so a share added since joins the
desk at its next cold boot (`host.shutdown` forces one), and a backend refuses a
restore plan whose shares differ from the record. A recorded share whose
directory no longer exists fails the restore; the host discards the snapshot,
cold boots with the current shares, and reports it in `lastError`. A snapshot
holds no share contents. On Cloud Hypervisor it carries each daemon's state,
which the new daemon loads on restore by reopening every file and directory the
guest held by its path, so open files survive. Paths are the link: a file the
host unlinks or moves while the desk is parked returns errors to the guest for
that file only, and a file the host puts at its path is the one the guest gets.

## macOS Virtualization.framework backend

On Apple silicon with macOS 14 or later, a host can supply a signed
`appkit-desk-vz` helper to `createVirtualizationBackend` and pass that backend
into `createDeskHost`:

```ts
import { createDeskHost, createVirtualizationBackend, isDeskSupported } from '@braedonsaunders/appkit-desk'

const helperPath = '/opt/appkit/bin/appkit-desk-vz'
if (!isDeskSupported({ helperPath })) throw new Error('This host cannot run desks.')
const backend = createVirtualizationBackend({ helperPath })
const host = createDeskHost({
  imageRoot: '/var/lib/appkit/desk',
  backend,
  guestNetwork: { allowLan: false },
  ports,
})
```

The guest needs an arm64 Linux kernel, raw base image and the same desk guest
agent as the Linux backend. Use the kernel command line appropriate to the
image. Per-desk disks use macOS `cp -c`; provision the overlay directory on a
filesystem that supports cloning. The helper creates a userspace IPv4 network
with DHCP, defaults to `10.0.2.15/24` and gateway `10.0.2.2`, and blocks
private, link-local, shared and host addresses by default. RFC 5737 documentation
subnets (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) are always blocked,
including when LAN access is allowed. Set `allowLan` only
when the host policy explicitly permits local network access. `DeskHandle.connect`
uses the helper's TCP relay; no routable guest IP on the Mac is required.

The npm package includes the Swift source under `vz/`. Build it on macOS with
Xcode and `vz/build.sh`; the script signs with the required virtualization
entitlement. Its default ad hoc signature is for local use. Distributors must
sign with their own Developer ID (`APPKIT_CODESIGN_IDENTITY`) and handle
notarization and distribution. The caller supplies the absolute installed
helper path; installation does not download or execute a binary. Save and
restore use a stable desk MAC and machine identifier; the host removes the
snapshot while the restored VM is paused before resuming it. The userspace
network is recreated on restore, so existing TCP and UDP flows must reconnect.

For a disposable macOS integration check, supply a prepared guest image with
its desk agent and Python 3, its matching `vmlinux` and `initrd`, and the signed
helper. In a source checkout, run `packages/desk/scripts/check-vz.mts` with `DESK_CHECK_IMAGE_ROOT`,
`DESK_CHECK_BASE_IMAGE`, and `DESK_CHECK_VZ_HELPER`; set
`DESK_CHECK_KERNEL_CMDLINE` if the image uses a different root device. The
check creates a temporary guest and tests guest execution, a private-host
network fence, guest TCP access, and memory save/restore. It removes the guest
and its temporary files on exit.

For clients that require a local TCP URL, `await listenDeskPort(desk, port)`
returns a loopback-only `{ host, port, close }` listener. Each incoming
connection opens a guest stream through `desk.connect`; call `close()` when the
lease ends to close the listener and its connections.

Cloud Hypervisor backends can opt into `serviceVsock: true` when their guest image provides
vsock service listeners. `DeskHandle.connect(port)` then opens that vsock port using the
Cloud Hypervisor socket handshake. The default remains TCP for existing guest images.

## Immutable image attachments

On Cloud Hypervisor, `DeskStartOptions.readOnlyAttachments` accepts an ordered list of
`{ path, sha256, kind }`, where `kind` is `block` or `pmem` and `sha256` is the
lowercase SHA-256 of the image. Block devices are attached read-only; pmem uses
`discard_writes=on`, so guest writes do not persist. The caller must keep each file
and its path immutable and available for as long as a desk or its snapshot uses it.
AppKit hashes each image on start and records the attachment list with the snapshot;
restore refuses a changed list before resuming. Virtualization.framework rejects
attachments. Device support and filesystem mount options depend on the guest kernel.

Cloud Hypervisor backends accept `inheritedFds`, a list of open descriptors to
retain in the VMM and each share daemon, mapped to consecutive child descriptors
starting at 3. Keep each descriptor open until the backend has stopped its
children. For example, a host can retain an advisory lock in those processes
so that an orphaned VMM continues to fence offline disk operations. The caller
is responsible for acquiring and validating the lock and for ensuring the
executables do not close the inherited descriptors. Run
`python3 packages/desk/scripts/check-inherited-lock.py` from the repository to
check descriptor inheritance and release with disposable processes.
### Snapshot memory pins

`pinTemplateMemory(source, destination, config)` creates an exclusive child
snapshot directory with a hard link to the source `memory-ranges` inode and
private `state.json` and `config.json` files. `assertPinnedTemplateMemory`
checks the publication marker, source inode, and read-only mode before use.
Source and destination must be on the same filesystem. The caller must keep
the memory bytes unchanged for the lifetime of every child and prevent all
writers, including processes with permission to change the file mode. Removing
the source pathname does not invalidate an existing hard link.

These filesystem operations alone do not establish that a snapshot is safe to
clone. A caller must independently validate its contents and compatibility,
prepare independent disk and device identities, fence the guest until it has
been reinitialized, and retain each memory pin while its VM can use it. A
partially published destination is left in place after an interruption and
must not be restored. Remove it only after verifying no VM is using it.

`planTemplateConfig` checks a snapshot config for a restricted Cloud Hypervisor
copy-on-write configuration and produces a child-specific copy with distinct
disk, TAP, MAC and vsock endpoints. It does not create a disk or establish
that any of those identities are globally unique. Cloud Hypervisor restores
virtio-net configuration from saved device state, so the guest must also change
its live MAC under an external network fence before traffic is allowed.
Read-only attachments retain their paths; the caller must verify their contents.

`strictMemoryRestore` refuses a missing or mismatched saved CPU identity and
refuses a cold-boot fallback when a restore fails. Before restore it writes a
durable `.restore-pending` marker beside the snapshot. The marker stays until a
later memory park has completed and its snapshot files are synced. If the host
restarts with the marker present, wake fails and requires operator recovery;
the disk and retired source are not automatically deleted. This is a lifecycle
fence, not a template registration or guest identity reset.

`registerDeskTemplate` records the hashes of a stopped, read-only template disk,
snapshot files, kernel, initramfs and read-only attachments together with its VMM
and CPU identities. The caller must supply actual VMM and CPU identities and
prepare the source in isolation without user data or credentials. Hashing cannot
establish that provenance. The source and its memory inode must be protected
against all writers for the lifetime of its descendants.

`forkDeskTemplate` checks the registration and actual file bytes, reserves a new
private directory, copies the template disk into an independent writable file,
and pins the same snapshot memory inode in the child directory for its lifetime,
including while parked. Its returned disk and snapshot are
prepared artifacts, not a running VM. A caller must verify `.prepared`, establish
an external network and workload fence before restore, reinitialize the guest's
identity and entropy, and only then allow traffic or guest workloads. An
interrupted preparation leaves a directory without `.prepared`; it must not be
restored. Retain and inspect it before cleanup.

A caller can pass `template` in `DeskStartOptions` on a Cloud Hypervisor host
with memory parking enabled. This opts that desk into strict copy-on-write restore
without changing the restore mode of other desks. Its `holdFence` callback establishes the external network fence before
preparation or restore, including when preparation was interrupted. Its `prepare`
callback receives the assigned launch plan and creates the disk and snapshot. AppKit verifies their device and resource identities against that
plan. After restore, `initialize` runs before the desk handle is exposed;
only after it succeeds and the initialization marker is durable does
`releaseFence` run. If initialization fails, AppKit stops the guest, preserves
the interruption marker and does not release the fence. The caller is
responsible for ensuring the source has no running user workloads at capture
and for resetting guest entropy and identity in `initialize`.

A caller may supply `vsockCid` on a start to use a stable guest CID. AppKit
rejects collisions among CIDs allocated by the same host instance; the caller
must also keep that allocation unique across host instances and restarts.

A descendant may select strict memory handling and copy-on-write restore per
start without requesting template initialization again. Explicit `shutdown`
stops that known VM, discards its memory and clears its interruption marker;
this permits an intentional cold restart of its existing disk.
