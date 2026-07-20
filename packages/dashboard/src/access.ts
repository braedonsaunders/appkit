export type DashboardAccessContext = { permissions: Iterable<string>; roleTier?: number }
export type DashboardAccessRule = { permission?: string; minimumRoleTier?: number; predicate?: (context: DashboardAccessContext) => boolean }

export function canAccessDashboardItem(context: DashboardAccessContext, rule?: DashboardAccessRule): boolean {
  if (!rule) return true
  if (rule.minimumRoleTier !== undefined && (context.roleTier ?? 0) < rule.minimumRoleTier) return false
  if (rule.permission && !hasPermission(context.permissions, rule.permission)) return false
  return rule.predicate?.(context) ?? true
}

export function filterDashboardItems<T extends { access?: DashboardAccessRule }>(items: T[], context: DashboardAccessContext): T[] { return items.filter((item) => canAccessDashboardItem(context, item.access)) }
function hasPermission(permissions: Iterable<string>, requested: string): boolean { for (const permission of permissions) { if (permission === '*' || permission === requested || (permission.endsWith('.*') && requested.startsWith(permission.slice(0, -1)))) return true } return false }
