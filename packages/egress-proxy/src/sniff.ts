/**
 * Pure destination sniffers for transparently intercepted TCP flows.
 *
 * Behind a DNAT redirect the client never speaks proxy protocol, so the only
 * way to learn the destination hostname without terminating the connection is
 * to read it out of the first bytes the client sends: the SNI extension of a
 * TLS ClientHello, or the request line and Host header of a plain-HTTP
 * request. Both parsers here are pure functions over a byte buffer — no I/O,
 * no state — so they can be tested exhaustively against fixtures.
 *
 * Every outcome is explicit. `need-more-bytes` means the buffer is a valid
 * prefix and the caller may keep reading; `malformed` means the bytes can
 * never become a parseable destination and the flow must be denied. Nothing
 * in this module ever guesses.
 */

import { Buffer } from 'node:buffer'

export type SniffOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'need-more-bytes' }
  | { readonly kind: 'malformed'; readonly reason: string }

const NEED_MORE_BYTES = { kind: 'need-more-bytes' } as const

function malformed(reason: string): SniffOutcome<never> {
  return { kind: 'malformed', reason }
}

function ok<T>(value: T): SniffOutcome<T> {
  return { kind: 'ok', value }
}

function asBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

const TLS_HANDSHAKE_RECORD = 0x16
const TLS_CLIENT_HELLO = 0x01
const TLS_SERVER_NAME_EXTENSION = 0x0000
const TLS_SNI_HOSTNAME_TYPE = 0x00
const MAX_TLS_RECORD_BYTES = 16_384
const MAX_CLIENT_HELLO_BYTES = 131_072

/**
 * Extract the SNI server name from the leading bytes of a TLS connection
 * without terminating TLS. Handles a ClientHello fragmented across several
 * handshake records. Returns `ok(null)` for a structurally valid ClientHello
 * that carries no server name — the caller cannot recover a hostname from
 * such a flow and must fail closed.
 */
export function readClientHelloSni(
  data: Uint8Array,
): SniffOutcome<string | null> {
  const wire = asBuffer(data)
  if (wire.length === 0) return NEED_MORE_BYTES
  if (wire.readUInt8(0) !== TLS_HANDSHAKE_RECORD) {
    return malformed('first byte is not a TLS handshake record')
  }

  let offset = 0
  const fragments: Buffer[] = []
  let have = 0
  let messageLength: number | null = null
  while (true) {
    if (wire.length < offset + 5) return NEED_MORE_BYTES
    if (wire.readUInt8(offset) !== TLS_HANDSHAKE_RECORD) {
      return malformed('non-handshake record before the ClientHello completed')
    }
    if (wire.readUInt8(offset + 1) !== 0x03) {
      return malformed('unsupported TLS record version')
    }
    const recordLength = wire.readUInt16BE(offset + 3)
    if (recordLength === 0) return malformed('empty TLS handshake record')
    if (recordLength > MAX_TLS_RECORD_BYTES) {
      return malformed('TLS record length exceeds the protocol maximum')
    }
    const fragmentStart = offset + 5
    const available = Math.min(wire.length - fragmentStart, recordLength)
    fragments.push(wire.subarray(fragmentStart, fragmentStart + available))
    have += available
    const message = Buffer.concat(fragments, have)
    if (messageLength === null && have >= 4) {
      if (message.readUInt8(0) !== TLS_CLIENT_HELLO) {
        return malformed('handshake message is not a ClientHello')
      }
      messageLength = 4 + message.readUIntBE(1, 3)
      if (messageLength > MAX_CLIENT_HELLO_BYTES) {
        return malformed('ClientHello length is implausibly large')
      }
    }
    if (messageLength !== null && have >= messageLength) {
      return parseClientHelloBody(message.subarray(4, messageLength))
    }
    if (available < recordLength) return NEED_MORE_BYTES
    offset = fragmentStart + recordLength
  }
}

/** The handshake message is complete here, so any overrun is malformed rather than truncation. */
function parseClientHelloBody(body: Buffer): SniffOutcome<string | null> {
  let cursor = 0
  const fits = (bytes: number): boolean => cursor + bytes <= body.length

  // legacy_version (2) + random (32)
  if (!fits(34)) return malformed('ClientHello ends before the random')
  cursor += 34

  if (!fits(1)) return malformed('ClientHello ends before the session id')
  const sessionIdLength = body.readUInt8(cursor)
  cursor += 1
  if (sessionIdLength > 32) return malformed('session id longer than 32 bytes')
  if (!fits(sessionIdLength)) return malformed('session id overruns the ClientHello')
  cursor += sessionIdLength

  if (!fits(2)) return malformed('ClientHello ends before the cipher suites')
  const cipherSuitesLength = body.readUInt16BE(cursor)
  cursor += 2
  if (cipherSuitesLength < 2 || cipherSuitesLength % 2 !== 0) {
    return malformed('cipher suite length is not a positive even number')
  }
  if (!fits(cipherSuitesLength)) {
    return malformed('cipher suites overrun the ClientHello')
  }
  cursor += cipherSuitesLength

  if (!fits(1)) return malformed('ClientHello ends before the compression methods')
  const compressionLength = body.readUInt8(cursor)
  cursor += 1
  if (compressionLength < 1) return malformed('no compression methods present')
  if (!fits(compressionLength)) {
    return malformed('compression methods overrun the ClientHello')
  }
  cursor += compressionLength

  if (cursor === body.length) return ok(null)
  if (!fits(2)) return malformed('dangling byte after the compression methods')
  const extensionsLength = body.readUInt16BE(cursor)
  cursor += 2
  if (cursor + extensionsLength !== body.length) {
    return malformed('extensions length does not match the remaining ClientHello bytes')
  }

  while (cursor < body.length) {
    if (!fits(4)) return malformed('truncated extension header')
    const extensionType = body.readUInt16BE(cursor)
    const extensionLength = body.readUInt16BE(cursor + 2)
    cursor += 4
    if (!fits(extensionLength)) return malformed('extension overruns the ClientHello')
    if (extensionType === TLS_SERVER_NAME_EXTENSION) {
      return parseServerNameExtension(
        body.subarray(cursor, cursor + extensionLength),
      )
    }
    cursor += extensionLength
  }
  return ok(null)
}

function parseServerNameExtension(
  extension: Buffer,
): SniffOutcome<string | null> {
  if (extension.length < 2) return malformed('server_name extension is too short')
  const listLength = extension.readUInt16BE(0)
  if (2 + listLength !== extension.length) {
    return malformed('server_name list length does not match the extension')
  }
  let cursor = 2
  while (cursor < extension.length) {
    if (cursor + 3 > extension.length) {
      return malformed('truncated server_name entry')
    }
    const nameType = extension.readUInt8(cursor)
    const nameLength = extension.readUInt16BE(cursor + 1)
    cursor += 3
    if (cursor + nameLength > extension.length) {
      return malformed('server_name entry overruns the extension')
    }
    if (nameType === TLS_SNI_HOSTNAME_TYPE) {
      if (nameLength === 0) return malformed('empty server_name')
      const name = extension.toString('latin1', cursor, cursor + nameLength)
      if (/[^\u0021-\u007e]/.test(name)) {
        return malformed('server_name contains non-ASCII or control bytes')
      }
      return ok(name)
    }
    cursor += nameLength
  }
  return ok(null)
}

const MAX_HTTP_HEAD_BYTES = 16_384
const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export interface HttpRequestHead {
  method: string
  /** The request target exactly as sent: origin-, absolute-, or authority-form. */
  target: string
  /** Header fields in wire order with lower-cased names. */
  headers: ReadonlyArray<readonly [name: string, value: string]>
  /** Offset just past the CRLFCRLF terminator; bytes beyond it belong to the body. */
  headEnd: number
}

/**
 * Parse the head of an HTTP/1.x request from the first bytes of a connection.
 * Strict by design: CRLF line endings only, valid tokens only, no obs-fold,
 * no control bytes in field values. A transparent flow that cannot produce a
 * clean head cannot produce a trustworthy Host either.
 */
export function readHttpRequestHead(
  data: Uint8Array,
): SniffOutcome<HttpRequestHead> {
  const wire = asBuffer(data)
  const terminator = wire.indexOf('\r\n\r\n', 0, 'latin1')
  if (terminator === -1) {
    return wire.length > MAX_HTTP_HEAD_BYTES
      ? malformed('request head exceeds 16 KiB without terminating')
      : NEED_MORE_BYTES
  }
  const headEnd = terminator + 4
  if (headEnd > MAX_HTTP_HEAD_BYTES) {
    return malformed('request head exceeds 16 KiB')
  }

  const head = wire.toString('latin1', 0, terminator)
  const lines = head.split('\r\n')
  const requestLine = lines[0] ?? ''
  const match = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+) ([^ \t]+) HTTP\/1\.[01]$/.exec(
    requestLine,
  )
  const method = match?.[1]
  const target = match?.[2]
  if (!method || !target) {
    return malformed('request line is not valid HTTP/1.x')
  }

  const headers: Array<readonly [string, string]> = []
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon < 1) return malformed('header line has no field name')
    const name = line.slice(0, colon)
    if (!TOKEN_PATTERN.test(name)) {
      return malformed('header field name is not a valid token')
    }
    const value = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, '')
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) {
      return malformed('header field value contains control bytes')
    }
    headers.push([name.toLowerCase(), value])
  }
  return ok({ method, target, headers, headEnd })
}

/** First value of a header field, or null when absent. */
export function headerValue(
  head: HttpRequestHead,
  name: string,
): string | null {
  for (const [fieldName, fieldValue] of head.headers) {
    if (fieldName === name) return fieldValue
  }
  return null
}
