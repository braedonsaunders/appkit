import { ApiError } from './errors'
import type { ApiAuth } from './auth'

/** Wildcard-aware: `module.*` grants `module.x`. */
export function keyHasPermission(permissions: readonly string[], required: string): boolean {
  if (permissions.includes(required)) return true
  for (const permission of permissions) {
    if (permission.endsWith('.*') && required.startsWith(permission.slice(0, -1))) return true
  }
  return false
}

/** Filter stored permissions to the app's catalogue (if supplied) + de-dupe. */
export function sanitizeApiPermissions(
  permissions: readonly string[],
  catalogue?: readonly string[],
): string[] {
  const valid = catalogue ? new Set(catalogue) : null
  return [
    ...new Set(
      permissions.map((p) => p.trim()).filter((p) => p.length > 0 && (!valid || valid.has(p))),
    ),
  ]
}

/** Assert the authenticated key holds `permission`, else throw 403. */
export function authorize(auth: ApiAuth, permission: string): void {
  if (!keyHasPermission(auth.key.permissions, permission)) throw ApiError.forbidden()
}
