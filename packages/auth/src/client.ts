import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

export type AppkitAuthClientOptions = {
  baseURL?: string
  basePath?: string
  fetchOptions?: Parameters<typeof createAuthClient>[0] extends infer Options
    ? Options extends { fetchOptions?: infer FetchOptions }
      ? FetchOptions
      : never
    : never
}

/** React client with password, session, reset, and magic-link APIs. */
export function createAppkitAuthClient(options: AppkitAuthClientOptions = {}) {
  return createAuthClient({
    ...options,
    plugins: [magicLinkClient()],
  })
}

export type AppkitAuthClient = ReturnType<typeof createAppkitAuthClient>
