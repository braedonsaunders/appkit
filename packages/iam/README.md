# @appkit/iam

Tenant identity and access management that can be adopted independently of an
authentication provider.

The dependency-light root defines permission catalogues, hierarchical wildcard
coverage, read-tier cascading, deny-wins overrides, tenant roles, memberships,
scoped assignments, lifecycle state, bulk assignment operations, invitation
rotation, audit events, actor-aware mutation capabilities, and the complete
`IamAdminService` boundary.

## Entry points

- `@appkit/iam` — contracts and permission evaluation
- `@appkit/iam/react` — paged role, member, scope, override, activity, and audit administration
- `@appkit/iam/drizzle` — driver-neutral tenant Postgres/RLS service with atomic audit and application lifecycle hooks
- `@appkit/iam/memory` — deterministic browser, local-first, and test adapter
- `@appkit/iam/http` — authenticated framework-neutral handler and full-contract client
- `@appkit/iam/schema` — canonical identity and audit schema re-exports

Applications supply their permission catalogue and any domain scope choices.
The package never embeds product permissions, organization hierarchy, or an
identity provider. Invitation delivery is injected through
`afterInvitePersisted`, so Better Auth, Auth0, Clerk, WorkOS, a job queue, or a
custom provider can own credential issuance without changing the IAM UI.

The React administration keeps filtering, sorting, facets, and pagination on
the service boundary, so a large tenant is never truncated to a client-side
sample. Roles include source-compatible type filters, key and description
columns, grouped permission editing, protected built-ins, duplicate/delete,
per-role member management, bulk add/replace/remove, scoped assignment, and
record activity. Members include status counts, separate sortable name/email
columns, responsive cards, invitations and resend, lifecycle controls,
multi-role scopes, deny-wins overrides, activity, and protected self/super-admin
behavior. Destructive operations use the shared `confirmDialog` system.

`detailTabs` and `memberActions` are typed extension seams for application-owned
identity panels and actions. Drizzle hooks run referential guards and projection
reconciliation inside the IAM transaction. Adapter capabilities are both
exposed to the UI and re-checked at mutation time; hiding a button is never the
security boundary.

```tsx
import { RolesAdmin } from '@appkit/iam/react'
import { createDrizzleIamService } from '@appkit/iam/drizzle'

const iam = createDrizzleIamService({
  db: requestContext.db,
  tenantId: requestContext.tenantId,
  actor: { userId: requestContext.user.id, isSuperAdmin: requestContext.isSuperAdmin },
  currentMembershipId: requestContext.membership.id,
  permissionCatalogue: permissionGroups.flatMap(group => group.permissions.map(permission => permission.key)),
  afterInvitePersisted: deliverIdentityInvitation,
  hooks: {
    afterMembershipAccessChanged: reconcileAccessProjections,
  },
})

<RolesAdmin service={iam} permissionGroups={permissionGroups} />
```

Role and member mutations enforce built-in, current-user, and super-admin
protections in the adapter as well as the UI. Re-selecting an existing
member/role pair updates its scope instead of widening access with a duplicate
assignment. `@appkit/iam/drizzle` accepts both Drizzle `node-postgres` and
`postgres-js` databases without an application cast.
