import { assertUuid } from './validation'

/** Accepts either naming convention used by the production applications. */
export type TenantJobScope =
  | { tenantId: string; orgId?: never }
  | { orgId: string; tenantId?: never }

export function assertTenantJobScope(scope: TenantJobScope, label = 'Job'): string {
  const tenantId = scope.tenantId ?? scope.orgId
  if (!tenantId || (scope.tenantId && scope.orgId)) {
    throw new Error(`${label} must contain exactly one tenantId or orgId.`)
  }
  assertUuid(tenantId, `${label} tenant identity`)
  return tenantId
}
