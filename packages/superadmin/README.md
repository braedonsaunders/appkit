# @appkit/superadmin

Installation-wide identity administration for platform operators. This package
is separate from tenant IAM: it manages the accounts that can sign in to the
installation, their active state, super-admin standing, password credentials,
and live sessions.

The root exports the guarded service contract. Optional subpaths provide memory
and Drizzle persistence plus the production React user/session surfaces.

```ts
import { createSuperadminService } from '@appkit/superadmin'
import { createMemorySuperadminPersistence } from '@appkit/superadmin/memory'

const persistence = createMemorySuperadminPersistence()
const service = createSuperadminService({
  persistence,
  hashPassword: async (password) => applicationPasswordHasher(password),
  actor: { userId: operatorId, sessionId: currentSessionId },
})
```

Applications own authentication middleware, operator authorization, password
hashing, routing, and revalidation. The package owns validation, last-active-
super-admin protection, current-session reporting, list mechanics, persistence
ports, and the reusable operator UI.
