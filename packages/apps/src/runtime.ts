import { runEndpoint, type EndpointRequest, type HostAdapters } from '@appkit/endpoints'

/**
 * Source-shaped application backend runtime entry. The implementation lives in
 * @appkit/endpoints so standalone programmable endpoints and installed apps use
 * one governed QuickJS kernel.
 */
export { runEndpoint as runAppEndpoint, DEFAULT_COSTS as APP_ENDPOINT_DEFAULT_COSTS } from '@appkit/endpoints'
export type {
  EndpointRequest as AppRequest,
  EndpointResult as AppEndpointResult,
  StorageAdapter as AppStorageAdapter,
  RecordsAdapter as AppRecordsAdapter,
  HostAdapters as AppHostAdapters,
  HostFunction as AppHostFunction,
} from '@appkit/endpoints'

/**
 * Bind the generalized endpoint kernel to an application's existing authored
 * global and adapter shape. The returned function retains the source-shaped
 * positional options contract used by a direct runtime import.
 */
export function createAppEndpointRuntime<TAdapters>(configuration: {
  globalName: string
  adapters: (adapters: TAdapters) => HostAdapters
}) {
  return (options: {
    source: string
    request: EndpointRequest
    adapters: TAdapters
    timeoutMs?: number
    unitBudget?: number
  }) => runEndpoint({
    ...options,
    adapters: configuration.adapters(options.adapters),
    globalName: configuration.globalName,
  })
}
