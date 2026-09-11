/**
 * The backend port and its default Cloud Hypervisor implementation.
 *
 * `DeskBackend` is the seam that keeps the package testable without a
 * hypervisor: the host asks a backend to boot a `DeskLaunchPlan` and gets a
 * `DeskMachine` — a request/response channel to the in-guest agent plus an
 * event subscription. CI and non-KVM developer machines inject an in-memory
 * fake; production uses `cloudHypervisorBackend`, whose process-spawning glue
 * is deliberately thin because everything that can be pure lives in the plan
 * builder and the protocol module.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { createConnection } from 'node:net'
import { Buffer } from 'node:buffer'
import type { Duplex } from 'node:stream'
import { DeskError, type DeskLaunchPlan, type DeskLauncherIdentity } from './plan'
import {
  encodeFrame,
  FrameDecoder,
  GUEST_AGENT_VSOCK_PORT,
  parseHostBoundMessage,
  type GuestCommand,
  type GuestEventMessage,
  type HostBoundMessage,
} from './protocol'

/**
 * A request that was in flight when the guest connection dropped.
 *
 * Distinct from a plain `DeskError` because the caller's next move is
 * different: this request may ALREADY HAVE RUN. The frame reached the guest,
 * and whether the guest executed it before the channel went away is not
 * knowable from the host. An `exec` may have sent mail; a `click` may have
 * landed. So the transport refuses to guess — it names the ambiguity and lets
 * the caller decide whether the operation is safe to repeat. Anything that
 * rejects with a plain `DeskError` instead never reached the guest at all.
 */
export class DeskRequestFateUnknownError extends DeskError {
  override readonly name: string = 'DeskRequestFateUnknownError'
}

/**
 * What happened to the transport underneath a machine.
 *
 * `reconnected` means the host lost the guest channel mid-lease and got it
 * back; the desk is usable again. It is NOT a promise that the guest is
 * unchanged — see the note on `onConnectionChange`. `lost` means it will not
 * come back on this VM and the desk needs a fresh boot.
 */
export type DeskConnectionChange =
  | {
      state: 'reconnected'
      deskId: string
      /** How the previous connection went away. */
      reason: string
      /** Wall-clock time the desk spent with no channel to its guest. */
      downtimeMs: number
      /** Reconnects this machine has survived, including this one. */
      reconnects: number
    }
  | {
      state: 'lost'
      deskId: string
      /** Why it is gone for good: the VMM exited, or the window ran out. */
      reason: string
    }

/** A booted microVM as the host sees it: one desk, one guest-agent channel. */
export interface DeskMachine {
  readonly deskId: string
  /**
   * Send one request to the in-guest agent and await its correlated result.
   *
   * Rejects with `DeskError` when the guest reports an error, the request
   * times out, or the connection is gone for good — in that last case the
   * request never left the host, so repeating it is safe.
   *
   * A connection lost mid-lease is re-established rather than fatal: a call
   * that arrives while that is happening WAITS for it instead of failing.
   * A call that was already in flight when the channel dropped rejects with
   * `DeskRequestFateUnknownError`, because the host cannot tell whether the
   * guest ran it.
   */
  request(command: GuestCommand, options?: { timeoutMs?: number }): Promise<unknown>
  /**
   * Subscribe to unsolicited guest events (job exits, frames, focus changes).
   *
   * Subscriptions belong to the machine, not to the socket under it, so they
   * survive a reconnect. What does NOT survive is the guest's own capture
   * state: a guest agent that restarted has no screen, no frame encoder and
   * no video encoder, and a subscriber will simply stop receiving. Watch
   * `onConnectionChange` to notice.
   */
  subscribe(listener: (event: GuestEventMessage) => void): () => void
  /**
   * Watch the transport under this machine.
   *
   * Optional: a backend whose channel cannot drop has nothing to report. The
   * default backend reports every reconnect, because a reconnect that leaves
   * no trace turns a guest agent restarting every few minutes into a desk that
   * misbehaves for reasons nobody can find.
   */
  onConnectionChange?(listener: (change: DeskConnectionChange) => void): () => void
  /** Stop the VM. Idempotent; resolves once the VMM process has exited. */
  shutdown(): Promise<void>
  /**
   * Park the VM with its memory, so resuming continues the process tree.
   *
   * Optional: a backend with no snapshot facility simply does not offer it, and
   * the host falls back to `shutdown()`. Pauses the guest, writes a snapshot to
   * `snapshotDir`, then stops the VMM — and resolves only once all three have
   * happened, because a caller that believed a snapshot exists when it does not
   * would later refuse to boot the desk at all.
   *
   * The caller is responsible for quiescing the guest filesystem first. A paused
   * guest still holds dirty pages that exist only in the snapshot, so a disk
   * parked without a prior `sync` is consistent only *with that snapshot* —
   * which matters the moment the snapshot is discarded.
   */
  park?(snapshotDir: string): Promise<void>
}

export interface DeskBootHooks {
  /**
   * Called on a restore, after the snapshot has been read back and before the
   * guest is allowed to run.
   *
   * This is the window in which the snapshot must be destroyed. A memory image
   * is valid only against the disk it was taken with, so once the guest resumes
   * and writes, any surviving snapshot describes a past that no longer matches —
   * and replaying it later would corrupt the desk. Restoring paused and
   * invalidating here is what makes that impossible rather than unlikely.
   *
   * Throwing aborts the restore: the VM is stopped and the caller is free to
   * cold boot, which is safe because a paused guest has written nothing.
   */
  onRestored?: () => Promise<void>
}

export interface DeskBackend {
  boot(plan: DeskLaunchPlan, hooks?: DeskBootHooks): Promise<DeskMachine>
}

export type DeskProcessLauncher = (
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity },
) => ChildProcess

export interface CloudHypervisorBackendOptions {
  /** Spawns the VMM and image tooling; injectable for tests. */
  launcher?: DeskProcessLauncher
  /** Opens the host side of the vsock Unix socket; injectable for tests. */
  connect?: (socketPath: string) => Duplex
  platform?: NodeJS.Platform
  /**
   * Clock behind every connect and reconnect deadline. Injectable for the same
   * reason `DeskHostOptions.now` is: a test drives a window to its end by
   * moving the clock, rather than sleeping for it and hoping the machine it
   * runs on is fast enough.
   */
  now?: () => number
  idFactory?: () => string
  requestTimeoutMs?: number
  connectTimeoutMs?: number
  connectRetryDelayMs?: number
  /** Bound on a single handshake attempt; see attemptHandshake. */
  handshakeTimeoutMs?: number
  /**
   * How long a machine keeps trying to get its guest channel back after an
   * unexpected drop before declaring the desk lost. Bounded on purpose: the
   * VMM is still alive so a reconnect is cheap and usually fast, but retrying
   * forever against a guest that is never coming back is worse than failing.
   */
  reconnectWindowMs?: number
  /**
   * First delay between reconnect attempts. It doubles toward a ceiling, so
   * this is the fast first poll rather than the steady rate. Separate from
   * `connectRetryDelayMs`, which is sized for a guest that is still cold
   * booting; here the guest was up a moment ago.
   */
  reconnectRetryDelayMs?: number
  killGraceMs?: number
  guestAgentPort?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000
const DEFAULT_CONNECT_RETRY_DELAY_MS = 100
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000
const DEFAULT_RECONNECT_WINDOW_MS = 30_000
const DEFAULT_RECONNECT_RETRY_DELAY_MS = 250
/**
 * How far the reconnect delay is allowed to double. A guest agent that systemd
 * is restarting is not helped by being hammered four times a second for the
 * whole window, and an unbounded doubling would spend most of the window
 * asleep after two failures.
 */
const RECONNECT_BACKOFF_CEILING = 8
const DEFAULT_KILL_GRACE_MS = 2_000
const HANDSHAKE_LINE_LIMIT = 128

export function createCloudHypervisorBackend(
  options: CloudHypervisorBackendOptions = {},
): DeskBackend {
  const launcher = options.launcher ?? defaultLauncher
  const connect = options.connect ?? defaultConnect
  const platform = options.platform ?? process.platform
  const now = options.now ?? Date.now
  const idFactory = options.idFactory ?? randomUUID
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
  const connectRetryDelayMs = options.connectRetryDelayMs ?? DEFAULT_CONNECT_RETRY_DELAY_MS
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
  const reconnectWindowMs = options.reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS
  const reconnectRetryDelayMs = options.reconnectRetryDelayMs ?? DEFAULT_RECONNECT_RETRY_DELAY_MS
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS
  const guestAgentPort = options.guestAgentPort ?? GUEST_AGENT_VSOCK_PORT

  async function boot(plan: DeskLaunchPlan, hooks?: DeskBootHooks): Promise<DeskMachine> {
    if (platform !== 'linux') {
      throw new DeskError(`The AppKit desk requires Linux; received ${platform}.`)
    }
    if (plan.overlay.create) {
      await runToCompletion(
        launcher(plan.overlay.create.command, plan.overlay.create.args, {
          identity: plan.launcherIdentity,
        }),
        `overlay creation for desk ${plan.deskId}`,
      )
    }

    const child = launcher(plan.vmm.command, plan.vmm.args, { identity: plan.launcherIdentity })
    const log = drainOutput(child)
    const exit = watchExit(child)

    // A restored guest comes back PAUSED (see the `resume=false` reasoning in
    // the plan). Three things have to happen in this order and nowhere else:
    // prove the restore finished, let the caller destroy the snapshot while the
    // guest still cannot write, then start it.
    if (plan.snapshot.restoring) {
      try {
        await waitForVmm(vmmApi, plan.api.socketPath, { now, exited: exit, timeoutMs: connectTimeoutMs })
        await hooks?.onRestored?.()
        await vmmApi(plan.api.socketPath, '/api/v1/vm.resume')
      } catch (error) {
        await terminate(child, exit, killGraceMs)
        const said = log.tail()
        const detail = said === '' ? '' : ` The VMM said: ${said}`
        throw new DeskError(
          `Desk ${plan.deskId} could not be restored from ${plan.snapshot.dir}: ${errorMessage(error)}${detail}`,
        )
      }
    }

    let stream: Duplex
    try {
      stream = await connectWithRetry({
        connect,
        now,
        socketPath: plan.vsock.socketPath,
        port: guestAgentPort,
        timeoutMs: connectTimeoutMs,
        retryDelayMs: connectRetryDelayMs,
        attemptTimeoutMs: handshakeTimeoutMs,
        exited: exit,
      })
    } catch (error) {
      await terminate(child, exit, killGraceMs)
      const said = log.tail()
      const detail = said === '' ? '' : ` The VMM said: ${said}`
      throw error instanceof DeskError
        ? new DeskError(`${error.message}${detail}`)
        : new DeskError(
            `Could not reach the guest agent for desk ${plan.deskId}: ${errorMessage(error)}${detail}`,
          )
    }
    return createMachine({
      deskId: plan.deskId,
      child,
      exit,
      stream,
      // The same path the first connection took, deliberately: a reconnect
      // that skipped confirmGuest would adopt the very hollow handshake the
      // boot path learned not to trust.
      reconnect: (abandoned) =>
        connectWithRetry({
          connect,
          now,
          socketPath: plan.vsock.socketPath,
          port: guestAgentPort,
          timeoutMs: reconnectWindowMs,
          retryDelayMs: reconnectRetryDelayMs,
          maxRetryDelayMs: reconnectRetryDelayMs * RECONNECT_BACKOFF_CEILING,
          attemptTimeoutMs: handshakeTimeoutMs,
          exited: exit,
          exitedMessage: `the VMM for desk ${plan.deskId} exited.`,
          abandoned,
        }),
      reconnectWindowMs,
      now,
      idFactory,
      requestTimeoutMs,
      killGraceMs,
      apiSocketPath: plan.api.socketPath,
      vmmApi,
    })
  }

  return { boot }
}

/**
 * Cloud Hypervisor's control plane: HTTP/1.1 over the `--api-socket` Unix
 * socket. The plan has always created that socket; until now nothing spoke to
 * it, because stopping a VM needed nothing more than killing the process.
 *
 * Pausing and snapshotting do need it, and `ch-remote` — the tool that usually
 * does this — is not in the runner image. Writing the two requests by hand is a
 * smaller change than adding a binary to the image, and keeps the whole
 * lifecycle inside one process that already owns the socket path.
 */
export type VmmApiCall = (
  socketPath: string,
  path: string,
  body?: Record<string, unknown>,
  method?: 'PUT' | 'GET',
) => Promise<void>

const vmmApi: VmmApiCall = async (socketPath, path, body, method = 'PUT') => {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(
      {
        socketPath,
        path,
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        },
      },
      (response) => {
        // CH answers 204 with no body on success. Drain regardless: an unread
        // response keeps the socket open and the next call queues behind it.
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const status = response.statusCode ?? 0
          if (status >= 200 && status < 300) {
            resolve()
            return
          }
          const said = Buffer.concat(chunks).toString('utf8').trim().slice(0, 400)
          reject(new DeskError(`${path} returned ${status}${said === '' ? '' : `: ${said}`}`))
        })
      },
    )
    request.on('error', (error) => reject(new DeskError(`${path} failed: ${errorMessage(error)}`)))
    if (payload) request.write(payload)
    request.end()
  })
}

/**
 * Wait until the VMM answers its control socket.
 *
 * On a restore this is also the only honest signal that the snapshot was read
 * back: Cloud Hypervisor creates the API socket early but does not serve
 * `vm.info` until it holds a VM, so a successful call means the restore
 * completed rather than merely that the process started. A VMM that exits
 * instead — a corrupt snapshot, a config the host can no longer satisfy — stops
 * the wait immediately rather than burning the whole timeout.
 */
async function waitForVmm(
  call: VmmApiCall,
  socketPath: string,
  options: { now: () => number; exited: ExitWatcher; timeoutMs: number; retryDelayMs?: number },
): Promise<void> {
  const deadline = options.now() + options.timeoutMs
  const retryDelayMs = options.retryDelayMs ?? 50
  let lastFailure = 'it never answered'
  for (;;) {
    if (options.exited.done) throw new DeskError(`the VMM exited before it served its control socket`)
    try {
      await call(socketPath, '/api/v1/vm.info', undefined, 'GET')
      return
    } catch (error) {
      lastFailure = errorMessage(error)
    }
    if (options.now() >= deadline) {
      throw new DeskError(`the VMM did not answer ${socketPath} in ${options.timeoutMs}ms: ${lastFailure}`)
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  }
}

/** The default backend: real Cloud Hypervisor over a real vsock socket. */
export const cloudHypervisorBackend: DeskBackend = createCloudHypervisorBackend()

/**
 * The machine, and the small state machine that keeps it connected.
 *
 * A vsock channel is not a fact the host learns once at boot — the transport
 * can lie about being connected, and it can go away mid-lease for reasons that
 * have nothing to do with the desk being unusable: the guest agent restarts,
 * the socat bridge drops, a transient vsock error, the guest wedges for a
 * moment. Treating any of those as terminal stranded the desk for the rest of
 * its lease with a perfectly healthy guest behind it, answering every call
 * with "no longer connected". So a live connection is something this machine
 * RE-ESTABLISHES:
 *
 *   live ──unexpected drop──▶ reconnecting ──confirmed guest──▶ live
 *     │                            │
 *     │                            └──window exhausted / VMM exited──▶ closed
 *     └──shutdown(), VMM already exited, protocol violation───────────▶ closed
 *
 * `closed` is terminal. Nothing reconnects out of it, which is what makes
 * `shutdown()` and a dead VMM final rather than the start of a retry loop.
 */
function createMachine(options: {
  deskId: string
  child: ChildProcess
  exit: ExitWatcher
  stream: Duplex
  /** Re-establishes the channel; resolves only once a guest has answered. */
  reconnect: (abandoned: () => boolean) => Promise<Duplex>
  reconnectWindowMs: number
  now: () => number
  idFactory: () => string
  requestTimeoutMs: number
  killGraceMs: number
  /** Cloud Hypervisor's control socket, for pause and snapshot. */
  apiSocketPath: string
  vmmApi: VmmApiCall
}): DeskMachine {
  const { deskId, child, exit, now, idFactory, requestTimeoutMs, killGraceMs, reconnectWindowMs } =
    options
  const pending = new Map<
    string,
    { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()
  // Listeners live on the machine rather than on the socket, so a reconnect
  // re-points the data path at the new stream and every subscriber keeps
  // working without re-registering.
  const listeners = new Set<(event: GuestEventMessage) => void>()
  const watchers = new Set<(change: DeskConnectionChange) => void>()
  let stream = options.stream
  let state: 'live' | 'reconnecting' | 'closed' = 'live'
  let reconnects = 0
  let reconnecting: Promise<void> | null = null

  function failAll(error: Error): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function announce(change: DeskConnectionChange): void {
    for (const watcher of [...watchers]) watcher(change)
  }

  function close(error: DeskError, intentional: boolean): void {
    if (state === 'closed') return
    state = 'closed'
    failAll(error)
    stream.destroy()
    // A desk the consumer asked to stop is not news; one that stopped on its
    // own is the thing an operator needs to be told about.
    if (!intentional) announce({ state: 'lost', deskId, reason: error.message })
  }

  function attach(next: Duplex): void {
    stream = next
    // Each connection decodes with its OWN decoder: a frame the drop cut in
    // half must never be completed by the first bytes of its replacement.
    const decoder = new FrameDecoder()
    const current = () => stream === next && state !== 'closed'
    const onData = (chunk: Buffer): void => {
      if (!current()) return
      let values: unknown[]
      try {
        values = decoder.push(chunk)
      } catch (error) {
        close(
          new DeskError(`Guest agent protocol violation on desk ${deskId}: ${errorMessage(error)}`),
          false,
        )
        return
      }
      for (const value of values) {
        let message: HostBoundMessage
        try {
          message = parseHostBoundMessage(value)
        } catch (error) {
          close(
            new DeskError(`Guest agent sent a malformed message on desk ${deskId}: ${errorMessage(error)}`),
            false,
          )
          return
        }
        if ('id' in message) {
          const entry = pending.get(message.id)
          if (!entry) continue
          pending.delete(message.id)
          clearTimeout(entry.timer)
          if (message.ok) entry.resolve(message.result)
          else entry.reject(new DeskError(`Guest agent error on desk ${deskId}: ${message.error}`))
        } else {
          for (const listener of [...listeners]) listener(message)
        }
      }
    }
    next.on('data', onData)
    next.once('close', () => {
      drop(next, `the guest agent connection closed on desk ${deskId}`)
    })
    next.once('error', (error: Error) => {
      drop(next, `the guest agent connection failed on desk ${deskId}: ${error.message}`)
    })
  }

  function drop(from: Duplex, reason: string): void {
    if (state !== 'live' || from !== stream) return
    from.destroy()
    if (exit.done) {
      // A dead VMM is not a connection problem. There is no guest to get back
      // to, and retrying against it forever only delays the fresh boot the
      // desk actually needs.
      close(new DeskError(`Desk ${deskId} is no longer connected: the VMM exited (${reason}).`), false)
      return
    }
    state = 'reconnecting'
    const lostAt = now()
    // In-flight requests CANNOT be silently retried. Each of their frames
    // already reached the guest, and whether the guest ran it before the
    // channel went away is not knowable from here: an `exec` may have sent
    // mail, a `click` may have landed. Replaying a side-effecting operation to
    // paper over a blip is the wrong kind of resilience, so every one of them
    // is told its fate is unknown and the caller decides.
    failAll(
      new DeskRequestFateUnknownError(
        `Desk ${deskId} lost its guest agent connection while this request was in flight `
          + `(${reason}); the guest may or may not have run it.`,
      ),
    )
    reconnecting = restore(reason, lostAt)
  }

  /** Always resolves: callers await it to learn the outcome, not to be thrown at. */
  async function restore(reason: string, lostAt: number): Promise<void> {
    let next: Duplex
    try {
      next = await options.reconnect(() => state !== 'reconnecting')
    } catch (error) {
      close(
        new DeskError(
          `Desk ${deskId} lost its guest agent connection and could not get it back: ${errorMessage(error)}`,
        ),
        false,
      )
      return
    }
    if (state !== 'reconnecting') {
      // shutdown() won the race while the replacement socket was coming up.
      next.destroy()
      return
    }
    attach(next)
    state = 'live'
    reconnects += 1
    announce({ state: 'reconnected', deskId, reason, downtimeMs: now() - lostAt, reconnects })
  }

  attach(options.stream)

  return {
    deskId,
    async request(command, requestOptions = {}) {
      // A call that lands mid-reconnect waits for it rather than failing on
      // the spot: the guest is usually back within seconds, and telling a
      // caller a desk is gone when it is about to be fine is the bug this
      // machine exists to end. The wait is bounded by the same window the
      // reconnect itself is.
      const waitUntil = now() + reconnectWindowMs
      while (state === 'reconnecting') {
        const attempt = reconnecting
        if (!attempt || now() >= waitUntil) break
        await attempt
      }
      if (state !== 'live') {
        // This one never left the host, so — unlike a request that was in
        // flight when the channel dropped — repeating it is safe.
        throw new DeskError(`Desk ${deskId} is no longer connected.`)
      }
      const id = idFactory()
      const timeoutMs = requestOptions.timeoutMs ?? requestTimeoutMs
      const target = stream
      return await new Promise<unknown>((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          rejectPromise(new DeskError(`Guest request ${command.op} timed out on desk ${deskId}.`))
        }, timeoutMs)
        timer.unref()
        pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
        target.write(encodeFrame({ ...command, id }))
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onConnectionChange(listener) {
      watchers.add(listener)
      return () => {
        watchers.delete(listener)
      }
    },
    async shutdown() {
      // Terminal by construction: `closed` is the state the reconnect loop
      // checks, so an explicit shutdown can never be followed by a reconnect.
      close(new DeskError(`Desk ${deskId} is shutting down.`), true)
      await terminate(child, exit, killGraceMs)
    },
    async park(snapshotDir: string) {
      // Close the guest channel FIRST. Pausing a VM strands whatever was in
      // flight on the vsock, and a reconnect attempt against a paused guest
      // would burn the whole reconnect window before giving up — so the channel
      // is made terminal before the VM stops answering, exactly as shutdown
      // does it.
      close(new DeskError(`Desk ${deskId} is being parked.`), true)
      try {
        await options.vmmApi(options.apiSocketPath, '/api/v1/vm.pause')
        await options.vmmApi(options.apiSocketPath, '/api/v1/vm.snapshot', {
          // Three slashes: `file://` plus an absolute path. CH rejects a
          // destination_url it cannot parse, and the directory must already
          // exist — it writes the config and memory files into it.
          destination_url: `file://${snapshotDir}`,
        })
      } catch (error) {
        // The VM is paused and there is no usable snapshot, which is the one
        // state nothing downstream can interpret. Stop the VMM so the desk is
        // plainly off, and say why — the caller falls back to a cold boot, and
        // the disk is still consistent because the guest was synced before this.
        await terminate(child, exit, killGraceMs)
        throw error instanceof DeskError
          ? new DeskError(`Desk ${deskId} could not be parked with its memory: ${error.message}`)
          : new DeskError(`Desk ${deskId} could not be parked with its memory: ${errorMessage(error)}`)
      }
      await terminate(child, exit, killGraceMs)
    },
  }
}

interface ExitWatcher {
  done: boolean
  promise: Promise<void>
}

/**
 * Read the VMM's stdout and stderr, and keep only the last few kilobytes.
 *
 * This is not for logging — it is load-bearing. The child is spawned with
 * both streams as PIPES, and a pipe nobody reads fills after about 64KB, at
 * which point the VMM BLOCKS on its next write. Cloud Hypervisor logs while
 * it runs, so an unread pipe freezes the guest partway through boot: the
 * process is alive, the disk is untouched, and the guest agent never reaches
 * vsock. Every symptom points at the image and none of them are its fault.
 *
 * Draining costs nothing and buys the tail of what the VMM said, which is the
 * difference between "the VMM exited" and knowing why.
 */
function drainOutput(child: ChildProcess, limit = 8 * 1024): { tail: () => string } {
  let buffered = ''
  const absorb = (chunk: unknown) => {
    buffered += String(chunk)
    if (buffered.length > limit) buffered = buffered.slice(buffered.length - limit)
  }
  child.stdout?.on('data', absorb)
  child.stderr?.on('data', absorb)
  // A pipe that errors must not take the process down with it.
  child.stdout?.on('error', () => undefined)
  child.stderr?.on('error', () => undefined)
  return { tail: () => buffered.trim() }
}

function watchExit(child: ChildProcess): ExitWatcher {
  const watcher: ExitWatcher = { done: false, promise: Promise.resolve() }
  watcher.promise = new Promise<void>((resolvePromise) => {
    const settle = () => {
      watcher.done = true
      resolvePromise()
    }
    child.once('exit', settle)
    child.once('error', settle)
  })
  return watcher
}

async function terminate(child: ChildProcess, exit: ExitWatcher, killGraceMs: number): Promise<void> {
  if (exit.done) return
  child.kill('SIGTERM')
  const forceKill = setTimeout(() => {
    if (!exit.done) child.kill('SIGKILL')
  }, killGraceMs)
  forceKill.unref()
  await exit.promise
  clearTimeout(forceKill)
}

function runToCompletion(child: ChildProcess, label: string): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', (error) => {
      rejectPromise(new DeskError(`${label} failed to start: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const detail = stderr.trim()
      rejectPromise(
        new DeskError(
          `${label} exited with code ${code ?? 'unknown'}`
            + `${signal ? ` (${signal})` : ''}${detail ? `: ${detail}` : '.'}`,
        ),
      )
    })
  })
}

/**
 * Cloud Hypervisor exposes guest vsock ports through a host Unix socket with
 * a line-oriented preamble: the client writes `CONNECT <port>\n` and the VMM
 * answers `OK <assigned>\n` before the byte stream becomes the guest
 * connection. The VMM creates the socket during boot, so connection attempts
 * retry until the deadline.
 *
 * The same loop serves the first connection and every later reconnect, so a
 * reconnect gets `confirmGuest` too — a mid-lease reconnect that trusted the
 * banner would re-adopt exactly the hollow stream the boot path learned not to.
 */
async function connectWithRetry(options: {
  connect: (socketPath: string) => Duplex
  now: () => number
  socketPath: string
  port: number
  timeoutMs: number
  retryDelayMs: number
  /** Ceiling the delay doubles toward; omitted keeps the delay constant. */
  maxRetryDelayMs?: number
  attemptTimeoutMs: number
  exited: ExitWatcher
  /** A dead VMM means something different at boot than it does mid-lease. */
  exitedMessage?: string
  /** Stops the loop early when the caller no longer wants the connection. */
  abandoned?: () => boolean
}): Promise<Duplex> {
  const deadline = options.now() + options.timeoutMs
  let lastFailure = 'the guest agent never answered'
  let retryDelayMs = options.retryDelayMs
  while (options.now() <= deadline) {
    if (options.exited.done) {
      throw new DeskError(options.exitedMessage ?? 'The VMM exited before the guest agent came up.')
    }
    if (options.abandoned?.() === true) {
      throw new DeskError('the connection attempt was abandoned.')
    }
    try {
      const stream = await attemptHandshake(
        options.connect,
        options.socketPath,
        options.port,
        options.attemptTimeoutMs,
      )
      try {
        await confirmGuest(stream, options.attemptTimeoutMs)
      } catch (error) {
        stream.destroy()
        throw error
      }
      return stream
    } catch (error) {
      lastFailure = errorMessage(error)
    }
    await delay(retryDelayMs)
    if (options.maxRetryDelayMs !== undefined) {
      retryDelayMs = Math.min(retryDelayMs * 2, options.maxRetryDelayMs)
    }
  }
  throw new DeskError(
    `Timed out connecting to the guest agent at ${options.socketPath}: ${lastFailure}`,
  )
}

/**
 * One handshake attempt, which MUST settle.
 *
 * Cloud Hypervisor accepts a connection on the vsock socket whether or not
 * anything in the guest is listening on the port, and when nothing is it may
 * answer nothing at all: no reply, no error, no close. Without a deadline of
 * its own this promise then never settles — and because the caller awaits it
 * inside the retry loop, the loop stops iterating, the overall deadline is
 * never re-checked, and the boot hangs forever rather than failing. That is
 * indistinguishable from a wedged host and it is why every attempt is bounded
 * here as well as in aggregate.
 */
/**
 * Prove a guest is behind the handshake by asking it something.
 *
 * Cloud Hypervisor answers `CONNECT <port>` with `OK` whether or not anything
 * in the guest is listening on that port, and only closes the socket a moment
 * later when it finds nobody there. A caller that trusts the banner therefore
 * "connects" to a guest that is still booting, gets a closed stream seconds
 * later, and — because a closed machine is not retried — leaves the desk dead
 * for as long as it is leased, with a healthy guest sitting behind it. So the
 * handshake is not the test; a reply is.
 */
async function confirmGuest(stream: Duplex, timeoutMs: number): Promise<void> {
  const decoder = new FrameDecoder()
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stream.off('data', onData)
      stream.off('close', onClose)
      stream.off('error', finish)
      if (error) rejectPromise(error)
      else resolvePromise()
    }
    const timer = setTimeout(
      () => finish(new DeskError('the guest agent did not answer the first request.')),
      timeoutMs,
    )
    timer.unref?.()
    const onClose = () =>
      finish(new DeskError('the connection closed before the guest agent answered.'))
    const onData = (chunk: Buffer) => {
      let values: unknown[]
      try {
        values = decoder.push(chunk)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
        return
      }
      for (const value of values) {
        // Anything at all proves a guest is there; the reply is parsed for
        // real by the machine once it owns the stream.
        if (value && typeof value === 'object') {
          finish()
          return
        }
      }
    }
    stream.on('data', onData)
    stream.once('close', onClose)
    stream.once('error', finish)
    stream.write(encodeFrame({ id: 'hello', op: 'ping' }))
  })
}

function attemptHandshake(
  connect: (socketPath: string) => Duplex,
  socketPath: string,
  port: number,
  attemptTimeoutMs: number,
): Promise<Duplex> {
  return new Promise<Duplex>((resolvePromise, rejectPromise) => {
    let stream: Duplex
    try {
      stream = connect(socketPath)
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
      return
    }
    let banner = ''
    let settled = false
    const timer = setTimeout(() => {
      fail(new DeskError('vsock handshake went unanswered.'))
    }, attemptTimeoutMs)
    // An unref'd timer must not hold the process open on its own.
    timer.unref?.()
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stream.destroy()
      rejectPromise(error)
    }
    const onData = (chunk: Buffer) => {
      banner += chunk.toString('latin1')
      const newline = banner.indexOf('\n')
      if (newline === -1) {
        if (banner.length > HANDSHAKE_LINE_LIMIT) {
          fail(new DeskError('vsock handshake reply exceeded the line limit.'))
        }
        return
      }
      const line = banner.slice(0, newline)
      const rest = banner.slice(newline + 1)
      stream.off('data', onData)
      stream.off('error', fail)
      if (!line.startsWith('OK ')) {
        fail(new DeskError(`vsock handshake was refused: ${line}`))
        return
      }
      settled = true
      clearTimeout(timer)
      if (rest.length > 0) stream.unshift(Buffer.from(rest, 'latin1'))
      resolvePromise(stream)
    }
    stream.on('data', onData)
    stream.once('error', fail)
    // A close before the banner is a refusal, not a hang.
    stream.once('close', () => fail(new DeskError('vsock handshake closed before a reply.')))
    stream.write(`CONNECT ${port}\n`)
  })
}

function defaultLauncher(
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity },
): ChildProcess {
  return spawn(command, [...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    uid: options.identity?.uid,
    gid: options.identity?.gid,
  })
}

function defaultConnect(socketPath: string): Duplex {
  return createConnection(socketPath)
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    timer.unref()
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
