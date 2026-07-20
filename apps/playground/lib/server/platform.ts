import 'server-only'
import { createDb, type AppkitDb, schema } from '@appkit/db'
import { createAuth, type Auth } from '@appkit/auth'
import { createApi } from '@appkit/api'
import { PERMISSION_CATALOGUE } from '../permissions'

// One platform instance per process. Next dev hot-reloads module graphs, so the
// singletons live on globalThis to avoid a new pg pool per reload.

type Platform = {
  appkit: AppkitDb<typeof schema>
  auth: Auth
  api: ReturnType<typeof createApi>
}

type Runtime = typeof globalThis & { __appkitPlatform?: Platform }
const runtime = globalThis as Runtime

function build(): Platform {
  const url = process.env.APPKIT_DB_URL
  const superUrl = process.env.APPKIT_SUPER_URL
  const sessionSecret = process.env.APPKIT_SESSION_SECRET
  if (!url || !superUrl || !sessionSecret) {
    throw new Error('APPKIT_DB_URL, APPKIT_SUPER_URL and APPKIT_SESSION_SECRET must be set (.env.local)')
  }
  const appkit = createDb({ url, superUrl, schema })
  const auth = createAuth({ sessionSecret })
  const api = createApi({ appkit: appkit as never, permissionCatalogue: PERMISSION_CATALOGUE })
  return { appkit, auth, api }
}

export function platform(): Platform {
  return (runtime.__appkitPlatform ??= build())
}
