export type NotificationAudiencePolicy = {
  enabled: boolean
  userIds: string[]
  groupIds: string[]
  roleKeys: string[]
}

export type RecipientDirectory = {
  loadAudiencePolicy: (
    tenantId: string,
    category: string,
  ) => Promise<NotificationAudiencePolicy | null>
  resolveGroupUserIds: (tenantId: string, groupIds: string[]) => Promise<string[]>
  resolveRoleUserIds: (tenantId: string, roleKeys: string[]) => Promise<string[]>
  filterActiveUserIds: (tenantId: string, userIds: string[]) => Promise<string[]>
  emailsForUserIds: (tenantId: string, userIds: string[]) => Promise<string[]>
}

export type RecipientResolverOptions = {
  defaultRolesByCategory?: Readonly<Record<string, readonly string[]>>
  fallbackRoleKeys?: readonly string[]
}

export function createRecipientResolver(
  directory: RecipientDirectory,
  options: RecipientResolverOptions = {},
) {
  const fallbackRoleKeys = [...(options.fallbackRoleKeys ?? ['tenant_admin'])]

  async function resolveUserIds(
    tenantId: string,
    category: string,
    extraUserIds: string[] = [],
  ): Promise<string[]> {
    const policy = await directory.loadAudiencePolicy(tenantId, category)
    if (policy?.enabled === false) return []

    const candidates = new Set([...extraUserIds, ...(policy?.userIds ?? [])].filter(Boolean))
    if (policy?.groupIds.length) {
      for (const userId of await directory.resolveGroupUserIds(tenantId, policy.groupIds)) {
        candidates.add(userId)
      }
    }
    const roleKeys = policy
      ? policy.roleKeys
      : [...(options.defaultRolesByCategory?.[category] ?? fallbackRoleKeys)]
    if (roleKeys.length) {
      for (const userId of await directory.resolveRoleUserIds(tenantId, roleKeys)) {
        candidates.add(userId)
      }
    }
    if (candidates.size === 0) return []
    return [...new Set(await directory.filterActiveUserIds(tenantId, [...candidates]))]
  }

  async function resolveEmails(
    tenantId: string,
    category: string,
    extraUserIds: string[] = [],
  ): Promise<string[]> {
    const userIds = await resolveUserIds(tenantId, category, extraUserIds)
    if (userIds.length === 0) return []
    return [...new Set((await directory.emailsForUserIds(tenantId, userIds))
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
  }

  return { resolveUserIds, resolveEmails }
}
