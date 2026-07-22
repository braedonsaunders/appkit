# @appkit/iam

Tenant identity and access management that can be adopted independently of an
authentication provider.

The dependency-light root defines permission catalogues, hierarchical wildcard
coverage, read-tier cascading, deny-wins overrides, tenant roles, memberships,
scoped assignments, lifecycle state, audit events, and the complete
`IamAdminService` boundary.

## Entry points

- `@appkit/iam` — contracts and permission evaluation
- `@appkit/iam/react` — role, member, scope, override, and audit administration
- `@appkit/iam/drizzle` — tenant-bound Postgres/RLS service with atomic audit
- `@appkit/iam/memory` — deterministic browser, local-first, and test adapter
- `@appkit/iam/http` — authenticated framework-neutral handler and full-contract client
- `@appkit/iam/schema` — canonical identity and audit schema re-exports

Applications supply their permission catalogue and any domain scope choices.
The package never embeds product permissions, organization hierarchy, or an
identity provider. Invitation delivery is injected through
`afterInvitePersisted`, so Better Auth, Auth0, Clerk, WorkOS, a job queue, or a
custom provider can own credential issuance without changing the IAM UI.

```tsx
import { RolesAdmin } from '@appkit/iam/react'
import { createDrizzleIamService } from '@appkit/iam/drizzle'

const iam = createDrizzleIamService({
  db: requestContext.db,
  tenantId: requestContext.tenantId,
  actor: { userId: requestContext.user.id },
  currentMembershipId: requestContext.membership.id,
})

<RolesAdmin service={iam} permissionGroups={permissionGroups} />
```

Role and member mutations enforce built-in, current-user, and super-admin
protections in the adapter as well as the UI. Re-selecting an existing
member/role pair updates its scope instead of widening access with a duplicate
assignment.
