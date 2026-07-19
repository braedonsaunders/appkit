import { createApiAuth, type ApiAuth, type ApiAuthConfig } from './auth'
import { errorResponse, noStore } from './errors'

/**
 * The public-API entry point. `createApi(config)` returns `withApiKey`, which
 * authenticates the request, runs your handler with the resolved `{ ctx, key }`,
 * and renders any thrown ApiError as a JSON envelope — attaching the key's
 * rate-limit headers and no-store caching headers to every response.
 *
 *   const { withApiKey } = createApi({ appkit, rateLimit })
 *   export const GET = (req) => withApiKey(req, async (auth) => {
 *     authorize(auth, 'records.read')
 *     const rows = await auth.ctx.db((db) => db.select()...)
 *     return Response.json({ data: rows })
 *   })
 */
export function createApi(config: ApiAuthConfig) {
  const { authenticateApiKey } = createApiAuth(config)

  async function withApiKey(
    req: Request,
    handler: (auth: ApiAuth) => Promise<Response>,
  ): Promise<Response> {
    let auth: ApiAuth
    try {
      auth = await authenticateApiKey(req)
    } catch (error) {
      return errorResponse(error)
    }
    try {
      const res = await handler(auth)
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(auth.key.rateLimitHeaders)) headers.set(k, v)
      for (const [k, v] of Object.entries(noStore())) if (!headers.has(k)) headers.set(k, v)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    } catch (error) {
      console.error('[appkit/api] handler error', error)
      return errorResponse(error)
    }
  }

  return { authenticateApiKey, withApiKey }
}
