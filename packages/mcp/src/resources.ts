import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * A static (or lazily loaded) resource — schemas, playbooks, ground rules.
 * Shipping operating doctrine as readable resources is how an agent learns
 * the app's rules from the surface itself instead of from folklore.
 */
export interface McpStaticResource {
  name: string
  uri: string
  title: string
  description?: string
  mimeType?: string
  text: string | (() => string | Promise<string>)
}

/** Register each resource; `text` may be a thunk resolved per read. */
export function registerStaticResources(
  server: McpServer,
  resources: readonly McpStaticResource[],
): void {
  for (const resource of resources) {
    const mimeType = resource.mimeType ?? 'text/markdown'
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        ...(resource.description ? { description: resource.description } : {}),
        mimeType,
      },
      async () => ({
        contents: [
          {
            uri: resource.uri,
            mimeType,
            text: typeof resource.text === 'function' ? await resource.text() : resource.text,
          },
        ],
      }),
    )
  }
}
