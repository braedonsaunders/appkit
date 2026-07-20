import { connectDb, type DbConn, type DbKind } from '@appkit/sync/db-drivers'
import { resolveValue } from './resolve'
import { SQL_DESTINATION_SUMMARY } from './sql-catalog'
import type {
  DeliverContext,
  DeliverRef,
  DeliverResult,
  DestinationDef,
  Scalar,
} from './types'

const kinds: DbKind[] = ['postgres', 'mysql', 'mariadb', 'mssql']
function quote(kind: DbKind, identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier))
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  return kind === 'mssql'
    ? `[${identifier}]`
    : kind === 'mysql' || kind === 'mariadb'
      ? `\`${identifier}\``
      : `"${identifier}"`
}
function literal(kind: DbKind, value: Scalar): string {
  if (value == null) return 'NULL'
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean')
    return kind === 'postgres' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0'
  const escaped = value.replace(/'/g, "''")
  return kind === 'mssql' ? `N'${escaped}'` : `'${escaped}'`
}
function first(rows: Record<string, unknown>[]): string | null {
  const value = rows[0] ? Object.values(rows[0])[0] : null
  return value == null ? null : String(value)
}
async function insert(
  connection: DbConn,
  kind: DbKind,
  table: string,
  columns: string[],
  values: Scalar[],
  identity: string,
): Promise<string | null> {
  const tableName = quote(kind, table)
  const columnNames = columns.map((column) => quote(kind, column)).join(',')
  const sqlValues = values.map((value) => literal(kind, value)).join(',')
  const id = quote(kind, identity)
  if (kind === 'mssql')
    return first(
      await connection.query(
        `INSERT INTO ${tableName} (${columnNames}) OUTPUT INSERTED.${id} VALUES (${sqlValues})`,
      ),
    )
  if (kind === 'postgres')
    return first(
      await connection.query(
        `INSERT INTO ${tableName} (${columnNames}) VALUES (${sqlValues}) RETURNING ${id}`,
      ),
    )
  await connection.query(
    `INSERT INTO ${tableName} (${columnNames}) VALUES (${sqlValues})`,
  )
  return first(await connection.query('SELECT LAST_INSERT_ID() AS ref'))
}

export const sqlDestination: DestinationDef = {
  ...SQL_DESTINATION_SUMMARY,
  configFields: [
    {
      key: 'dbKind',
      label: 'Database type',
      type: 'select',
      required: true,
      options: kinds.map((value) => ({ value, label: value })),
    },
    { key: 'host', label: 'Host', type: 'text', required: true },
    { key: 'port', label: 'Port', type: 'number' },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'username', label: 'Username', type: 'text', required: true },
    {
      key: 'ssl',
      label: 'Encrypt connection',
      type: 'boolean',
      required: true,
    },
  ],
  secretFields: [{ key: 'password', label: 'Password', required: true }],
  async test(context) {
    let connection: DbConn | null = null
    try {
      const kind = kinds.includes(context.config.dbKind as DbKind)
        ? (context.config.dbKind as DbKind)
        : 'postgres'
      connection = await connectDb({
        dbKind: kind,
        host: String(context.config.host ?? ''),
        port: context.config.port ? Number(context.config.port) : undefined,
        database: String(context.config.database ?? ''),
        username: String(context.config.username ?? ''),
        password: context.secrets.password ?? '',
        ssl: context.config.ssl === true,
      })
      await connection.query('SELECT 1 AS ok')
      return { ok: true, summary: 'Database connection verified.' }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      // A failed close can leave a pooled connection or transaction in an
      // unknown state, so surface it to the caller instead of reporting a
      // successful test while silently leaking the resource.
      await connection?.close()
    }
  },
  async deliver(context: DeliverContext): Promise<DeliverResult> {
    const kind = kinds.includes(context.config.dbKind as DbKind)
      ? (context.config.dbKind as DbKind)
      : 'postgres'
    const table = String(context.mapping.table ?? '')
    const identity = String(context.mapping.idColumn ?? '')
    const map = context.mapping.columns
    if (!table) return { ok: false, error: 'No target table configured.' }
    if (!identity)
      return {
        ok: false,
        error:
          'An identity column is required so retries can reverse completed inserts safely.',
      }
    if (
      !map ||
      typeof map !== 'object' ||
      Array.isArray(map) ||
      !Object.keys(map).length
    )
      return { ok: false, error: 'No column mapping configured.' }
    let connection: DbConn | null = null
    const refs: DeliverRef[] = []
    try {
      connection = await connectDb({
        dbKind: kind,
        host: String(context.config.host ?? ''),
        port: context.config.port ? Number(context.config.port) : undefined,
        database: String(context.config.database ?? ''),
        username: String(context.config.username ?? ''),
        password: context.secrets.password ?? '',
        ssl: context.config.ssl === true,
      })
      if (context.priorRefs.length)
        await connection.query(
          `DELETE FROM ${quote(kind, table)} WHERE ${quote(kind, identity)} IN (${context.priorRefs.map((ref) => literal(kind, ref)).join(',')})`,
        )
      const columns = Object.keys(map as Record<string, unknown>)
      for (const item of context.items) {
        const ref = await insert(
          connection,
          kind,
          table,
          columns,
          columns.map((column) =>
            resolveValue((map as Record<string, unknown>)[column], item),
          ),
          identity,
        )
        if (!ref)
          throw new Error(
            `Insert did not return ${identity}; the delivery cannot be retried safely.`,
          )
        refs.push({ externalRef: ref })
      }
      return {
        ok: true,
        summary: `Inserted ${refs.length} row(s) into ${table}.`,
        refs,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        refs,
      }
    } finally {
      // Delivery is not safely complete if its database resource cannot be
      // released. The dispatcher converts this rejection into a failed run.
      await connection?.close()
    }
  },
}
