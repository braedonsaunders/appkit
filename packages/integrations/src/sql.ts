// Multi-dialect SQL destination extracted from the production implementation.
// It supports ordinary mapped rows and weekly fan-out, safely reverses prior
// inserts by identity, and returns every external id to the delivery ledger.

import { connectDb, type DbConn, type DbKind } from '@appkit/sync/db-drivers'
import { resolveValue } from './resolve'
import { SQL_DESTINATION_SUMMARY } from './destination-catalog'
import type {
  DeliverContext,
  DeliverRef,
  DeliverResult,
  DestinationDef,
  DestinationTestContext,
  IntegrationResult,
  Item,
  Scalar,
} from './types'

const DB_KINDS: DbKind[] = ['postgres', 'mysql', 'mariadb', 'mssql']

interface ConnectionConfig {
  dbKind: DbKind
  host: string
  port?: number
  database: string
  username: string
  ssl: boolean
}

interface SqlMapping {
  table: string
  idColumn: string
  mode: 'row' | 'weekly'
  columns: Record<string, unknown>
  departmentMap: Map<string, number>
  requireField: string
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function parseConnection(config: Record<string, unknown>): ConnectionConfig {
  const raw = String(config.dbKind ?? '').trim() as DbKind
  return {
    dbKind: DB_KINDS.includes(raw) ? raw : 'postgres',
    host: String(config.host ?? '').trim(),
    port: optionalNumber(config.port),
    database: String(config.database ?? '').trim(),
    username: String(config.username ?? '').trim(),
    ssl: config.ssl === true || config.ssl === 'true',
  }
}

function parseDepartmentMap(raw: unknown): Map<string, number> {
  const map = new Map<string, number>()
  if (typeof raw !== 'string') return map
  for (const line of raw.split(/\r?\n/)) {
    const equals = line.indexOf('=')
    if (equals < 0) continue
    const name = line.slice(0, equals).trim().toLowerCase()
    const id = Number(line.slice(equals + 1).trim())
    if (name && Number.isFinite(id)) map.set(name, id)
  }
  return map
}

function parseColumns(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    } catch {
      // An empty map produces the user-facing validation error below.
    }
  }
  return {}
}

function parseMapping(mapping: Record<string, unknown>): SqlMapping {
  return {
    table: String(mapping.table ?? '').trim(),
    idColumn: String(mapping.idColumn ?? '').trim(),
    mode: mapping.mode === 'weekly' ? 'weekly' : 'row',
    columns: parseColumns(mapping.columns),
    departmentMap: parseDepartmentMap(mapping.departmentMap),
    requireField: String(mapping.requireField ?? '').trim(),
  }
}

function missingConnection(
  connection: ConnectionConfig,
  password: string,
): string | null {
  if (
    !connection.host ||
    !connection.database ||
    !connection.username ||
    !password
  )
    return 'Host, database, username and password are required.'
  return null
}

function atUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface WeekRow {
  dateStart: string
  dateEnd: string
  dayHours: number[]
}

export function buildWeekRows(
  startsAtIso: string,
  hoursPerDay: number,
  lengthDays: number,
): WeekRow[] {
  const start = atUtcMidnight(new Date(startsAtIso))
  if (Number.isNaN(start.getTime())) return []
  const last = addDays(start, Math.max(1, Math.floor(lengthDays)) - 1)
  const rows: WeekRow[] = []
  let weekStart = addDays(start, -start.getUTCDay())
  for (let guard = 0; guard < 60 && weekStart <= last; guard++) {
    const dayHours = [0, 0, 0, 0, 0, 0, 0]
    for (let index = 0; index < 7; index++) {
      const day = addDays(weekStart, index)
      if (day >= start && day <= last) dayHours[index] = hoursPerDay
    }
    if (dayHours.some((hours) => hours > 0))
      rows.push({
        dateStart: ymd(weekStart),
        dateEnd: ymd(addDays(weekStart, 6)),
        dayHours,
      })
    weekStart = addDays(weekStart, 7)
  }
  return rows
}

function quoteIdentifier(dbKind: DbKind, name: string): string {
  if (!name) throw new Error('SQL identifiers cannot be empty.')
  if (dbKind === 'mssql') return `[${name.replace(/]/g, ']]')}]`
  if (dbKind === 'mysql' || dbKind === 'mariadb')
    return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

function literal(dbKind: DbKind, value: Scalar): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean')
    return dbKind === 'postgres'
      ? value
        ? 'TRUE'
        : 'FALSE'
      : value
        ? '1'
        : '0'
  const escaped = value.replace(/'/g, "''")
  return dbKind === 'mssql' ? `N'${escaped}'` : `'${escaped}'`
}

function firstValue(rows: Record<string, unknown>[]): string | null {
  const row = rows[0]
  if (!row) return null
  const value = Object.values(row)[0]
  return value == null ? null : String(value)
}

async function insertRow(
  connection: DbConn,
  dbKind: DbKind,
  quotedTable: string,
  quotedColumns: string,
  valuesSql: string,
  idColumn: string,
): Promise<string | null> {
  const quotedId = quoteIdentifier(dbKind, idColumn)
  if (dbKind === 'mssql')
    return firstValue(
      await connection.query(
        `INSERT INTO ${quotedTable} (${quotedColumns}) OUTPUT INSERTED.${quotedId} VALUES (${valuesSql})`,
      ),
    )
  if (dbKind === 'postgres')
    return firstValue(
      await connection.query(
        `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${valuesSql}) RETURNING ${quotedId}`,
      ),
    )
  await connection.query(
    `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${valuesSql})`,
  )
  return firstValue(await connection.query('SELECT LAST_INSERT_ID() AS ref'))
}

function withDepartment(item: Item, mapping: SqlMapping): Item {
  if (!('departmentName' in item)) return item
  const name = item.departmentName
  const department =
    typeof name === 'string' && name
      ? (mapping.departmentMap.get(name.trim().toLowerCase()) ?? null)
      : null
  return { ...item, department }
}

function weeklySubItems(item: Item): Item[] {
  const startsAt = item.startsAt
  const hoursPerDay = Number(item.hoursPerDay)
  const lengthDays = Number(item.lengthDays)
  if (
    typeof startsAt !== 'string' ||
    !Number.isFinite(hoursPerDay) ||
    !Number.isFinite(lengthDays)
  )
    return [item]
  const weeks = buildWeekRows(startsAt, hoursPerDay, lengthDays)
  if (!weeks.length) return [item]
  return weeks.map((week) => ({
    ...item,
    dateStart: week.dateStart,
    dateEnd: week.dateEnd,
    day1Hours: week.dayHours[0] ?? 0,
    day2Hours: week.dayHours[1] ?? 0,
    day3Hours: week.dayHours[2] ?? 0,
    day4Hours: week.dayHours[3] ?? 0,
    day5Hours: week.dayHours[4] ?? 0,
    day6Hours: week.dayHours[5] ?? 0,
    day7Hours: week.dayHours[6] ?? 0,
    weekHours: week.dayHours.reduce((sum, hours) => sum + hours, 0),
  }))
}

function connect(
  connection: ConnectionConfig,
  password: string,
): Promise<DbConn> {
  return connectDb({ ...connection, password })
}

async function testConnection(
  context: DestinationTestContext,
): Promise<IntegrationResult> {
  const config = parseConnection(context.config)
  const password = context.secrets.password ?? ''
  const missing = missingConnection(config, password)
  if (missing) return { ok: false, error: missing }
  let connection: DbConn | null = null
  try {
    connection = await connect(config, password)
    await connection.query('SELECT 1 AS ok')
    return {
      ok: true,
      summary: `Connected to ${config.database} on ${config.host} (${config.dbKind}).`,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (connection)
      try {
        await connection.close()
      } catch (error) {
        console.warn(
          `[integration:sql] Failed to close test connection: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
  }
}

async function deliver(context: DeliverContext): Promise<DeliverResult> {
  const config = parseConnection(context.config)
  const password = context.secrets.password ?? ''
  const missing = missingConnection(config, password)
  if (missing)
    return { ok: false, error: `Connection is not configured. ${missing}` }
  const mapping = parseMapping(context.mapping)
  if (!mapping.table)
    return { ok: false, error: 'No target table configured.' }
  if (!mapping.idColumn)
    return {
      ok: false,
      error:
        'An identity column is required so retries can reverse completed inserts safely.',
    }
  const columnNames = Object.keys(mapping.columns)
  if (!columnNames.length)
    return { ok: false, error: 'No column mapping configured.' }

  const quotedTable = quoteIdentifier(config.dbKind, mapping.table)
  const quotedColumns = columnNames
    .map((column) => quoteIdentifier(config.dbKind, column))
    .join(',')
  const skipped: string[] = []
  const toPost = context.items.filter((item) => {
    if (mapping.requireField && !item[mapping.requireField]) {
      skipped.push(
        String(item.fullName ?? item.reference ?? item.personId ?? '?'),
      )
      return false
    }
    return true
  })
  for (const label of skipped)
    context.log('warn', `Skipped (${mapping.requireField} empty): ${label}`)

  const refs: DeliverRef[] = []
  let connection: DbConn | null = null
  try {
    connection = await connect(config, password)
    if (context.priorRefs.length) {
      const priorIds = context.priorRefs
        .map((ref) =>
          /^\d+$/.test(ref) ? ref : literal(config.dbKind, ref),
        )
        .join(',')
      await connection.query(
        `DELETE FROM ${quotedTable} WHERE ${quoteIdentifier(config.dbKind, mapping.idColumn)} IN (${priorIds})`,
      )
    }
    for (const baseItem of toPost) {
      const item = withDepartment(baseItem, mapping)
      const rows = mapping.mode === 'weekly' ? weeklySubItems(item) : [item]
      for (const row of rows) {
        const valuesSql = columnNames
          .map((column) =>
            literal(
              config.dbKind,
              resolveValue(mapping.columns[column], row),
            ),
          )
          .join(',')
        const ref = await insertRow(
          connection,
          config.dbKind,
          quotedTable,
          quotedColumns,
          valuesSql,
          mapping.idColumn,
        )
        if (!ref)
          throw new Error(
            `Insert did not return ${mapping.idColumn}; the row cannot be retried safely.`,
          )
        refs.push({ externalRef: ref, detail: { dateStart: row.dateStart ?? null } })
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      refs,
    }
  } finally {
    if (connection)
      try {
        await connection.close()
      } catch (error) {
        context.log(
          'warn',
          `Failed to close database connection: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
  }
  return {
    ok: true,
    summary: `Inserted ${refs.length} row(s) into ${mapping.table}${skipped.length ? ` (${skipped.length} skipped)` : ''}.`,
    refs,
  }
}

export const sqlDestination: DestinationDef = {
  ...SQL_DESTINATION_SUMMARY,
  configFields: [
    {
      key: 'dbKind',
      label: 'Database type',
      type: 'select',
      required: true,
      options: [
        { value: 'postgres', label: 'PostgreSQL' },
        { value: 'mysql', label: 'MySQL' },
        { value: 'mariadb', label: 'MariaDB' },
        { value: 'mssql', label: 'SQL Server' },
      ],
    },
    {
      key: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      placeholder: 'db.example.com',
      help: 'Must be a public DNS name. Local, private, and IP-literal hosts are blocked.',
    },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      placeholder: 'default for the database type',
    },
    {
      key: 'database',
      label: 'Database',
      type: 'text',
      required: true,
      placeholder: 'operations',
    },
    {
      key: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      placeholder: 'service_user',
    },
    {
      key: 'ssl',
      label: 'Encrypt the connection (SSL/TLS)',
      type: 'boolean',
      required: true,
      help: 'Required. The database certificate must be valid for the host name above.',
    },
  ],
  secretFields: [{ key: 'password', label: 'Password', required: true }],
  test: testConnection,
  deliver,
}
