import type { QueryResult, QuerySchemaTable } from './types'

const FORBIDDEN_PREFIX = /^\s*(insert|update|delete|create|alter|drop|grant|revoke|truncate|copy|vacuum|set|call|do)\b/i
const FORBIDDEN_BODY = /\b(?:pg_catalog\.)?set_config\s*\(/i
const STRING_OR_DOLLAR_QUOTE = /'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|\$(?:[A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$(?:[A-Za-z_][A-Za-z0-9_]*|)\$/g

function stripSqlNoise(input: string): string {
  return input
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(STRING_OR_DOLLAR_QUOTE, ' ')
}

/**
 * Source-compatible, defense-in-depth validation for a read-only SQL surface.
 * This is intentionally not a security boundary: the host must also execute
 * with database-enforced tenant scope, a SELECT-only role, a read-only
 * transaction, a statement timeout, and a result cap.
 */
export function validateReadOnlySql(sqlText: string): string {
  const stripped = stripSqlNoise(sqlText).trim()
  if (!stripped) throw new Error('empty query')
  if (stripped.replace(/;\s*$/, '').includes(';')) throw new Error('one statement per query')
  if (FORBIDDEN_PREFIX.test(stripped)) throw new Error('read-only: queries must be SELECT (or WITH … SELECT)')
  if (FORBIDDEN_BODY.test(stripped)) throw new Error('read-only: set_config() is not allowed in user SQL')
  if (!/^\s*(select|with)\b/i.test(stripped)) throw new Error('queries must start with SELECT or WITH')
  return sqlText.trim().replace(/;\s*$/, '')
}

export function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

export function createSelectTemplate(tableName: string, limit = 100): string {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 100
  return `select *\n  from ${quoteSqlIdentifier(tableName)}\n limit ${boundedLimit}`
}

export function queryCellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function isQueryNumeric(value: unknown): boolean {
  if (typeof value === 'number' || typeof value === 'bigint') return true
  if (typeof value !== 'string') return false
  return value.trim() !== '' && /^-?\d[\d,]*(\.\d+)?$/.test(value.trim())
}

function csvCell(value: unknown): string {
  let text = queryCellText(value)
  if (typeof value === 'string' && /^[=+@-]/.test(text) && !isQueryNumeric(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serialize results to CSV while neutralizing spreadsheet-formula strings. */
export function queryResultToCsv(result: QueryResult): string {
  const header = result.columns.map(csvCell).join(',')
  const body = result.rows
    .map((row) => result.columns.map((column) => csvCell(row[column])).join(','))
    .join('\n')
  return `${header}\n${body}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseQueryResult(value: unknown): QueryResult {
  if (!isRecord(value)) throw new Error('Query service returned an invalid result')
  if (!Array.isArray(value.columns) || !value.columns.every((column) => typeof column === 'string')) {
    throw new Error('Query service returned an invalid result')
  }
  if (!Array.isArray(value.rows) || !value.rows.every(isRecord)) {
    throw new Error('Query service returned an invalid result')
  }
  if (
    typeof value.rowCount !== 'number'
    || !Number.isInteger(value.rowCount)
    || value.rowCount < 0
    || value.rowCount !== value.rows.length
    || typeof value.truncated !== 'boolean'
    || typeof value.durationMs !== 'number'
    || !Number.isFinite(value.durationMs)
    || value.durationMs < 0
  ) {
    throw new Error('Query service returned an invalid result')
  }
  return {
    columns: value.columns,
    rows: value.rows,
    rowCount: value.rowCount,
    truncated: value.truncated,
    durationMs: value.durationMs,
  }
}

export function parseQuerySchema(value: unknown): QuerySchemaTable[] {
  if (!Array.isArray(value)) throw new Error('Query service returned an invalid schema response')
  return value.map((table) => {
    if (
      !isRecord(table)
      || typeof table.name !== 'string'
      || (table.kind !== 'table' && table.kind !== 'view')
      || !Array.isArray(table.columns)
    ) {
      throw new Error('Query service returned an invalid schema response')
    }
    const columns = table.columns.map((column) => {
      if (
        !isRecord(column)
        || typeof column.name !== 'string'
        || typeof column.type !== 'string'
        || typeof column.nullable !== 'boolean'
      ) {
        throw new Error('Query service returned an invalid schema response')
      }
      return { name: column.name, type: column.type, nullable: column.nullable }
    })
    return { name: table.name, kind: table.kind, columns }
  })
}

export async function readQueryResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text.trim()) throw new Error(`Query service returned an empty response (HTTP ${response.status})`)

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`Query service returned an invalid response (HTTP ${response.status})`)
  }

  if (!isRecord(payload)) throw new Error(`Query service returned an invalid response (HTTP ${response.status})`)
  return payload
}

export function queryResponseError(payload: { error?: unknown }, status: number): string {
  return typeof payload.error === 'string' && payload.error.trim()
    ? payload.error
    : `Query request failed (HTTP ${status})`
}
