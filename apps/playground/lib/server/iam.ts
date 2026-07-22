import 'server-only'
import type { IamAdminService } from '@appkit/iam'
import { createDrizzleIamService } from '@appkit/iam/drizzle'
import { demoIamService } from '../demo-iam'
import { getDemoEnvironment } from './demo-context'
import { isDatabaseConfigured, platform } from './platform'

export async function getDemoIamService(): Promise<IamAdminService> {
  if (!isDatabaseConfigured()) return demoIamService
  const environment = await getDemoEnvironment()
  if (!environment.ctx.membership) throw new Error('The demo IAM identity has no tenant membership.')
  return createDrizzleIamService({
    db: platform().appkit.superDb as never,
    tenantId: environment.tenant.id,
    actor: { userId: environment.user.id, name: environment.user.name },
    currentMembershipId: environment.ctx.membership.id,
  })
}
