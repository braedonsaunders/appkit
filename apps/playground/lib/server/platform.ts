import 'server-only'
import { createDb, type AppkitDb, schema } from '@appkit/db'

// One platform instance per process. Next dev hot-reloads module graphs, so the
// singletons live on globalThis to avoid a new pg pool per reload.

type Platform = {
  appkit: AppkitDb<typeof schema>
}

type Runtime = typeof globalThis & { __appkitPlatform?: Platform }
const runtime = globalThis as Runtime

export function isDatabaseConfigured(): boolean {
  const hasTenantUrl = Boolean(process.env.APPKIT_DB_URL)
  const hasSuperUrl = Boolean(process.env.APPKIT_SUPER_URL)
  if (hasTenantUrl !== hasSuperUrl) {
    throw new Error('Configure both APPKIT_DB_URL and APPKIT_SUPER_URL, or omit both for the database-free demo.')
  }
  return hasTenantUrl
}

function build(): Platform {
  const url = process.env.APPKIT_DB_URL
  const superUrl = process.env.APPKIT_SUPER_URL
  if (!url || !superUrl) {
    throw new Error('APPKIT_DB_URL and APPKIT_SUPER_URL must be set (.env.local)')
  }
  const appkit = createDb({ url, superUrl, schema })
  return { appkit }
}

export function platform(): Platform {
  return (runtime.__appkitPlatform ??= build())
}
