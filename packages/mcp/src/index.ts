export {
  jsonRpcErrorResponse,
  mcpBoundaryResponse,
  mcpMethodNotAllowed,
  mcpPreflightResponse,
  validateMcpBoundary,
  type McpBoundaryOptions,
  type McpBoundaryViolation,
} from './boundary.js'

export {
  registerToolCatalog,
  type McpCatalogTool,
  type McpToolAuditEvent,
  type RegisterToolCatalogOptions,
} from './catalog.js'

export {
  handleStreamableHttpRequest,
  resolveMcpRequestId,
  type HandleStreamableHttpOptions,
} from './handler.js'

export {
  registerStaticResources,
  type McpStaticResource,
} from './resources.js'

export {
  mcpFailure,
  mcpSuccess,
  toolTitle,
  type McpErrorMapper,
  type McpErrorShape,
} from './result.js'
