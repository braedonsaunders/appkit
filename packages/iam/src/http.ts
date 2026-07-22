import type { IamAdminService } from './types'
import { IamConflictError, IamNotFoundError, IamProtectedRecordError } from './memory'

const METHODS = [
  'listRoles', 'getRole', 'createRole', 'updateRole', 'duplicateRole', 'deleteRole',
  'bulkUpdateRoleAssignments',
  'listMembers', 'getMember', 'inviteMember', 'updateMember', 'removeMember',
  'resendInvite',
  'assignRole', 'updateAssignmentScope', 'removeAssignment',
  'setPermissionOverride', 'removePermissionOverride',
  'listAuditEvents', 'getAuditEvent',
] as const satisfies ReadonlyArray<keyof IamAdminService>

type Method = (typeof METHODS)[number]

export class IamHttpAuthorizationError extends Error {
  constructor(message = 'Not authorized.', readonly status: 401 | 403 = 403) {
    super(message)
    this.name = 'IamHttpAuthorizationError'
  }
}

export type IamHttpHandlerOptions = {
  /** Resolve an already tenant-bound service for this authenticated request. */
  resolveService: (request: Request) => Promise<IamAdminService>
  /** Required authorization gate, evaluated before the service is resolved. */
  authorize: (request: Request, method: Method) => Promise<void>
  maxBodyBytes?: number
}

/** Framework-neutral authenticated RPC transport for the full IAM contract. */
export function createIamHttpHandler(options: IamHttpHandlerOptions) {
  const allowed = new Set<string>(METHODS)
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return errorResponse('method_not_allowed', 'Use POST.', 405)
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) {
      return errorResponse('forbidden', 'Cross-origin IAM mutations are not allowed.', 403)
    }
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > (options.maxBodyBytes ?? 64 * 1024)) {
      return errorResponse('payload_too_large', 'Request payload is too large.', 413)
    }
    let input: { method?: unknown; args?: unknown }
    try {
      input = JSON.parse(raw) as { method?: unknown; args?: unknown }
    } catch {
      return errorResponse('invalid_json', 'Request body must be valid JSON.', 400)
    }
    if (typeof input.method !== 'string' || !allowed.has(input.method)) {
      return errorResponse('invalid_method', 'Unknown IAM operation.', 400)
    }
    if (!Array.isArray(input.args) || input.args.length > 3) {
      return errorResponse('invalid_arguments', 'IAM operation arguments are invalid.', 400)
    }
    const method = input.method as Method
    try {
      await options.authorize(request, method)
      const service = await options.resolveService(request)
      const operation = service[method] as (...args: unknown[]) => Promise<unknown>
      const result = await operation.apply(service, deserialize(input.args) as unknown[])
      return Response.json({ result: serialize(result) })
    } catch (error) {
      if (error instanceof IamHttpAuthorizationError) {
        return errorResponse(error.status === 401 ? 'unauthenticated' : 'forbidden', error.message, error.status)
      }
      if (error instanceof IamNotFoundError) return errorResponse('not_found', error.message, 404)
      if (error instanceof IamConflictError) return errorResponse('conflict', error.message, 409)
      if (error instanceof IamProtectedRecordError) return errorResponse('protected_record', error.message, 403)
      const message = error instanceof Error ? error.message : 'IAM operation failed.'
      return errorResponse('operation_failed', message, 400)
    }
  }
}

export type IamHttpClientOptions = {
  endpoint: string
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}

/** Browser/server client implementing the same contract as memory and Drizzle. */
export function createHttpIamService(options: IamHttpClientOptions): IamAdminService {
  const request = async <T>(method: Method, args: unknown[]): Promise<T> => {
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
    const response = await (options.fetch ?? globalThis.fetch)(options.endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ method, args: serialize(args) }),
    })
    const payload = (await response.json().catch(() => null)) as
      | { result?: unknown; error?: { code?: string; message?: string } }
      | null
    if (!response.ok) throw new Error(payload?.error?.message || `IAM request failed (${response.status}).`)
    return deserialize(payload?.result) as T
  }
  return {
    listRoles: (query) => request('listRoles', [query]),
    getRole: (roleId) => request('getRole', [roleId]),
    createRole: (input) => request('createRole', [input]),
    updateRole: (roleId, input) => request('updateRole', [roleId, input]),
    duplicateRole: (roleId, name) => request('duplicateRole', [roleId, name]),
    deleteRole: (roleId) => request('deleteRole', [roleId]),
    bulkUpdateRoleAssignments: (input) => request('bulkUpdateRoleAssignments', [input]),
    listMembers: (query) => request('listMembers', [query]),
    getMember: (membershipId) => request('getMember', [membershipId]),
    inviteMember: (input) => request('inviteMember', [input]),
    resendInvite: (membershipId) => request('resendInvite', [membershipId]),
    updateMember: (membershipId, input) => request('updateMember', [membershipId, input]),
    removeMember: (membershipId) => request('removeMember', [membershipId]),
    assignRole: (membershipId, roleId, scope) => request('assignRole', [membershipId, roleId, scope]),
    updateAssignmentScope: (assignmentId, scope) => request('updateAssignmentScope', [assignmentId, scope]),
    removeAssignment: (assignmentId) => request('removeAssignment', [assignmentId]),
    setPermissionOverride: (membershipId, override) => request('setPermissionOverride', [membershipId, override]),
    removePermissionOverride: (membershipId, permission) => request('removePermissionOverride', [membershipId, permission]),
    listAuditEvents: (query) => request('listAuditEvents', [query]),
    getAuditEvent: (eventId) => request('getAuditEvent', [eventId]),
  }
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return { __appkitDate: value.toISOString() }
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]))
  }
  return value
}

function deserialize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deserialize)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Object.keys(record).length === 1 && typeof record.__appkitDate === 'string') {
      const date = new Date(record.__appkitDate)
      if (!Number.isNaN(date.getTime())) return date
    }
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, deserialize(entry)]))
  }
  return value
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}
