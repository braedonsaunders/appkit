// Self-documenting routes. Describe a route once with `describeRoute` and you get
// both an interactive reference (via @appkit/ui's <ApiReference>) and an OpenAPI
// document (`toOpenApi`) — docs and enforcement move together.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiParam = {
  name: string
  in?: 'query' | 'path' | 'header'
  type?: string
  required?: boolean
  description?: string
}

export type ApiRouteDoc = {
  method: HttpMethod
  path: string
  summary?: string
  description?: string
  /** Resource group the endpoint belongs to (used to section the reference). */
  tag?: string
  /** Permission the API key must hold. */
  permission?: string
  params?: ApiParam[]
  requestExample?: unknown
  responseExample?: unknown
}

/** Identity helper — carries the type so route lists stay well-typed. */
export function describeRoute(doc: ApiRouteDoc): ApiRouteDoc {
  return doc
}

/** Emit a minimal OpenAPI 3.1 document from a route list (no dependency). */
export function toOpenApi(
  routes: ApiRouteDoc[],
  info: { title: string; version: string; description?: string },
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const entry = (paths[r.path] ??= {})
    entry[r.method.toLowerCase()] = {
      summary: r.summary,
      description: r.description,
      ...(r.tag ? { tags: [r.tag] } : {}),
      ...(r.permission ? { security: [{ apiKey: [] }] } : {}),
      ...(r.params?.length
        ? {
            parameters: r.params.map((p) => ({
              name: p.name,
              in: p.in ?? 'query',
              required: p.required ?? false,
              description: p.description,
              schema: { type: p.type ?? 'string' },
            })),
          }
        : {}),
      ...(r.requestExample !== undefined
        ? { requestBody: { content: { 'application/json': { example: r.requestExample } } } }
        : {}),
      responses: {
        '200': {
          description: 'Success',
          ...(r.responseExample !== undefined
            ? { content: { 'application/json': { example: r.responseExample } } }
            : {}),
        },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info,
    components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer' } } },
    paths,
  }
}
