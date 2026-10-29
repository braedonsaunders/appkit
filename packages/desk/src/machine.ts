/**
 * The guest channel every backend shares: the hybrid-vsock handshake, the
 * proof that a guest is really behind it, the reconnecting machine, and the
 * child-process plumbing around a VMM. Cloud Hypervisor and the
 * Virtualization.framework helper both expose the guest agent through a host
 * Unix socket with the same `CONNECT <port>` preamble, so everything from the
 * socket inwards is one implementation. Internal to the package.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'
import type { Duplex } from 'node:stream'
import { DeskRequestFateUnknownError, type DeskConnectionChange, type DeskMachine, type DeskParkHooks } from './backend'
import { DeskError, type DeskLauncherIdentity, type DeskShare } from './plan'
import {
  encodeFrame,
  FrameDecoder,
  parseHostBoundMessage,
  type GuestEventMessage,
  type HostBoundMessage,
} from './protocol'

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_CONNECT_TIMEOUT_MS = 20_000
export const DEFAULT_CONNECT_RETRY_DELAY_MS = 100
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000
export const DEFAULT_RECONNECT_WINDOW_MS = 30_000
export const DEFAULT_RECONNECT_RETRY_DELAY_MS = 250
/**
 * How far the reconnect delay is allowed to double. A guest agent that systemd
 * is restarting is not helped by being hammered four times a second for the
 * whole window, and an unbounded doubling would spend most of the window
 * asleep after two failures.
 */
export const RECONNECT_BACKOFF_CEILING = 8
export const DEFAULT_KILL_GRACE_MS = 2_000
const HANDSHAKE_LINE_LIMIT = 128

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
 *
 * What differs between hypervisors is only how the VM stops, parks, and
 * reaches guest ports, and those arrive as functions.
 */
export function createGuestMachine(options: {
  deskId: string
  exit: ExitWatcher
  stream: Duplex
  /** Re-establishes the channel; resolves only once a guest has answered. */
  reconnect: (abandoned: () => boolean) => Promise<Duplex>
  reconnectWindowMs: number
  now: () => number
  idFactory: () => string
  requestTimeoutMs: number
  /** Stop the VMM; resolves once its process has exited. */
  stop: () => Promise<void>
  /**
   * Pause, snapshot into `snapshotDir`, and stop the VMM. Called after the
   * guest channel has been closed. Must leave the VMM stopped on failure too.
   */
  park?: (snapshotDir: string, hooks?: DeskParkHooks) => Promise<void>
  supportsPausedParkHook?: true
  pause?: () => Promise<void>
  resume?: () => Promise<void>
  /** Open a host-to-guest TCP stream, for backends with no routable guest. */
  connect?: (port: number) => Promise<Duplex>
}): DeskMachine {
  const { deskId, exit, now, idFactory, requestTimeoutMs, reconnectWindowMs } = options
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
  let paused = false
  let deferredDrop: { reason: string; at: number } | null = null

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
    if (paused) deferredDrop = { reason, at: lostAt }
    else reconnecting = restore(reason, lostAt)
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

  const machine: DeskMachine = {
    deskId,
    async request(command, requestOptions = {}) {
      // A call that lands mid-reconnect waits for it rather than failing on
      // the spot: the guest is usually back within seconds, and telling a
      // caller a desk is gone when it is about to be fine is the bug this
      // machine exists to end. The wait is bounded by the same window the
      // reconnect itself is.
      if (paused) throw new DeskError(`Desk ${deskId} is paused; resume it first.`)
      const waitUntil = now() + reconnectWindowMs
      while (state === 'reconnecting') {
        const attempt = reconnecting
        if (!attempt || now() >= waitUntil) break
        await attempt
      }
      if (paused) throw new DeskError(`Desk ${deskId} is paused; resume it first.`)
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
      await options.stop()
    },
  }
  if (options.pause && options.resume) {
    const pause = options.pause
    const resume = options.resume
    machine.pause = async () => {
      if (paused) return
      if (state !== 'live') throw new DeskError(`Desk ${deskId} is not connected.`)
      paused = true
      failAll(new DeskRequestFateUnknownError(`Desk ${deskId} paused with a request in flight; its fate is unknown.`))
      // On failure the VMM state may be unknown; retain the fence until resume succeeds.
      await pause()
    }
    machine.resume = async () => {
      if (!paused) return
      await resume()
      paused = false
      if (deferredDrop && state === 'reconnecting') {
        const drop = deferredDrop
        deferredDrop = null
        reconnecting = restore(drop.reason, drop.at)
      }
    }
  }
  if (options.park) {
    const park = options.park
    if (options.supportsPausedParkHook) machine.supportsPausedParkHook = true
    machine.park = async (snapshotDir: string, hooks?: DeskParkHooks) => {
      // Close the guest channel FIRST. Pausing a VM strands whatever was in
      // flight on the vsock, and a reconnect attempt against a paused guest
      // would burn the whole reconnect window before giving up — so the channel
      // is made terminal before the VM stops answering, exactly as shutdown
      // does it.
      close(new DeskError(`Desk ${deskId} is being parked.`), true)
      await park(snapshotDir, hooks)
    }
  }
  if (options.connect) {
    const connect = options.connect
    machine.connect = async (port: number) => {
      if (paused) throw new DeskError(`Desk ${deskId} is paused; resume it first.`)
      if (state === 'closed') throw new DeskError(`Desk ${deskId} is no longer connected.`)
      const connection = await connect(port)
      if ((state as string) === 'closed') { connection.destroy(); throw new DeskError(`Desk ${deskId} is no longer connected.`) }
      return connection
    }
  }
  return machine
}

export interface ExitWatcher {
  done: boolean
  promise: Promise<void>
}

/**
 * Read a child's output and keep only the last few kilobytes.
 *
 * This is not for logging — it is load-bearing. A child spawned with its
 * streams as PIPES blocks once a pipe nobody reads fills, after about 64KB.
 * Cloud Hypervisor logs while it runs, so an unread pipe freezes the guest
 * partway through boot: the process is alive, the disk is untouched, and the
 * guest agent never reaches vsock. Every symptom points at the image and none
 * of them are its fault.
 *
 * Draining costs nothing and buys the tail of what the process said, which is
 * the difference between "the VMM exited" and knowing why. `streams` names the
 * pipes to drain: a helper that speaks a protocol on stdout drains only stderr.
 */
export function drainOutput(
  child: ChildProcess,
  limit = 8 * 1024,
  streams: readonly ('stdout' | 'stderr')[] = ['stdout', 'stderr'],
): { tail: () => string } {
  let buffered = ''
  const absorb = (chunk: unknown) => {
    buffered += String(chunk)
    if (buffered.length > limit) buffered = buffered.slice(buffered.length - limit)
  }
  for (const name of streams) {
    const pipe = child[name]
    pipe?.on('data', absorb)
    // A pipe that errors must not take the process down with it.
    pipe?.on('error', () => undefined)
  }
  return { tail: () => buffered.trim() }
}

export function watchExit(child: ChildProcess): ExitWatcher {
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

export async function terminate(child: ChildProcess, exit: ExitWatcher, killGraceMs: number): Promise<void> {
  if (exit.done) return
  child.kill('SIGTERM')
  const forceKill = setTimeout(() => {
    if (!exit.done) child.kill('SIGKILL')
  }, killGraceMs)
  forceKill.unref()
  await exit.promise
  clearTimeout(forceKill)
}

export function runToCompletion(child: ChildProcess, label: string): Promise<void> {
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
 * retry until the deadline. The Virtualization.framework helper speaks the
 * same preamble on its own socket.
 *
 * The same loop serves the first connection and every later reconnect, so a
 * reconnect gets `confirmGuest` too — a mid-lease reconnect that trusted the
 * banner would re-adopt exactly the hollow stream the boot path learned not to.
 */
export async function connectWithRetry(options: {
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
 *
 * A close before the reply line is a refusal: that is how a port with nothing
 * listening presents through Cloud Hypervisor, and the Virtualization.framework
 * helper presents a refused vsock or TCP port the same way.
 */
export function attemptHandshake(
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

/**
 * The shares a snapshot was taken with, kept beside it.
 *
 * A snapshot holds the machine's devices, shares among them, so it can only
 * come back with the shares it was parked with: Cloud Hypervisor would resume
 * without a share that was added since, and Virtualization.framework refuses a
 * changed device list. The host restores with this list rather than the one it
 * was given, and a backend refuses a plan that disagrees with it.
 */
const SHARE_MANIFEST = 'shares.json'

export async function writeShareManifest(snapshotDir: string, shares: readonly DeskShare[]): Promise<void> {
  await writeFile(join(snapshotDir, SHARE_MANIFEST), `${shareManifest(shares)}\n`, { mode: 0o600 })
}

/**
 * The shares recorded beside a snapshot. A snapshot with no record predates
 * shares, so it was taken with none. Paths are returned as recorded; whether
 * they still exist is the launch plan's to check.
 */
export async function readShareManifest(snapshotDir: string): Promise<DeskShare[]> {
  let text: string
  try {
    text = await readFile(join(snapshotDir, SHARE_MANIFEST), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new DeskError(`${join(snapshotDir, SHARE_MANIFEST)} is not valid JSON.`)
  }
  const valid = Array.isArray(value) && value.every((entry: unknown) =>
    typeof entry === 'object' && entry !== null
    && typeof (entry as DeskShare).tag === 'string'
    && typeof (entry as DeskShare).path === 'string'
    && typeof (entry as DeskShare).readOnly === 'boolean')
  if (!valid) throw new DeskError(`${join(snapshotDir, SHARE_MANIFEST)} is not a list of shares.`)
  return (value as DeskShare[]).map(({ tag, path, readOnly }) => ({ tag, path, readOnly }))
}

/** Throws unless the snapshot was parked with exactly `shares`, in order. */
export async function assertShareManifest(snapshotDir: string, shares: readonly DeskShare[]): Promise<void> {
  const saved = shareManifest(await readShareManifest(snapshotDir))
  const wanted = shareManifest(shares)
  if (saved !== wanted) throw new DeskError(`the snapshot was taken with shares ${saved}, not ${wanted}`)
}

function shareManifest(shares: readonly DeskShare[]): string {
  return JSON.stringify(shares.map(({ tag, path, readOnly }) => ({ tag, path, readOnly })))
}

export function defaultLauncher(
  command: string,
  args: readonly string[],
  options: { identity?: DeskLauncherIdentity; inheritedFds?: readonly number[] },
): ChildProcess {
  return spawn(command, [...args], {
    stdio: ['ignore', 'pipe', 'pipe', ...(options.inheritedFds ?? [])],
    uid: options.identity?.uid,
    gid: options.identity?.gid,
  })
}

export function defaultConnect(socketPath: string): Duplex {
  return createConnection(socketPath)
}

export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    timer.unref()
  })
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
