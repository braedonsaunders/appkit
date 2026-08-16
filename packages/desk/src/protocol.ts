/**
 * The framed JSON protocol spoken between the host and the in-guest agent
 * over vsock. Everything here is pure encode/decode/validate — no sockets, no
 * processes — so the security-critical parsing is unit-testable on any
 * platform, and both the host backend and the guest agent share one message
 * vocabulary.
 *
 * Wire format: a 4-byte big-endian length prefix followed by that many bytes
 * of UTF-8 JSON. Frame sizes are bounded; a peer declaring an oversized frame
 * is a protocol violation and the connection must be dropped, not resynced.
 */
import { Buffer } from 'node:buffer'
import type {
  A11yNode,
  DeskHandoverScope,
  DeskPoint,
  DeskPointerButton,
  WindowInfo,
} from './events'

export const FRAME_HEADER_BYTES = 4
export const DEFAULT_MAX_FRAME_BYTES = 8 * 1024 * 1024
/** The vsock port the in-guest agent listens on. */
export const GUEST_AGENT_VSOCK_PORT = 5252

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_STRING_LENGTH = 65_536
const MAX_ARGUMENTS = 256
const MAX_ENVIRONMENT_ENTRIES = 128
const MAX_WINDOWS = 256
const MAX_A11Y_NODES = 10_000
const MAX_A11Y_DEPTH = 32

export class DeskProtocolError extends Error {
  override readonly name = 'DeskProtocolError'
}

export type GuestInput =
  | { type: 'move'; x: number; y: number }
  | { type: 'click'; x: number; y: number; button: DeskPointerButton }
  | { type: 'type'; text: string }
  | { type: 'key'; combo: string }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { type: 'drag'; from: DeskPoint; to: DeskPoint }

/** A request body, before the transport assigns its correlation id. */
export type GuestCommand =
  | { op: 'ping' }
  | { op: 'capabilities' }
  | {
      op: 'exec'
      command: string
      args?: readonly string[]
      cwd?: string
      env?: Readonly<Record<string, string>>
      timeoutMs?: number
    }
  | {
      op: 'job-start'
      command: string
      args?: readonly string[]
      cwd?: string
      env?: Readonly<Record<string, string>>
    }
  | { op: 'job-signal'; jobId: string; signal: 'SIGTERM' | 'SIGKILL' }
  | { op: 'screen-start'; width: number; height: number }
  | { op: 'screen-stop' }
  | { op: 'observe' }
  | { op: 'input'; input: GuestInput }
  | { op: 'a11y-invoke'; nodeId: string; action: string }
  | { op: 'launch'; appId: string; args?: readonly string[] }
  | { op: 'clipboard-read' }
  | { op: 'clipboard-write'; text: string }
  | { op: 'frames-start'; fps: number; width: number; height: number }
  | { op: 'frames-stop' }
  | { op: 'handover-begin'; ttlMs: number; scope: DeskHandoverScope }
  | { op: 'handover-end' }

export type GuestOp = GuestCommand['op']

export type GuestRequest = GuestCommand & { id: string }

export type GuestResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }

/** Unsolicited guest-to-host messages: job exits, frames, focus changes. */
export type GuestEventMessage =
  | { event: 'job-exit'; jobId: string; exitCode: number | null; signal: string | null }
  | { event: 'frame'; seq: number; width: number; height: number; data: string }
  | { event: 'window-focus'; window: WindowInfo }

export type HostBoundMessage = GuestResponse | GuestEventMessage

/** The wire shape of an exec result, before the host turns it into a snapshot. */
export interface GuestExecResult {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
}

/** The wire shape of an observation; `png` is base64. */
export interface GuestObservation {
  png: string
  width: number
  height: number
  a11y: A11yNode | null
  windows: WindowInfo[]
  focused: WindowInfo | null
}

/** Encode one message as a length-prefixed JSON frame. */
export function encodeFrame(message: unknown, maxFrameBytes = DEFAULT_MAX_FRAME_BYTES): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  if (body.byteLength > maxFrameBytes) {
    throw new DeskProtocolError(
      `Refusing to encode a ${body.byteLength}-byte frame; the limit is ${maxFrameBytes}.`,
    )
  }
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + body.byteLength)
  frame.writeUInt32BE(body.byteLength, 0)
  body.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

/**
 * Incremental frame decoder. Feed it arbitrary chunk boundaries; it returns
 * every complete parsed JSON value. A declared frame length beyond the bound
 * or a body that is not valid JSON throws — framing violations are fatal to
 * the connection because there is no way to resynchronize a byte stream whose
 * lengths cannot be trusted.
 */
export class FrameDecoder {
  readonly #maxFrameBytes: number
  #buffered: Buffer = Buffer.alloc(0)

  constructor(options: { maxFrameBytes?: number } = {}) {
    const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
    if (!Number.isInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new DeskProtocolError('maxFrameBytes must be a positive integer.')
    }
    this.#maxFrameBytes = maxFrameBytes
  }

  push(chunk: Buffer): unknown[] {
    this.#buffered = this.#buffered.byteLength === 0
      ? chunk
      : Buffer.concat([this.#buffered, chunk])
    const messages: unknown[] = []
    while (this.#buffered.byteLength >= FRAME_HEADER_BYTES) {
      const declared = this.#buffered.readUInt32BE(0)
      if (declared > this.#maxFrameBytes) {
        throw new DeskProtocolError(
          `Peer declared a ${declared}-byte frame; the limit is ${this.#maxFrameBytes}.`,
        )
      }
      if (this.#buffered.byteLength < FRAME_HEADER_BYTES + declared) break
      const body = this.#buffered.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + declared)
      this.#buffered = this.#buffered.subarray(FRAME_HEADER_BYTES + declared)
      try {
        messages.push(JSON.parse(body.toString('utf8')))
      } catch (error) {
        throw new DeskProtocolError(
          `Frame body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return messages
  }
}

/** Validate a host-to-guest request. Unknown ops and malformed fields throw. */
export function parseGuestRequest(value: unknown): GuestRequest {
  const record = asRecord(value, 'request')
  const id = requireString(record, 'id')
  if (!REQUEST_ID_PATTERN.test(id)) {
    throw new DeskProtocolError('Request id must be 1–128 URL-safe characters.')
  }
  const op = requireString(record, 'op')
  switch (op) {
    case 'ping':
    case 'capabilities':
    case 'screen-stop':
    case 'observe':
    case 'clipboard-read':
    case 'frames-stop':
    case 'handover-end':
      return { id, op }
    case 'exec':
      return {
        id,
        op,
        command: requireString(record, 'command'),
        args: optionalStringArray(record, 'args'),
        cwd: optionalString(record, 'cwd'),
        env: optionalEnvironment(record),
        timeoutMs: optionalPositiveInteger(record, 'timeoutMs'),
      }
    case 'job-start':
      return {
        id,
        op,
        command: requireString(record, 'command'),
        args: optionalStringArray(record, 'args'),
        cwd: optionalString(record, 'cwd'),
        env: optionalEnvironment(record),
      }
    case 'job-signal': {
      const signal = requireString(record, 'signal')
      if (signal !== 'SIGTERM' && signal !== 'SIGKILL') {
        throw new DeskProtocolError('job-signal signal must be SIGTERM or SIGKILL.')
      }
      return { id, op, jobId: requireString(record, 'jobId'), signal }
    }
    case 'screen-start':
      return {
        id,
        op,
        width: requireDimension(record, 'width'),
        height: requireDimension(record, 'height'),
      }
    case 'input':
      return { id, op, input: parseGuestInput(record.input) }
    case 'a11y-invoke':
      return {
        id,
        op,
        nodeId: requireString(record, 'nodeId'),
        action: requireString(record, 'action'),
      }
    case 'launch':
      return {
        id,
        op,
        appId: requireString(record, 'appId'),
        args: optionalStringArray(record, 'args'),
      }
    case 'clipboard-write':
      return { id, op, text: requireString(record, 'text') }
    case 'frames-start':
      return {
        id,
        op,
        fps: requirePositiveInteger(record, 'fps'),
        width: requireDimension(record, 'width'),
        height: requireDimension(record, 'height'),
      }
    case 'handover-begin':
      return {
        id,
        op,
        ttlMs: requirePositiveInteger(record, 'ttlMs'),
        scope: parseHandoverScope(record.scope),
      }
    default:
      throw new DeskProtocolError(`Unknown request op: ${op}`)
  }
}

export function parseGuestInput(value: unknown): GuestInput {
  const record = asRecord(value, 'input')
  const type = requireString(record, 'type')
  switch (type) {
    case 'move':
      return { type, x: requireCoordinate(record, 'x'), y: requireCoordinate(record, 'y') }
    case 'click':
      return {
        type,
        x: requireCoordinate(record, 'x'),
        y: requireCoordinate(record, 'y'),
        button: parsePointerButton(record.button),
      }
    case 'type':
      return { type, text: requireString(record, 'text') }
    case 'key':
      return { type, combo: requireString(record, 'combo') }
    case 'scroll':
      return {
        type,
        x: requireCoordinate(record, 'x'),
        y: requireCoordinate(record, 'y'),
        dx: requireDelta(record, 'dx'),
        dy: requireDelta(record, 'dy'),
      }
    case 'drag':
      return { type, from: parsePoint(record.from), to: parsePoint(record.to) }
    default:
      throw new DeskProtocolError(`Unknown input type: ${type}`)
  }
}

/** Validate a guest-to-host message: a correlated response or an event. */
export function parseHostBoundMessage(value: unknown): HostBoundMessage {
  const record = asRecord(value, 'message')
  if ('id' in record) {
    const id = requireString(record, 'id')
    if (record.ok === true) return { id, ok: true, result: record.result ?? {} }
    if (record.ok === false) return { id, ok: false, error: requireString(record, 'error') }
    throw new DeskProtocolError('Response ok must be a boolean.')
  }
  const event = requireString(record, 'event')
  switch (event) {
    case 'job-exit':
      return {
        event,
        jobId: requireString(record, 'jobId'),
        exitCode: nullableInteger(record, 'exitCode'),
        signal: nullableString(record, 'signal'),
      }
    case 'frame':
      return {
        event,
        seq: requireNonNegativeInteger(record, 'seq'),
        width: requireDimension(record, 'width'),
        height: requireDimension(record, 'height'),
        data: requireUnboundedString(record, 'data'),
      }
    case 'window-focus':
      return { event, window: parseWindowInfo(record.window) }
    default:
      throw new DeskProtocolError(`Unknown event: ${event}`)
  }
}

/** Validate the result payload of an `exec` response. */
export function parseExecResult(value: unknown): GuestExecResult {
  const record = asRecord(value, 'exec result')
  return {
    exitCode: nullableInteger(record, 'exitCode'),
    signal: nullableString(record, 'signal'),
    stdout: requireUnboundedString(record, 'stdout'),
    stderr: requireUnboundedString(record, 'stderr'),
    truncated: record.truncated === true,
  }
}

/** Validate the result payload of a `job-start` response. */
export function parseJobStarted(value: unknown): { jobId: string } {
  const record = asRecord(value, 'job-start result')
  return { jobId: requireString(record, 'jobId') }
}

/** Validate the result payload of an `observe` response. */
export function parseObservation(value: unknown): GuestObservation {
  const record = asRecord(value, 'observation')
  const windows = parseWindows(record.windows)
  return {
    png: requireUnboundedString(record, 'png'),
    width: requireDimension(record, 'width'),
    height: requireDimension(record, 'height'),
    a11y: record.a11y === null || record.a11y === undefined
      ? null
      : parseA11yTree(record.a11y),
    windows,
    focused: record.focused === null || record.focused === undefined
      ? null
      : parseWindowInfo(record.focused),
  }
}

/** Validate the result payload of a `handover-begin` response. */
export function parseHandoverBegun(value: unknown): { url: string } {
  const record = asRecord(value, 'handover-begin result')
  return { url: requireString(record, 'url') }
}

/** Validate the result payload of a `clipboard-read` response. */
export function parseClipboardText(value: unknown): string {
  const record = asRecord(value, 'clipboard-read result')
  return requireUnboundedString(record, 'text')
}

/** Validate the result payload of a `capabilities` response. */
export function parseCapabilities(value: unknown): { virtioGpu: boolean } {
  const record = asRecord(value, 'capabilities result')
  return { virtioGpu: record.virtioGpu === true }
}

export function parseWindowInfo(value: unknown): WindowInfo {
  const record = asRecord(value, 'window')
  return {
    id: requireString(record, 'id'),
    title: requireString(record, 'title'),
    appId: nullableString(record, 'appId'),
  }
}

function parseWindows(value: unknown): WindowInfo[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_WINDOWS) {
    throw new DeskProtocolError(`windows must be an array of at most ${MAX_WINDOWS} entries.`)
  }
  return value.map(parseWindowInfo)
}

function parseA11yTree(value: unknown): A11yNode {
  const budget = { remaining: MAX_A11Y_NODES }
  return parseA11yNode(value, budget, 0)
}

function parseA11yNode(value: unknown, budget: { remaining: number }, depth: number): A11yNode {
  if (depth > MAX_A11Y_DEPTH) {
    throw new DeskProtocolError(`Accessibility tree exceeds depth ${MAX_A11Y_DEPTH}.`)
  }
  if (budget.remaining <= 0) {
    throw new DeskProtocolError(`Accessibility tree exceeds ${MAX_A11Y_NODES} nodes.`)
  }
  budget.remaining -= 1
  const record = asRecord(value, 'a11y node')
  const rawChildren = record.children ?? []
  if (!Array.isArray(rawChildren)) {
    throw new DeskProtocolError('a11y node children must be an array.')
  }
  return {
    id: requireString(record, 'id'),
    role: requireString(record, 'role'),
    name: nullableString(record, 'name'),
    actions: optionalStringArray(record, 'actions') ?? [],
    bounds: record.bounds === null || record.bounds === undefined
      ? null
      : parseBounds(record.bounds),
    children: rawChildren.map((child) => parseA11yNode(child, budget, depth + 1)),
  }
}

function parseBounds(value: unknown): { x: number; y: number; width: number; height: number } {
  const record = asRecord(value, 'bounds')
  return {
    x: requireDelta(record, 'x'),
    y: requireDelta(record, 'y'),
    width: requireNonNegativeInteger(record, 'width'),
    height: requireNonNegativeInteger(record, 'height'),
  }
}

function parsePoint(value: unknown): DeskPoint {
  const record = asRecord(value, 'point')
  return { x: requireCoordinate(record, 'x'), y: requireCoordinate(record, 'y') }
}

function parsePointerButton(value: unknown): DeskPointerButton {
  if (value === undefined) return 'left'
  if (value === 'left' || value === 'middle' || value === 'right') return value
  throw new DeskProtocolError('button must be left, middle, or right.')
}

function parseHandoverScope(value: unknown): DeskHandoverScope {
  if (value === 'view' || value === 'control') return value
  throw new DeskProtocolError('scope must be view or control.')
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeskProtocolError(`Expected ${label} to be an object.`)
  }
  return value as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH) {
    throw new DeskProtocolError(
      `${field} must be a string of 1–${MAX_STRING_LENGTH} characters.`,
    )
  }
  return value
}

function requireUnboundedString(record: Record<string, unknown>, field: string): string {
  // Bounded by the frame limit rather than the field limit; used for payloads
  // such as command output, screenshots, and clipboard text.
  const value = record[field]
  if (typeof value !== 'string') {
    throw new DeskProtocolError(`${field} must be a string.`)
  }
  return value
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  return record[field] === undefined ? undefined : requireString(record, field)
}

function nullableString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  if (value === null || value === undefined) return null
  return requireString(record, field)
}

function optionalStringArray(
  record: Record<string, unknown>,
  field: string,
): string[] | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_ARGUMENTS) {
    throw new DeskProtocolError(`${field} must be an array of at most ${MAX_ARGUMENTS} strings.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length > MAX_STRING_LENGTH) {
      throw new DeskProtocolError(`${field}[${index}] must be a string of at most ${MAX_STRING_LENGTH} characters.`)
    }
    return entry
  })
}

function optionalEnvironment(
  record: Record<string, unknown>,
): Record<string, string> | undefined {
  const value = record.env
  if (value === undefined) return undefined
  const env = asRecord(value, 'env')
  const entries = Object.entries(env)
  if (entries.length > MAX_ENVIRONMENT_ENTRIES) {
    throw new DeskProtocolError(`env must have at most ${MAX_ENVIRONMENT_ENTRIES} entries.`)
  }
  const clean: Record<string, string> = {}
  for (const [key, entry] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new DeskProtocolError(`Invalid environment variable name: ${key}`)
    }
    if (typeof entry !== 'string' || entry.length > MAX_STRING_LENGTH) {
      throw new DeskProtocolError(`env.${key} must be a string of at most ${MAX_STRING_LENGTH} characters.`)
    }
    clean[key] = entry
  }
  return clean
}

function requirePositiveInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new DeskProtocolError(`${field} must be a positive integer.`)
  }
  return value
}

function optionalPositiveInteger(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  return record[field] === undefined ? undefined : requirePositiveInteger(record, field)
}

function requireNonNegativeInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DeskProtocolError(`${field} must be a non-negative integer.`)
  }
  return value
}

function requireDimension(record: Record<string, unknown>, field: string): number {
  const value = requirePositiveInteger(record, field)
  if (value > 16_384) {
    throw new DeskProtocolError(`${field} must be at most 16384 pixels.`)
  }
  return value
}

function requireCoordinate(record: Record<string, unknown>, field: string): number {
  return requireNonNegativeInteger(record, field)
}

function requireDelta(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DeskProtocolError(`${field} must be an integer.`)
  }
  return value
}

function nullableInteger(record: Record<string, unknown>, field: string): number | null {
  const value = record[field]
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DeskProtocolError(`${field} must be an integer or null.`)
  }
  return value
}
