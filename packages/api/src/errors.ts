// Public REST API error type + JSON error envelope. Every handler throws
// ApiError and lets `withApiKey` render it, so error shapes stay consistent.
// Returns a Web `Response` (Next route handlers accept it) — no framework dep.

import { randomUUID } from 'node:crypto'

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'conflict'
  | 'payload_too_large'
  | 'unavailable'
  | 'internal'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static unauthorized(message = 'Missing or invalid API key') {
    return new ApiError(401, 'unauthorized', message)
  }
  static forbidden(message = 'API key lacks the required permission') {
    return new ApiError(403, 'forbidden', message)
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'not_found', message)
  }
  static invalid(message: string, details?: unknown) {
    return new ApiError(400, 'invalid_request', message, details)
  }
  static methodNotAllowed(message: string) {
    return new ApiError(405, 'method_not_allowed', message)
  }
  static rateLimited(retryAfterSeconds: number, headers: Record<string, string> = {}) {
    return new ApiError(429, 'rate_limited', 'API rate limit exceeded', undefined, {
      'Retry-After': String(Math.max(1, retryAfterSeconds)),
      ...headers,
    })
  }
  static conflict(message: string) {
    return new ApiError(409, 'conflict', message)
  }
  static tooLarge(message = 'Request body is too large') {
    return new ApiError(413, 'payload_too_large', message)
  }
  static unavailable(message = 'API temporarily unavailable') {
    return new ApiError(503, 'unavailable', message, undefined, { 'Retry-After': '30' })
  }
}

type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: unknown } }

/** Per-request, key-scoped responses are never cached. */
export function noStore(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    Vary: 'Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-ID': randomUUID(),
    ...extra,
  }
}

/** Render any thrown value as a JSON error `Response`; never leaks internals. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message } }
    if (typeof err.details !== 'undefined') body.error.details = err.details
    return Response.json(body, { status: err.status, headers: noStore(err.headers) })
  }
  return Response.json(
    { error: { code: 'internal', message: 'Internal server error' } },
    { status: 500, headers: noStore() },
  )
}
