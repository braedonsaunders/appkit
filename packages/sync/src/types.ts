export type SyncEntityKey = string
export type SyncRecord<
  TEntity extends SyncEntityKey = SyncEntityKey,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = { entity: TEntity; externalId: string; data: TData }
export type SyncLogger = (
  level: 'info' | 'warn' | 'error',
  message: string,
  detail?: Record<string, unknown>,
) => void
export type ResolvedSecrets = Record<string, string>

export interface ConnectorRunContext {
  tenantId: string
  connectionId: string
  config: Record<string, unknown>
  secrets: ResolvedSecrets
  cursor?: Record<string, unknown> | null
  log: SyncLogger
  signal?: AbortSignal
}
export interface IntrospectTable {
  name: string
  schema?: string
  rowCount?: number | null
}
export interface IntrospectColumn {
  name: string
  type: string
  nullable?: boolean
}
export interface ConnectorTestResult {
  ok: boolean
  message?: string
}
export interface ConfigField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea' | 'boolean'
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
  required?: boolean
}
export interface SecretField {
  key: string
  label: string
  required?: boolean
  help?: string
}
export interface ConnectorPullResult {
  records: SyncRecord[]
  nextCursor?: Record<string, unknown> | null
  mode?: 'full' | 'incremental'
  authoritativeEntities?: SyncEntityKey[]
}
export interface SyncConnector {
  key: string
  name: string
  description: string
  kind: 'native' | 'provider'
  entities: SyncEntityKey[]
  configFields?: ConfigField[]
  secretFields?: SecretField[]
  test?(context: ConnectorRunContext): Promise<ConnectorTestResult>
  introspect?(
    context: ConnectorRunContext,
  ): Promise<{ tables: IntrospectTable[] }>
  introspectTable?(
    context: ConnectorRunContext,
    table: { name: string; schema?: string },
  ): Promise<{ columns: IntrospectColumn[] }>
  pull(
    context: ConnectorRunContext,
  ): Promise<SyncRecord[] | ConnectorPullResult>
  push?(context: ConnectorRunContext, records: SyncRecord[]): Promise<void>
}
export type ConnectorSummary = Omit<
  SyncConnector,
  'test' | 'introspect' | 'introspectTable' | 'pull' | 'push'
> & {
  configFields: ConfigField[]
  secretFields: SecretField[]
  supportsIntrospection: boolean
  supportsPush: boolean
}
export function toConnectorSummary(connector: SyncConnector): ConnectorSummary {
  return {
    key: connector.key,
    name: connector.name,
    description: connector.description,
    kind: connector.kind,
    entities: connector.entities,
    configFields: connector.configFields ?? [],
    secretFields: connector.secretFields ?? [],
    supportsIntrospection: Boolean(connector.introspect),
    supportsPush: Boolean(connector.push),
  }
}

export function createConnectorRegistry(connectors: readonly SyncConnector[]) {
  const map = new Map<string, SyncConnector>()
  for (const connector of connectors) {
    if (map.has(connector.key))
      throw new Error(`Duplicate sync connector: ${connector.key}`)
    map.set(connector.key, connector)
  }
  return {
    get(key: string) {
      return map.get(key)
    },
    require(key: string) {
      const connector = map.get(key)
      if (!connector) throw new Error(`Unknown sync connector: ${key}`)
      return connector
    },
    list() {
      return [...map.values()]
    },
    summaries() {
      return [...map.values()].map(toConnectorSummary)
    },
  }
}
