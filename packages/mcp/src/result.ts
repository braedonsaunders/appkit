import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * The one error shape a tool result may carry. Apps map their own error
 * classes onto it; anything the mapper declines becomes the generic
 * `internal_error`, so raw error text (stack frames, SQL, secrets) can never
 * reach the model by accident.
 */
export interface McpErrorShape {
  code: string
  message: string
  details?: unknown
}

/** Maps a thrown value onto {@link McpErrorShape}, or returns null to decline. */
export type McpErrorMapper = (error: unknown) => McpErrorShape | null

const GENERIC_FAILURE: McpErrorShape = {
  code: 'internal_error',
  message: 'The operation failed.',
}

/** "list_open_items" → "List Open Items" — the default tool title. */
export function toolTitle(name: string): string {
  return name
    .split('_')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
}

/**
 * A successful tool result: the structured payload plus a text rendering.
 * Pass a summary when one line serves the model better than the full JSON.
 */
export function mcpSuccess(
  structuredContent: Record<string, unknown>,
  summary?: string,
): CallToolResult {
  return {
    structuredContent,
    content: [
      {
        type: 'text',
        text: summary ?? JSON.stringify(structuredContent, null, 2),
      },
    ],
  }
}

/**
 * A failed tool result. The mapper decides which errors are safe to surface;
 * everything else collapses to a generic failure with no leaked detail.
 */
export function mcpFailure(error: unknown, mapError?: McpErrorMapper): CallToolResult {
  const shape = mapError?.(error) ?? GENERIC_FAILURE
  return {
    isError: true,
    structuredContent: {
      ok: false,
      error: {
        code: shape.code,
        message: shape.message,
        ...(shape.details !== undefined ? { details: shape.details } : {}),
      },
    },
    content: [{ type: 'text', text: `${shape.code}: ${shape.message}` }],
  }
}
