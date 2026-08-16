/**
 * The in-guest agent: PID 1's helper inside the microVM, speaking the framed
 * JSON protocol over a vsock stream. This is the only new attack surface in
 * the desk design, so it is deliberately small: a bounded frame decoder, a
 * strict parser, a closed dispatch switch, and nothing else. Everything that
 * touches the guest OS — spawning processes, driving the compositor, reading
 * the clipboard — is injected as a handler so the message-handling core stays
 * pure and unit-testable on any platform.
 *
 * The module depends only on `node:` built-ins and this package's own
 * protocol module; it ships in the same package and is started by the guest's
 * init.
 */
import { Buffer } from 'node:buffer'
import type { Duplex } from 'node:stream'
import {
  DEFAULT_MAX_FRAME_BYTES,
  DeskProtocolError,
  encodeFrame,
  FrameDecoder,
  parseGuestRequest,
  type GuestEventMessage,
  type GuestExecResult,
  type GuestObservation,
  type GuestInput,
  type GuestRequest,
  type GuestResponse,
} from './protocol'
import type { DeskHandoverScope } from './events'

export interface GuestExecCall {
  command: string
  args: readonly string[]
  cwd: string | null
  env: Readonly<Record<string, string>> | null
  timeoutMs: number | null
}

export interface GuestJobStartCall {
  command: string
  args: readonly string[]
  cwd: string | null
  env: Readonly<Record<string, string>> | null
}

/**
 * The operations the guest environment implements. Handlers own all contact
 * with the OS; the core owns all contact with the wire.
 */
export interface GuestAgentHandlers {
  exec(call: GuestExecCall): Promise<GuestExecResult>
  jobStart(call: GuestJobStartCall): Promise<{ jobId: string }>
  jobSignal(call: { jobId: string; signal: 'SIGTERM' | 'SIGKILL' }): Promise<void>
  screenStart(call: { width: number; height: number }): Promise<void>
  screenStop(): Promise<void>
  observe(): Promise<GuestObservation>
  input(action: GuestInput): Promise<void>
  a11yInvoke(call: { nodeId: string; action: string }): Promise<void>
  launch(call: { appId: string; args: readonly string[] }): Promise<void>
  clipboardRead(): Promise<{ text: string }>
  clipboardWrite(call: { text: string }): Promise<void>
  framesStart(call: { fps: number; width: number; height: number }): Promise<void>
  framesStop(): Promise<void>
  handoverBegin(call: { ttlMs: number; scope: DeskHandoverScope }): Promise<{ url: string }>
  handoverEnd(): Promise<void>
  capabilities(): Promise<{ virtioGpu: boolean }>
}

export interface GuestAgentCore {
  /**
   * Consume one chunk of the byte stream and return the frames to write back,
   * in order. Malformed requests produce error responses; a framing violation
   * (oversized or non-JSON frame) throws, and the caller must drop the
   * connection — a length-prefixed stream cannot be resynchronized once its
   * lengths are untrusted.
   */
  handleChunk(chunk: Buffer): Promise<Buffer[]>
  /** Encode an unsolicited guest-to-host event frame. */
  encodeEvent(event: GuestEventMessage): Buffer
}

export function createGuestAgentCore(
  handlers: GuestAgentHandlers,
  options: { maxFrameBytes?: number } = {},
): GuestAgentCore {
  const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
  const decoder = new FrameDecoder({ maxFrameBytes })

  async function respond(value: unknown): Promise<GuestResponse> {
    let request: GuestRequest
    try {
      request = parseGuestRequest(value)
    } catch (error) {
      // The frame itself was well-formed JSON, so answering is safe; echo the
      // id when one is recoverable so the host can settle its pending call.
      const id = recoverId(value)
      return { id, ok: false, error: errorMessage(error) }
    }
    try {
      return { id: request.id, ok: true, result: await dispatch(request) }
    } catch (error) {
      return { id: request.id, ok: false, error: errorMessage(error) }
    }
  }

  async function dispatch(request: GuestRequest): Promise<unknown> {
    switch (request.op) {
      case 'ping':
        return { pong: true }
      case 'capabilities':
        return handlers.capabilities()
      case 'exec':
        return handlers.exec({
          command: request.command,
          args: request.args ?? [],
          cwd: request.cwd ?? null,
          env: request.env ?? null,
          timeoutMs: request.timeoutMs ?? null,
        })
      case 'job-start':
        return handlers.jobStart({
          command: request.command,
          args: request.args ?? [],
          cwd: request.cwd ?? null,
          env: request.env ?? null,
        })
      case 'job-signal':
        await handlers.jobSignal({ jobId: request.jobId, signal: request.signal })
        return {}
      case 'screen-start':
        await handlers.screenStart({ width: request.width, height: request.height })
        return {}
      case 'screen-stop':
        await handlers.screenStop()
        return {}
      case 'observe':
        return handlers.observe()
      case 'input':
        await handlers.input(request.input)
        return {}
      case 'a11y-invoke':
        await handlers.a11yInvoke({ nodeId: request.nodeId, action: request.action })
        return {}
      case 'launch':
        await handlers.launch({ appId: request.appId, args: request.args ?? [] })
        return {}
      case 'clipboard-read':
        return handlers.clipboardRead()
      case 'clipboard-write':
        await handlers.clipboardWrite({ text: request.text })
        return {}
      case 'frames-start':
        await handlers.framesStart({
          fps: request.fps,
          width: request.width,
          height: request.height,
        })
        return {}
      case 'frames-stop':
        await handlers.framesStop()
        return {}
      case 'handover-begin':
        return handlers.handoverBegin({ ttlMs: request.ttlMs, scope: request.scope })
      case 'handover-end':
        await handlers.handoverEnd()
        return {}
    }
  }

  return {
    async handleChunk(chunk: Buffer): Promise<Buffer[]> {
      const values = decoder.push(chunk)
      const responses: Buffer[] = []
      for (const value of values) {
        responses.push(encodeFrame(await respond(value), maxFrameBytes))
      }
      return responses
    },
    encodeEvent(event: GuestEventMessage): Buffer {
      return encodeFrame(event, maxFrameBytes)
    },
  }
}

export interface RunningGuestAgent {
  /** Push an unsolicited event (job exit, frame, focus change) to the host. */
  sendEvent(event: GuestEventMessage): void
  /** Resolves when the connection has closed. */
  closed: Promise<void>
}

/**
 * Bind the pure core to a real byte stream. This is the entire impure surface
 * of the guest agent: read chunks, write responses, destroy the connection on
 * a framing violation.
 */
export function runGuestAgent(options: {
  stream: Duplex
  handlers: GuestAgentHandlers
  maxFrameBytes?: number
}): RunningGuestAgent {
  const { stream, handlers } = options
  const core = createGuestAgentCore(handlers, { maxFrameBytes: options.maxFrameBytes })
  let queue: Promise<void> = Promise.resolve()

  stream.on('data', (chunk: Buffer) => {
    queue = queue
      .then(async () => {
        for (const frame of await core.handleChunk(chunk)) stream.write(frame)
      })
      .catch((error: unknown) => {
        stream.destroy(
          error instanceof DeskProtocolError ? error : new DeskProtocolError(errorMessage(error)),
        )
      })
  })

  const closed = new Promise<void>((resolvePromise) => {
    stream.once('close', () => resolvePromise())
  })

  return {
    sendEvent(event: GuestEventMessage): void {
      stream.write(core.encodeEvent(event))
    },
    closed,
  }
}

function recoverId(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>).id
    if (typeof id === 'string' && id.length > 0 && id.length <= 128) return id
  }
  return 'unknown'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
