import { parseQueryResult, parseQuerySchema, queryResponseError, readQueryResponse } from './core'
import type { QueryConsoleAdapter } from './types'

export interface HttpQueryConsoleAdapterOptions {
  executeUrl: string
  schemaUrl: string
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}

async function resolveHeaders(
  headers: HttpQueryConsoleAdapterOptions['headers'],
): Promise<HeadersInit | undefined> {
  return typeof headers === 'function' ? headers() : headers
}

export function createHttpQueryConsoleAdapter(options: HttpQueryConsoleAdapterOptions): QueryConsoleAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('Query console HTTP adapter requires fetch')

  return {
    async execute({ sql, maxRows, signal }) {
      const response = await fetchImpl(options.executeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await resolveHeaders(options.headers)) },
        body: JSON.stringify({ sql, maxRows }),
        signal,
      })
      const payload = await readQueryResponse(response)
      if (!response.ok) throw new Error(queryResponseError(payload, response.status))
      return parseQueryResult(payload)
    },
    async listSchema(signal) {
      const response = await fetchImpl(options.schemaUrl, {
        headers: await resolveHeaders(options.headers),
        signal,
      })
      const payload = await readQueryResponse(response)
      if (!response.ok) throw new Error(queryResponseError(payload, response.status))
      return parseQuerySchema(payload.tables)
    },
  }
}
