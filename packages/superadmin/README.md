# @braedonsaunders/appkit-superadmin

Installation-operator console for platform administrators. This package is
separate from tenant IAM: it owns the `/platform` workspace — the sidebar
catalog, overview hub, workspace switcher, identity and tenant administration,
provider settings, delivery logs, and database maintenance — so every app
renders the same operator UI.

The root exports the guarded identity/tenant service and the nav catalog.
Optional subpaths provide memory and Drizzle persistence plus the production
React surfaces.

```ts
import { createPlatformNav, selectPlatformNav } from '@braedonsaunders/appkit-superadmin'
import {
  PlatformHub,
  PlatformMenu,
  PlatformUsersAdmin,
  PlatformTenantsAdmin,
} from '@braedonsaunders/appkit-superadmin/react'

const nav = createPlatformNav({
  modules: ['overview', 'tenants', 'users', 'email', 'emailLog'],
  extras: [{ id: 'access', href: '/platform/access', label: 'Access', description: 'Grants', iconKey: 'key' }],
})

const groups = selectPlatformNav(pathname, tenantGroups, nav.groups)
```

```ts
import { createSuperadminService } from '@braedonsaunders/appkit-superadmin'
import { createMemorySuperadminPersistence } from '@braedonsaunders/appkit-superadmin/memory'

const persistence = createMemorySuperadminPersistence()
const service = createSuperadminService({
  persistence,
  hashPassword: async (password) => applicationPasswordHasher(password),
  actor: { userId: operatorId, sessionId: currentSessionId },
})
```

Applications own authentication middleware, operator authorization, password
hashing, routing, persistence adapters, and revalidation. The package owns the
operator chrome, validation, last-active-super-admin protection, current-session
reporting, list mechanics, and the reusable screens.

Omit a module when the host has no backend for it. Extra nav items stay
application-specific (for example acting-user grants).
