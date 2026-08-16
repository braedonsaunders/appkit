# @appkit/desk

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

## Booting a desk

```ts
import { createDeskHost, isDeskSupported } from '@appkit/desk'

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
  baseImage: '/data/agent-disks/base.qcow2',
  overlayPath: '/data/agent-disks/overlays/agent-7.qcow2',
  memoryMb: 384,
  vcpus: 2,
})

const result = await desk.exec({ command: '/usr/bin/git', args: ['clone', repo] })
const job = await desk.exec({ command: '/usr/bin/serve', keepAlive: true }) // dies with the lease

const screen = await desk.screen.start({ width: 1280, height: 900 })
const { png, a11y, focused } = await screen.observe()
await screen.input.click(640, 320)
await desk.screen.stop() // back to headless; the machine keeps running
```

Every desk boots from one golden base image plus a per-desk copy-on-write
overlay, so patching the base patches every desk on its next boot while agent
installs and home directories persist. `buildDeskLaunchPlan` produces the
entire invocation — VMM argv, overlay-creation step, vsock socket path, TAP
device and MAC — as inspectable data before anything is spawned, and it fails
closed: a missing `/dev/kvm`, VMM binary, kernel, base image, or overlay
directory throws rather than producing a plan that cannot boot.

## Leases, idle suspend, and the queue

A desk is resident under a lease. `renewLease(ms)` extends it; activity defers
the idle timer; a desk past its lease or idle deadline is suspended — the VM
stops, the disk persists, applications cold-start on `resume`. Keep-alive jobs
die with the lease, and their termination is recorded as `job_exit` so no
process ever runs where an operator cannot see it.

Residency is bounded by a hard capacity cap. Starts beyond the cap queue FIFO
rather than overcommitting host memory. `host.stats()` reports
`{ resident, queued, capacity, suspended, lastStartedAt, lastSuspendedAt,
lastError }`; queue depth is worth alerting on. With an injected `now`, tests
drive all of this deterministically through `host.sweep()`.

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
`screen_close`, `handover_begin`, `handover_end`, `job_start`, `job_exit` —
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

Do not fall back to unconfined execution when this package reports an
unsupported host. A deployment without KVM loses the desk ability entirely —
the same fail-closed posture as the rest of AppKit.
