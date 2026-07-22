export type SyncEntityKey = string
export type SyncConnectionStatus = 'draft' | 'connected' | 'error' | 'disabled'
export type SyncRunTrigger = 'scheduled' | 'manual' | 'preview'
export type SyncRunStatus = 'running' | 'success' | 'partial' | 'error'
export type SyncRecordAction =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped'
  | 'failed'
  | 'archived'
  | 'conflict'
export type SyncRecordDiff = Record<string, { before: unknown; after: unknown }>
export type SyncEntityStat = {
  pulled: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  failed: number
  archived: number
  conflict: number
}
export type SyncRunLogLine = {
  at: string
  level: 'info' | 'warn' | 'error'
  msg: string
}
export interface CanonicalPerson extends Record<string, unknown> {
  fullName?: string | null
  firstName: string
  lastName: string
  employeeNo?: string | null
  externalEmployeeId?: string | null
  email?: string | null
  phone?: string | null
  jobTitle?: string | null
  departmentName?: string | null
  tradeName?: string | null
  hireDate?: string | null
  status?: 'active' | 'inactive' | 'terminated'
  metadata?: Record<string, unknown>
}
export interface CanonicalOrgUnit extends Record<string, unknown> {
  name: string
  code?: string | null
  level?: string | null
  parentCode?: string | null
  lat?: number | null
  lng?: number | null
  geofenceMeters?: number | null
  address?: Record<string, string | undefined> | null
  metadata?: Record<string, unknown>
}
export interface CanonicalEquipment extends Record<string, unknown> {
  name: string
  assetTag: string
  serialNumber?: string | null
  description?: string | null
  typeName?: string | null
  status?: string | null
  metadata?: Record<string, unknown>
}
export interface CanonicalContact extends Record<string, unknown> {
  name: string
  role?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  isPrimary?: boolean
  customerExternalId: string
  metadata?: Record<string, unknown>
}
export type SyncRecord<
  TEntity extends SyncEntityKey = SyncEntityKey,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = { entity: TEntity; externalId: string; data: TData }
export type CanonicalRecord = SyncRecord
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
  /** Source-compatible alias for cursor. */
  since?: Record<string, unknown> | null
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
export interface ConnectStartResult {
  kind: string
  sessionToken?: string
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
  iconKey?: string
  entities: SyncEntityKey[]
  configFields?: ConfigField[]
  secretFields?: SecretField[]
  supportsIntrospection?: boolean
  supportsConnect?: boolean
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
  startConnect?(context: ConnectorRunContext): Promise<ConnectStartResult>
  push?(context: ConnectorRunContext, records: SyncRecord[]): Promise<void>
}
export type Connector = SyncConnector
export type ConnectorSummary = Omit<
  SyncConnector,
  'test' | 'introspect' | 'introspectTable' | 'pull' | 'push'
> & {
  configFields: ConfigField[]
  secretFields: SecretField[]
  supportsIntrospection: boolean
  supportsPush: boolean
  supportsConnect: boolean
}
export function toConnectorSummary(connector: SyncConnector): ConnectorSummary {
  return {
    key: connector.key,
    name: connector.name,
    description: connector.description,
    kind: connector.kind,
    iconKey: connector.iconKey,
    entities: connector.entities,
    configFields: connector.configFields ?? [],
    secretFields: connector.secretFields ?? [],
    supportsIntrospection: connector.supportsIntrospection ?? false,
    supportsPush: Boolean(connector.push),
    supportsConnect: connector.supportsConnect ?? false,
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
