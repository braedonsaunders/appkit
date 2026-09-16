import type { RecordsAdapter, StorageAdapter } from '@braedonsaunders/appkit-endpoints'
import { AppError } from './index'

/**
 * Datasets — the data plane for an application's own working data.
 *
 * A sandboxed app frontend can reach exactly three things: the host's records
 * adapter, its authored backend, and whatever literal it was shipped with. That
 * leaves the data its *author* produced — a CSV a script wrote, rows a job
 * computed — with nowhere to live, so authors paste snapshots into source and
 * hand-maintain them. A dataset is the missing place: named, typed rows the
 * author publishes and the frontend reads through the records adapter it
 * already uses, with no new bridge method and no new sandbox surface.
 *
 * Datasets live in the app's existing storage namespace, so they inherit the
 * host's tenancy and audit behaviour for free. A dataset may also carry a
 * producer — the command that regenerates it — so the host can refresh it
 * without asking its author to do it by hand.
 */

export const DATASET_NAMESPACE = 'dataset'
/** Records type key listing every dataset's metadata (never its rows). */
export const DATASET_INDEX_TYPE = 'datasets'
/** Records type key prefix for one dataset's rows: `dataset.trades`. */
export const DATASET_TYPE_PREFIX = 'dataset.'
export const DATASET_MAX_ROWS = 5_000
export const DATASET_MAX_BYTES = 1_000_000
export const DATASET_MAX_COLUMNS = 64
/** How long a claimed refresh is assumed to still be running. */
export const DATASET_REFRESH_LEASE_MS = 120_000

const DATASET_NAME = /^[a-z][a-z0-9_-]{0,47}$/
const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_ .-]{0,63}$/

export type DatasetFormat = 'csv' | 'tsv' | 'json' | 'ndjson'
export type DatasetColumnType = 'string' | 'number' | 'boolean'
export type DatasetWriteMode = 'replace' | 'append'

export interface DatasetColumn {
  name: string
  type: DatasetColumnType
}

export type DatasetRow = Record<string, string | number | boolean | null>

/**
 * How a dataset regenerates itself. The command runs on whatever machine the
 * host gives the app's author; the host reads `path` afterwards and republishes.
 * Never interpreted here — this module only stores and schedules it.
 */
export interface DatasetProducer {
  /** Shell command that rewrites `path`. */
  command: string
  /** Working directory for the command, host-interpreted. */
  cwd: string | null
  /** File the command writes, read back by the host after it exits. */
  path: string
  format: DatasetFormat
  /** Refresh when the rows are older than this. Zero disables automatic refresh. */
  staleAfterMinutes: number
  enabled: boolean
}

export interface DatasetSummary {
  name: string
  label: string | null
  columns: DatasetColumn[]
  rowCount: number
  /** Where the rows came from, for display: a file path, a URL, or null. */
  source: string | null
  producer: DatasetProducer | null
  revision: number
  publishedAt: string
  publishedBy: string | null
  lastRefreshAt: string | null
  lastError: string | null
  bytes: number
}

export interface Dataset extends DatasetSummary {
  rows: DatasetRow[]
}

interface StoredDataset extends Dataset {
  /** Set while a refresh is believed to be running; a stale lease is ignored. */
  refreshStartedAt: string | null
}

export interface PutDatasetInput {
  name: string
  label?: string | null
  /** Rows to store, already parsed. Use `parseDatasetContent` for raw text. */
  rows: DatasetRow[]
  columns?: DatasetColumn[]
  mode?: DatasetWriteMode
  /** For append mode: the columns whose combined value identifies a row. */
  keyColumns?: string[]
  source?: string | null
  publishedBy?: string | null
  producer?: DatasetProducer | null
}

function assertName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (!DATASET_NAME.test(normalized)) {
    throw new AppError(`"${name}" is not a valid dataset name — use lowercase letters, numbers, hyphens or underscores (max 48).`, 400)
  }
  return normalized
}

export function isDatasetType(typeKey: string): boolean {
  return typeKey === DATASET_INDEX_TYPE || typeKey.startsWith(DATASET_TYPE_PREFIX)
}

/** The dataset a records type key addresses, or null when it addresses the index. */
export function datasetNameFromType(typeKey: string): string | null {
  if (!typeKey.startsWith(DATASET_TYPE_PREFIX)) return null
  return assertName(typeKey.slice(DATASET_TYPE_PREFIX.length))
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Split delimited text into fields, honouring RFC 4180 quoting. */
function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0
  let touched = false
  while (index < text.length) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
      touched = true
      index += 1
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      touched = true
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      if (touched || row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      field = ''
      touched = false
      index += 1
      continue
    }
    field += char
    touched = true
    index += 1
  }
  row.push(field)
  if (touched || row.length > 1) rows.push(row)
  return rows
}

function coerceScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    // Only treat text as a number when the round trip is exact, so ids like
    // "0123" and "1e5"-shaped product codes survive as the strings they are.
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed) && String(parsed) === trimmed) return parsed
    }
    return value
  }
  return String(value)
}

function columnTypeOf(values: (string | number | boolean | null)[]): DatasetColumnType {
  let sawNumber = false
  let sawBoolean = false
  for (const value of values) {
    if (value === null) continue
    if (typeof value === 'number') sawNumber = true
    else if (typeof value === 'boolean') sawBoolean = true
    else return 'string'
  }
  if (sawNumber && !sawBoolean) return 'number'
  if (sawBoolean && !sawNumber) return 'boolean'
  if (sawNumber || sawBoolean) return 'string'
  return 'string'
}

/** Derive the column list from rows, preserving first-seen order. */
export function inferDatasetColumns(rows: DatasetRow[]): DatasetColumn[] {
  const names: string[] = []
  for (const row of rows) {
    for (const name of Object.keys(row)) if (!names.includes(name)) names.push(name)
  }
  if (names.length > DATASET_MAX_COLUMNS) {
    throw new AppError(`A dataset may have at most ${DATASET_MAX_COLUMNS} columns; this one has ${names.length}.`, 400)
  }
  return names.map((name) => ({ name, type: columnTypeOf(rows.map((row) => row[name] ?? null)) }))
}

/**
 * Turn raw published text into rows. Delimited formats take their column names
 * from the header line; JSON accepts an array of objects or `{ rows: [...] }`.
 */
export function parseDatasetContent(text: string, format: DatasetFormat): DatasetRow[] {
  if (format === 'json' || format === 'ndjson') {
    const values: unknown[] = []
    if (format === 'ndjson') {
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        values.push(parseJson(trimmed))
      }
    } else {
      const parsed = parseJson(text.trim() || '[]')
      const candidate = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
          ? (parsed as { rows: unknown[] }).rows
          : null
      if (!candidate) throw new AppError('JSON data must be an array of objects, or an object with a "rows" array.', 400)
      values.push(...candidate)
    }
    return values.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AppError(`Row ${index + 1} is not an object — every row needs named columns.`, 400)
      }
      const row: DatasetRow = {}
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const name = key.trim()
        if (!COLUMN_NAME.test(name)) throw new AppError(`"${key}" is not a usable column name.`, 400)
        row[name] = coerceScalar(raw)
      }
      return row
    })
  }
  const grid = splitDelimited(text, format === 'tsv' ? '\t' : ',')
  const header = grid.shift()
  if (!header || header.every((cell) => cell.trim() === '')) return []
  const names = header.map((cell, index) => {
    const name = cell.trim() || `column_${index + 1}`
    if (!COLUMN_NAME.test(name)) throw new AppError(`"${cell}" is not a usable column name.`, 400)
    return name
  })
  if (new Set(names).size !== names.length) throw new AppError('The header repeats a column name.', 400)
  return grid.map((cells) => {
    const row: DatasetRow = {}
    names.forEach((name, index) => {
      row[name] = coerceScalar(cells[index] ?? null)
    })
    return row
  })
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new AppError(`That is not valid JSON: ${(error as Error).message}`, 400)
  }
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

function toStored(value: unknown): StoredDataset | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredDataset>
  if (typeof candidate.name !== 'string' || !Array.isArray(candidate.rows)) return null
  return {
    name: candidate.name,
    label: candidate.label ?? null,
    columns: Array.isArray(candidate.columns) ? candidate.columns : [],
    rows: candidate.rows as DatasetRow[],
    rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : candidate.rows.length,
    source: candidate.source ?? null,
    producer: candidate.producer ?? null,
    revision: typeof candidate.revision === 'number' ? candidate.revision : 1,
    publishedAt: candidate.publishedAt ?? new Date(0).toISOString(),
    publishedBy: candidate.publishedBy ?? null,
    lastRefreshAt: candidate.lastRefreshAt ?? null,
    lastError: candidate.lastError ?? null,
    bytes: typeof candidate.bytes === 'number' ? candidate.bytes : 0,
    refreshStartedAt: candidate.refreshStartedAt ?? null,
  }
}

function summarize(dataset: StoredDataset): DatasetSummary {
  const { rows: _rows, refreshStartedAt: _refreshStartedAt, ...summary } = dataset
  return summary
}

export async function readDataset(storage: StorageAdapter, name: string): Promise<Dataset | null> {
  const stored = toStored(await storage.get(assertName(name), DATASET_NAMESPACE))
  if (!stored) return null
  const { refreshStartedAt: _refreshStartedAt, ...dataset } = stored
  return dataset
}

export async function listDatasets(storage: StorageAdapter): Promise<DatasetSummary[]> {
  const entries = await storage.list('', DATASET_NAMESPACE)
  return entries
    .map((entry) => toStored(entry.value))
    .filter((dataset): dataset is StoredDataset => dataset !== null)
    .map(summarize)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function deleteDataset(storage: StorageAdapter, name: string): Promise<void> {
  await storage.delete(assertName(name), DATASET_NAMESPACE)
}

function rowIdentity(row: DatasetRow, keyColumns: string[]): string {
  return keyColumns.map((column) => String(row[column] ?? '')).join(' ')
}

/**
 * Publish rows. `replace` makes the incoming rows the whole dataset — right for
 * a file that is itself the source of truth. `append` merges onto what is
 * already stored, replacing rows whose `keyColumns` match so a re-publish of
 * overlapping data corrects rather than duplicates.
 */
export async function putDataset(storage: StorageAdapter, input: PutDatasetInput): Promise<DatasetSummary> {
  const name = assertName(input.name)
  const mode: DatasetWriteMode = input.mode ?? 'replace'
  const existing = toStored(await storage.get(name, DATASET_NAMESPACE))
  const incoming = input.rows
  let rows: DatasetRow[]
  if (mode === 'append' && existing) {
    const keyColumns = input.keyColumns ?? []
    if (keyColumns.length) {
      const incomingKeys = new Set(incoming.map((row) => rowIdentity(row, keyColumns)))
      rows = [...existing.rows.filter((row) => !incomingKeys.has(rowIdentity(row, keyColumns))), ...incoming]
    } else {
      rows = [...existing.rows, ...incoming]
    }
  } else {
    rows = incoming
  }
  if (rows.length > DATASET_MAX_ROWS) {
    throw new AppError(`A dataset holds at most ${DATASET_MAX_ROWS} rows; this one would hold ${rows.length}. Narrow it, or summarize before publishing.`, 400)
  }
  const columns = input.columns ?? inferDatasetColumns(rows)
  const now = new Date().toISOString()
  const dataset: StoredDataset = {
    name,
    label: input.label ?? existing?.label ?? null,
    columns,
    rows,
    rowCount: rows.length,
    source: input.source ?? existing?.source ?? null,
    producer: input.producer === undefined ? (existing?.producer ?? null) : input.producer,
    revision: (existing?.revision ?? 0) + 1,
    publishedAt: now,
    publishedBy: input.publishedBy ?? existing?.publishedBy ?? null,
    lastRefreshAt: now,
    lastError: null,
    bytes: 0,
    refreshStartedAt: null,
  }
  dataset.bytes = JSON.stringify(dataset).length
  if (dataset.bytes > DATASET_MAX_BYTES) {
    throw new AppError(`That dataset is ${Math.round(dataset.bytes / 1024)} KB, over the ${Math.round(DATASET_MAX_BYTES / 1024)} KB ceiling. Publish fewer columns or fewer rows.`, 400)
  }
  await storage.set(name, dataset, DATASET_NAMESPACE)
  return summarize(dataset)
}

/** Attach, change, or clear a dataset's producer without touching its rows. */
export async function setDatasetProducer(storage: StorageAdapter, name: string, producer: DatasetProducer | null): Promise<DatasetSummary> {
  const key = assertName(name)
  const existing = toStored(await storage.get(key, DATASET_NAMESPACE))
  if (!existing) throw new AppError(`There is no dataset named "${key}".`, 404)
  const updated: StoredDataset = { ...existing, producer }
  updated.bytes = JSON.stringify(updated).length
  await storage.set(key, updated, DATASET_NAMESPACE)
  return summarize(updated)
}

/** Record that a refresh failed, leaving the last good rows in place. */
export async function recordDatasetError(storage: StorageAdapter, name: string, message: string): Promise<void> {
  const key = assertName(name)
  const existing = toStored(await storage.get(key, DATASET_NAMESPACE))
  if (!existing) return
  const updated: StoredDataset = { ...existing, lastError: message.slice(0, 500), refreshStartedAt: null }
  updated.bytes = JSON.stringify(updated).length
  await storage.set(key, updated, DATASET_NAMESPACE)
}

/** True when a producer is due to run again. */
export function datasetIsStale(dataset: DatasetSummary, now: Date = new Date()): boolean {
  const producer = dataset.producer
  if (!producer || !producer.enabled || producer.staleAfterMinutes <= 0) return false
  if (!dataset.lastRefreshAt) return true
  return now.getTime() - Date.parse(dataset.lastRefreshAt) >= producer.staleAfterMinutes * 60_000
}

/**
 * Take the right to refresh a dataset, so concurrent readers do not all run the
 * producer at once. Best effort by design: the store is not transactional here,
 * and a duplicated `replace` refresh is idempotent, so a lost race costs one
 * redundant command rather than a corrupt dataset.
 */
export async function claimDatasetRefresh(storage: StorageAdapter, name: string, now: Date = new Date()): Promise<boolean> {
  const key = assertName(name)
  const existing = toStored(await storage.get(key, DATASET_NAMESPACE))
  if (!existing) return false
  if (existing.refreshStartedAt && now.getTime() - Date.parse(existing.refreshStartedAt) < DATASET_REFRESH_LEASE_MS) return false
  const updated: StoredDataset = { ...existing, refreshStartedAt: now.toISOString() }
  await storage.set(key, updated, DATASET_NAMESPACE)
  return true
}

// ---------------------------------------------------------------------------
// The records adapter
// ---------------------------------------------------------------------------

function applyFilters(rows: DatasetRow[], filters: Record<string, unknown>): DatasetRow[] {
  const limitValue = Number(filters.limit ?? 0)
  const offsetValue = Number(filters.offset ?? 0)
  const offset = Number.isFinite(offsetValue) && offsetValue > 0 ? Math.floor(offsetValue) : 0
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), DATASET_MAX_ROWS) : DATASET_MAX_ROWS
  const equality = Object.entries(filters).filter(([key]) => key !== 'limit' && key !== 'offset')
  const matched = equality.length
    ? rows.filter((row) => equality.every(([key, value]) => String(row[key] ?? '') === String(value ?? '')))
    : rows
  return matched.slice(offset, offset + limit)
}

/**
 * Serve `datasets` and `dataset.<name>` from an app's storage. Compose this
 * behind a host's own records adapter so an app keeps one `records.list` API
 * for host records and its author's data alike.
 */
export function datasetRecords(storage: StorageAdapter): RecordsAdapter {
  return {
    async list(typeKey: string, filters: Record<string, unknown>): Promise<unknown[]> {
      if (typeKey === DATASET_INDEX_TYPE) return listDatasets(storage)
      const name = datasetNameFromType(typeKey)
      if (!name) throw new AppError(`Unknown records collection: ${typeKey}.`, 400)
      const dataset = await readDataset(storage, name)
      if (!dataset) throw new AppError(`There is no dataset named "${name}" yet.`, 404)
      return applyFilters(dataset.rows, filters)
    },
    async get(typeKey: string, id: string): Promise<unknown> {
      if (typeKey === DATASET_INDEX_TYPE) {
        const found = (await listDatasets(storage)).find((dataset) => dataset.name === id)
        if (!found) throw new AppError(`There is no dataset named "${id}".`, 404)
        return found
      }
      const name = datasetNameFromType(typeKey)
      if (!name) throw new AppError(`Unknown records collection: ${typeKey}.`, 400)
      const dataset = await readDataset(storage, name)
      if (!dataset) throw new AppError(`There is no dataset named "${name}" yet.`, 404)
      const index = Number(id)
      const row = Number.isFinite(index) ? dataset.rows[index] : undefined
      if (!row) throw new AppError(`Row ${id} is not in "${name}".`, 404)
      return row
    },
  }
}
