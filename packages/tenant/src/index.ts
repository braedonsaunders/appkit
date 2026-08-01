// Re-exported because this package's own public types are written in terms of
// it — RequestContext carries scopes, AccessCtx is resolved against them — so a
// consumer typing a variable that holds one had to reach past @appkit/tenant
// into @appkit/db for a type it only ever sees through this API.
export type { RoleScope } from '@appkit/db'
export {
  type TenantDatabase,
  type RequestContextCore,
  type RequestContext,
  type RequestContextArgs,
  type SuperAdminContext,
  type ImpersonationInfo,
  type TenantContextRuntime,
  createTenantContextFactory,
  makeTenantContext,
  makeSuperAdminContext,
} from './context'
export {
  type AccessCtx,
  ForbiddenError,
  ImpersonationBlockedError,
  PermissionCatalogueRequiredError,
  permissionSetCovers,
  applyPermissionOverrides,
  can,
  assertCan,
  assertNotImpersonating,
  effectiveRoleAssignments,
  createMembershipAccessResolver,
  resolveMembershipAccess,
  canSeeSite,
  widestScope,
  selfOnlyFilter,
  isTemplateBuilder,
  canAccessTemplate,
  canEditResponsePayload,
  type TemplateAccessDescriptor,
  type TemplateAccessMode,
  type ResponsePayloadAccessDescriptor,
  type MembershipAccessOptions,
  type MembershipAccessDatabase,
} from './rbac'
