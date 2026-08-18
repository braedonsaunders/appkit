export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  durationMs: number
}

export interface QuerySchemaColumn {
  name: string
  type: string
  nullable: boolean
}

export interface QuerySchemaTable {
  name: string
  kind: 'table' | 'view'
  columns: QuerySchemaColumn[]
}

export interface ExecuteQueryRequest {
  sql: string
  maxRows: number
  signal?: AbortSignal
}

/**
 * Authorization and tenant scope belong inside this adapter. A React caller
 * cannot make a raw-SQL surface safe by hiding controls or filtering results.
 */
export interface QueryConsoleAdapter {
  execute(request: ExecuteQueryRequest): Promise<QueryResult>
  listSchema(signal?: AbortSignal): Promise<QuerySchemaTable[]>
}

export interface QuerySnippet {
  key: string
  label: string
  description: string
  sql: string
}

export interface QueryHistoryItem {
  sql: string
  at: number
  durationMs: number
  rowCount: number
  ok: boolean
}

export interface SavedQuerySnippet {
  id: string
  name: string
  sql: string
  at: number
}

export interface QueryConsoleStoredState {
  draft?: string
  history: QueryHistoryItem[]
  snippets: SavedQuerySnippet[]
}

export interface QueryConsoleStorage {
  load(): QueryConsoleStoredState | Promise<QueryConsoleStoredState>
  saveDraft(sql: string): void | Promise<void>
  saveHistory(history: QueryHistoryItem[]): void | Promise<void>
  saveSnippets(snippets: SavedQuerySnippet[]): void | Promise<void>
}

export type QueryConsoleStorageOperation = 'load' | 'draft' | 'history' | 'snippets'

export interface QueryConsoleLabels {
  title: string
  subtitle: string
  readOnlyBadge: string
  run: string
  running: string
  clear: string
  rowLimit: string
  editorPlaceholder: string
  failed: string
  queryError: string
  rowCount(count: number): string
  truncated(max: number): string
  ranSelection: string
  resultsIdle: string
  filterResults: string
  copyCsv: string
  copiedCsv: string
  copyFailed: string
  downloadCsv: string
  runToSeeResults: string
  runHint: string
  emptyResultSet: string
  noFilterMatch: string
  openRail: string
  closeRail: string
  queryTools: string
  resizeEditor: string
  rail: {
    schema: string
    snippets: string
    history: string
  }
  schema: {
    loading: string
    searchPlaceholder: string
    noMatch: string
    insertTable: string
    insertColumn: string
    showSchema: string
    browseRows: string
    insertTableName: string
    insertSelectTemplate: string
  }
  history: {
    count(count: number): string
    clear: string
    rows(count: number): string
    failed: string
    empty: string
  }
  snippetSaved(name: string): string
  snippets: {
    save: string
    namePlaceholder: string
    savedHeading: string
    examplesHeading: string
    delete: string
  }
}

export type QueryConsoleLabelOverrides = Omit<Partial<QueryConsoleLabels>, 'rail' | 'schema' | 'history' | 'snippets'> & {
  rail?: Partial<QueryConsoleLabels['rail']>
  schema?: Partial<QueryConsoleLabels['schema']>
  history?: Partial<QueryConsoleLabels['history']>
  snippets?: Partial<QueryConsoleLabels['snippets']>
}
