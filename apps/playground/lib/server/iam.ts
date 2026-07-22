import 'server-only'
import type { IamAdminService } from '@appkit/iam'
import { createDrizzleIamService } from '@appkit/iam/drizzle'
import { DEMO_PERMISSION_GROUPS, demoIamService } from '../demo-iam'
import { getDemoEnvironment } from './demo-context'
import { isDatabaseConfigured, platform } from './platform'

export async function getDemoIamService(): Promise<IamAdminService> {
  if (!isDatabaseConfigured()) return demoIamService
  const environment = await getDemoEnvironment()
  if (!environment.ctx.membership) throw new Error('The demo IAM identity has no tenant membership.')
  return createDrizzleIamService({
    db: platform().appkit.superDb as never,
    tenantId: environment.tenant.id,
    actor: { userId: environment.user.id, name: environment.user.name, isSuperAdmin: environment.user.isSuperAdmin },
    currentMembershipId: environment.ctx.membership.id,
    permissionCatalogue: DEMO_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key)),
    roleCapabilities: (role) => ({
      updateKey: !role.isBuiltIn,
      updateDetails: true,
      updatePermissions: role.key !== 'administrator',
      duplicate: true,
      delete: !role.isBuiltIn,
      reason: role.key === 'administrator'
        ? 'The root administrator permission set is locked to prevent workspace lockout.'
        : role.isBuiltIn
          ? 'Built-in role keys and deletion are protected.'
          : undefined,
    }),
  })
}
