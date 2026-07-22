import type { PermissionGroup } from './types'

export function permissionSetCovers(permissions: ReadonlySet<string>, permission: string): boolean {
  if (permissions.has('*') || permissions.has(permission)) return true
  if (readTierCovers(permissions, permission)) return true
  for (const grant of permissions) {
    if (grant.endsWith('.*') && permission.startsWith(grant.slice(0, -1))) return true
  }
  return false
}

function readTierCovers(permissions: ReadonlySet<string>, requested: string): boolean {
  const match = /^(.+)\.read\.(all|site|self)$/.exec(requested)
  if (!match) return false
  const prefix = match[1]
  const tier = match[2]
  if (!prefix) return false
  if (tier === 'site') return permissions.has(`${prefix}.read.all`)
  if (tier === 'self') {
    return permissions.has(`${prefix}.read.all`) || permissions.has(`${prefix}.read.site`)
  }
  return false
}

/** Deny wins, including when a concrete deny carves a key out of a wildcard. */
export function applyPermissionOverrides(
  base: Iterable<string>,
  overrides: Iterable<{ permission: string; effect: 'grant' | 'deny' }>,
  catalogue: Iterable<string>,
): Set<string> {
  const permissions = new Set(base)
  const values = [...overrides]
  for (const override of values) {
    if (override.effect === 'grant') permissions.add(override.permission)
  }

  const catalogueKeys = [...catalogue]
  const denies = values.filter((value) => value.effect === 'deny').map((value) => value.permission)
  const concreteDenies = denies.filter((permission) => !permission.endsWith('.*'))
  for (const grant of [...permissions]) {
    if (!grant.endsWith('.*')) continue
    const prefix = grant.slice(0, -1)
    if (!concreteDenies.some((permission) => permission.startsWith(prefix))) continue
    permissions.delete(grant)
    for (const permission of catalogueKeys) {
      if (permission.startsWith(prefix)) permissions.add(permission)
    }
  }
  for (const denied of denies) {
    permissions.delete(denied)
    if (!denied.endsWith('.*')) continue
    const prefix = denied.slice(0, -1)
    for (const permission of [...permissions]) {
      if (permission.startsWith(prefix)) permissions.delete(permission)
    }
  }
  return permissions
}

export function validatePermissionGroups(groups: readonly PermissionGroup[]): string[] {
  const errors: string[] = []
  const groupKeys = new Set<string>()
  const permissionKeys = new Set<string>()
  for (const group of groups) {
    if (!group.key.trim()) errors.push('Permission groups require a non-empty key.')
    if (groupKeys.has(group.key)) errors.push(`Duplicate permission group: ${group.key}`)
    groupKeys.add(group.key)
    for (const permission of group.permissions) {
      if (!permission.key.trim()) errors.push(`Permission in ${group.key} requires a non-empty key.`)
      if (permissionKeys.has(permission.key)) errors.push(`Duplicate permission: ${permission.key}`)
      permissionKeys.add(permission.key)
    }
  }
  return errors
}

export function permissionCatalogue(groups: readonly PermissionGroup[]): string[] {
  const errors = validatePermissionGroups(groups)
  if (errors.length > 0) throw new Error(errors.join('\n'))
  return groups.flatMap((group) => group.permissions.map((permission) => permission.key))
}
