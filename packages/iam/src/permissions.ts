import type { PermissionGroup } from './types'
export { applyPermissionOverrides, permissionSetCovers } from '@appkit/tenant'

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
