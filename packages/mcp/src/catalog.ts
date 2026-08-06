import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodType } from 'zod'
import { mcpFailure, mcpSuccess, toolTitle, type McpErrorMapper } from './result.js'

/**
 * One entry in an app's tool catalogue. The catalogue is the app's canonical
 * external capability surface — MCP is an adapter over it, never a second
 * place capabilities are defined. `execute` must terminate in the app's own
 * governed services (validation, permissions, idempotency, audit), so the MCP
 * surface can never do something a normal API caller could not.
 */
export interface McpCatalogTool<Context> {
  name: string
  /** Defaults to a title-cased rendering of `name`. */
  title?: string
  description: string
  /** The tool's input contract. `execute` re-validates; never trust transport parsing alone. */
  inputSchema: ZodType
  readOnly: boolean
  destructive?: boolean
  openWorld?: boolean
  /** Visibility gate — a hidden tool is never registered, so the model cannot see it. */
  visible?: (context: Context) => boolean
  execute: (context: Context, input: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** Optional one-line rendering of a successful result for the text channel. */
  summarize?: (result: Record<string, unknown>) => string | undefined
}

export interface McpToolAuditEvent {
  name: string
  durationMs: number
  status: 'ok' | 'error'
  /** Bounded, mapper-approved error text — never the raw thrown value. */
  errorSummary?: string
  /** HTTP-ish status derived from the error, when the app supplied a deriver. */
  statusCode?: number
}

export interface RegisterToolCatalogOptions<Context> {
  context: Context
  /** Called after every execution, success or failure. */
  audit?: (event: McpToolAuditEvent) => void
  /** Maps app error classes to safe result shapes; see {@link McpErrorMapper}. */
  mapError?: McpErrorMapper
  /** Derives an audit status code from a thrown value (default 500). */
  errorStatusCode?: (error: unknown) => number
}

/**
 * Register every visible catalogue tool on a server. Execution is wrapped in
 * the success/failure result contract, timed, and reported to the audit hook.
 * Returns how many tools were registered.
 */
export function registerToolCatalog<Context>(
  server: McpServer,
  tools: readonly McpCatalogTool<Context>[],
  options: RegisterToolCatalogOptions<Context>,
): number {
  let registered = 0
  for (const tool of tools) {
    if (tool.visible && !tool.visible(options.context)) continue
    registered += 1
    server.registerTool(
      tool.name,
      {
        title: tool.title ?? toolTitle(tool.name),
        description: tool.description,
        // The SDK accepts a zod object schema here; its own generic is narrower.
        inputSchema: tool.inputSchema as never,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: tool.destructive ?? false,
          openWorldHint: tool.openWorld ?? false,
        },
      },
      (async (input: unknown) => {
        const startedAt = Date.now()
        try {
          const result = await tool.execute(
            options.context,
            (input ?? {}) as Record<string, unknown>,
          )
          const success = mcpSuccess(result, tool.summarize?.(result))
          options.audit?.({
            name: tool.name,
            durationMs: Date.now() - startedAt,
            status: 'ok',
          })
          return success
        } catch (error) {
          const failure = mcpFailure(error, options.mapError)
          const text = failure.content[0]
          options.audit?.({
            name: tool.name,
            durationMs: Date.now() - startedAt,
            status: 'error',
            errorSummary:
              text && text.type === 'text' ? text.text.slice(0, 500) : 'tool failed',
            statusCode: options.errorStatusCode?.(error) ?? 500,
          })
          return failure
        }
      }) as never,
    )
  }
  return registered
}
