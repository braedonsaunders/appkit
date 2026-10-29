import { randomUUID } from 'node:crypto'
import { assertPrivateMemoryMapping } from './template-mapping'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { GUEST_AGENT_VSOCK_PORT } from './protocol'
import {
  DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_RETRY_DELAY_MS,
  DEFAULT_HANDSHAKE_TIMEOUT_MS, DEFAULT_RECONNECT_WINDOW_MS, DEFAULT_RECONNECT_RETRY_DELAY_MS,
  DEFAULT_KILL_GRACE_MS, RECONNECT_BACKOFF_CEILING, connectWithRetry, createGuestMachine, attemptHandshake,
  defaultLauncher, defaultConnect, drainOutput, watchExit, terminate, runToCompletion, errorMessage,
  assertShareManifest, writeShareManifest, type ExitWatcher,
} from './machine'
/**
 * The backend port.
 *
 * `DeskBackend` is the seam that keeps the package testable without a
 * hypervisor: the host asks a backend to boot a `DeskLaunchPlan` and gets a
 * `DeskMachine` — a request/response channel to the in-guest agent plus an
 * event subscription. CI and non-KVM developer machines inject an in-memory
 * fake; production uses `cloudHypervisorBackend` on Linux or
 * `createVirtualizationBackend` on an Apple silicon Mac, whose process glue is
 * deliberately thin because everything that can be pure lives in the plan
 * builder, the protocol module, and the shared guest channel.
 */
import type { ChildProcess } from 'node:child_process'
import type { Duplex } from 'node:stream'
import {
  DeskError, type CloudHypervisorLaunchPlan, type DeskHypervisor, type DeskLaunchPlan, type DeskLauncherIdentity,
} from './plan'
import type { GuestCommand, GuestEventMessage } from './protocol'

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
  supportsPausedParkHook?: true
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
  /**
   * Open a TCP stream from the host to `port` on the guest.
   *
   * Optional: a backend whose guest has a routable address (Cloud Hypervisor's
   * TAP) leaves this out and the host dials the guest address directly. A
   * backend whose guest sits behind a userspace NAT (Virtualization.framework)
   * provides it, because there is no address on the Mac to dial. Rejects with
   * `DeskError` when the guest refuses or does not answer.
   */
  connect?(port: number): Promise<Duplex>
  /** Optional resident pause and resume. Callers must serialize these with lifecycle operations. */
  pause?(): Promise<void>
  resume?(): Promise<void>
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
  park?(snapshotDir: string, hooks?: DeskParkHooks): Promise<void>
}

export interface DeskParkHooks {
  /** Called while the VM is paused, before its memory snapshot is written. */
  onPaused?: () => Promise<void>
  /** Reports a sidecar failure; ordinary memory parking continues. */
  onPausedError?: (error: unknown) => void
}

export interface DeskBootHooks {
  /**
   * Called on a restore, after the snapshot has been read back and before the
   * guest is allowed to run.
   *
   * The snapshot must no longer be available for replay by this point. A memory image
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
  /**
   * Which hypervisor this backend boots, and so which plan the host builds
   * for it. Absent means Cloud Hypervisor.
   */
  readonly hypervisor?: DeskHypervisor
  /**
   * The binary the backend launches — the VMM or the helper — for readiness
   * reporting. Optional; `verifyDeskHost` falls back to its own option.
   */
  readonly vmmPath?: string
  boot(plan: DeskLaunchPlan, hooks?: DeskBootHooks): Promise<DeskMachine>
}

export type DeskProcessLauncher = (
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity; inheritedFds?: readonly number[] },
) => ChildProcess

export interface CloudHypervisorBackendOptions {
  /** VMM API transport, injectable for tests. */
  vmmApi?: VmmApiCall
  /** Descriptors retained by the VMM and share daemons, mapped consecutively from fd 3. */
  inheritedFds?: readonly number[]
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
  /** Use guest-provided vsock service bridges for DeskHandle.connect. Opt in only when the image provides them. */
  serviceVsock?: boolean
  /** Whether a share daemon's socket exists yet; injectable for tests. */
  pathExists?: (path: string) => boolean
  /** Removes a stale share socket before its daemon starts; injectable for tests. */
  removeFile?: (path: string) => Promise<void>
}

export function createCloudHypervisorBackend(
  options: CloudHypervisorBackendOptions = {},
): DeskBackend {
  const api = options.vmmApi ?? vmmApi
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
  const pathExists = options.pathExists ?? existsSync
  const removeFile = options.removeFile ?? ((path: string) => rm(path, { force: true }))

  /**
   * Start one `virtiofsd` per share and wait until every socket exists.
   *
   * The VMM connects to these at boot and at restore alike, so they come up
   * first. A stale socket is removed beforehand, or its presence would read as
   * a daemon that is listening. Existence is the readiness signal rather than
   * a probe connection, because `virtiofsd` serves exactly one connection and
   * exits when it closes; the moment between bind and listen is covered by
   * Cloud Hypervisor retrying a refused vhost-user connect.
   */
  async function startShareDaemons(plan: CloudHypervisorLaunchPlan): Promise<ShareDaemons> {
    const daemons: { tag: string; child: ChildProcess; exit: ExitWatcher; log: { tail: () => string } }[] = []
    const stop = async () => {
      await Promise.all(daemons.map((daemon) => terminate(daemon.child, daemon.exit, killGraceMs)))
    }
    try {
      for (const share of plan.shares) {
        await removeFile(share.socketPath)
        const child = launcher(share.daemon.command, share.daemon.args, { identity: plan.launcherIdentity, inheritedFds: options.inheritedFds })
        daemons.push({ tag: share.tag, child, exit: watchExit(child), log: drainOutput(child) })
      }
      const deadline = now() + connectTimeoutMs
      for (;;) {
        const exited = daemons.find((daemon) => daemon.exit.done)
        if (exited) {
          const said = exited.log.tail()
          throw new DeskError(`virtiofsd for share ${exited.tag} exited before it listened${said === '' ? '.' : `: ${said}`}`)
        }
        const waiting = plan.shares.filter((share) => !pathExists(share.socketPath))
        if (waiting.length === 0) break
        if (now() >= deadline) {
          throw new DeskError(
            `virtiofsd did not create ${waiting.map((share) => share.socketPath).join(', ')} in ${connectTimeoutMs}ms.`,
          )
        }
        // A held timer: the wait is bounded by the deadline, and nothing else may be keeping
        // the process alive while a daemon starts.
        await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, connectRetryDelayMs))
      }
    } catch (error) {
      await stop()
      throw error
    }
    return {
      stop,
      // The VMM cannot serve a share whose daemon is gone; neither can it be
      // handed a new one mid-run. So a daemon that dies stops the VMM, and the
      // desk is lost loudly instead of hanging every guest access to the share.
      supervise: (vmm, vmmExit) => {
        for (const daemon of daemons) {
          void daemon.exit.promise.then(() => terminate(vmm, vmmExit, killGraceMs))
        }
      },
    }
  }

  async function boot(plan: DeskLaunchPlan, hooks?: DeskBootHooks): Promise<DeskMachine> {
    if (plan.hypervisor !== 'cloud-hypervisor') throw new DeskError('Cloud Hypervisor requires a cloud-hypervisor plan.')
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
    if (plan.snapshot.restoring) {
      try {
        await assertShareManifest(plan.snapshot.dir, plan.shares)
      } catch (error) {
        throw new DeskError(`Desk ${plan.deskId} could not be restored from ${plan.snapshot.dir}: ${errorMessage(error)}`)
      }
    }

    let shares: ShareDaemons
    try {
      shares = await startShareDaemons(plan)
    } catch (error) {
      throw new DeskError(`Desk ${plan.deskId} could not start its shares: ${errorMessage(error)}`)
    }
    const child = launcher(plan.vmm.command, plan.vmm.args, { identity: plan.launcherIdentity, inheritedFds: options.inheritedFds })
    const log = drainOutput(child)
    const exit = watchExit(child)
    shares.supervise(child, exit)
    // The VMM first: a daemon outliving it is harmless, while a daemon stopped
    // under a running VMM is a share failing in the guest.
    const stop = async () => {
      try {
        await terminate(child, exit, killGraceMs)
      } finally {
        await shares.stop()
      }
    }

    // A restored guest comes back PAUSED (see the `resume=false` reasoning in
    // the plan). Three things have to happen in this order and nowhere else:
    // prove the restore finished, let the caller invalidate replay while the
    // guest still cannot write, then start it.
    if (plan.snapshot.restoring) {
      try {
        await waitForVmm(api, plan.api.socketPath, { now, exited: exit, timeoutMs: connectTimeoutMs })
        if (plan.snapshot.requirePrivateMemoryMapping) await assertPrivateMemoryMapping(child.pid, plan.snapshot.dir)
        await hooks?.onRestored?.()
        await api(plan.api.socketPath, '/api/v1/vm.resume')
      } catch (error) {
        await stop()
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
      await stop()
      const said = log.tail()
      const detail = said === '' ? '' : ` The VMM said: ${said}`
      throw error instanceof DeskError
        ? new DeskError(`${error.message}${detail}`)
        : new DeskError(
            `Could not reach the guest agent for desk ${plan.deskId}: ${errorMessage(error)}${detail}`,
          )
    }
    return createGuestMachine({
      deskId: plan.deskId,
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
      ...(options.serviceVsock ? { connect: (port: number) => {
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DeskError('Guest port must be between 1 and 65535.')
        return attemptHandshake(connect, plan.vsock.socketPath, port, handshakeTimeoutMs)
      } } : {}),
      stop,
      pause: () => setVmmState(api, plan.api.socketPath, 'Paused'),
      resume: () => setVmmState(api, plan.api.socketPath, 'Running'),
      supportsPausedParkHook: true,
      park: async (snapshotDir, hooks) => {
        try {
          await api(plan.api.socketPath, '/api/v1/vm.pause')
          try { await hooks?.onPaused?.() }
          catch (error) { try { hooks?.onPausedError?.(error) } catch { /* preserve memory */ } }
          await api(plan.api.socketPath, '/api/v1/vm.snapshot', { destination_url: `file://${snapshotDir}` })
          await writeShareManifest(snapshotDir, plan.shares)
        } finally {
          await stop()
        }
      },
    })
  }

  return { boot }
}

interface ShareDaemons {
  /** Stop every daemon; resolves once all have exited. */
  stop: () => Promise<void>
  /** Stop the VMM if any daemon exits while it runs. */
  supervise: (vmm: ChildProcess, vmmExit: ExitWatcher) => void
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
) => Promise<void | string>

/** Reconcile an ambiguous command failure against the VMM before releasing the fence. */
export async function setVmmState(call: VmmApiCall, socketPath: string, desired: 'Paused' | 'Running'): Promise<void> {
  try {
    await call(socketPath, desired === 'Paused' ? '/api/v1/vm.pause' : '/api/v1/vm.resume')
  } catch (error) {
    try {
      const response = await call(socketPath, '/api/v1/vm.info', undefined, 'GET')
      const info: unknown = typeof response === 'string' ? JSON.parse(response) : null
      if (info && typeof info === 'object' && 'state' in info && info.state === desired) return
    } catch { /* State is unknown: preserve the original failure and the request fence. */ }
    throw error
  }
}

const vmmApi: VmmApiCall = async (socketPath, path, body, method = 'PUT') => {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
  return await new Promise<string>((resolve, reject) => {
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
            resolve(Buffer.concat(chunks).toString('utf8'))
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
export const cloudHypervisorBackend: DeskBackend = {
  boot: (plan, hooks) => createCloudHypervisorBackend().boot(plan, hooks),
}
