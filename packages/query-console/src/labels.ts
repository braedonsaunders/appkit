import type { QueryConsoleLabelOverrides, QueryConsoleLabels } from './types'

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`
}

export const DEFAULT_QUERY_CONSOLE_LABELS: QueryConsoleLabels = {
  title: 'Query Console',
  subtitle: 'Raw SQL through your application’s governed, read-only query adapter.',
  readOnlyBadge: 'Read-only',
  run: 'Run',
  running: 'Running…',
  clear: 'Clear',
  rowLimit: 'Limit',
  editorPlaceholder: 'select … from …',
  failed: 'Failed',
  queryError: 'Query error',
  rowCount: (count) => plural(count, 'row'),
  truncated: (max) => `Truncated at ${max.toLocaleString()}`,
  ranSelection: 'Ran selection',
  resultsIdle: 'No results yet',
  filterResults: 'Filter rows…',
  copyCsv: 'Copy',
  copiedCsv: 'Copied results as CSV',
  copyFailed: 'Copy failed',
  downloadCsv: 'Download CSV',
  runToSeeResults: 'Run a query to see results',
  runHint: 'Write SQL above, then press Run or Cmd/Ctrl-Enter. Select text to run just that.',
  emptyResultSet: 'Query returned no columns',
  noFilterMatch: 'No rows match your filter',
  openRail: 'Open schema, snippets, and history',
  closeRail: 'Close query tools',
  queryTools: 'Query tools',
  resizeEditor: 'Resize SQL editor',
  rail: {
    schema: 'Schema',
    snippets: 'Snippets',
    history: 'History',
  },
  schema: {
    loading: 'Loading schema',
    searchPlaceholder: 'Search tables and columns…',
    noMatch: 'No matching tables',
    insertTable: 'Click to insert table name',
    insertColumn: 'Click to insert column name',
    showSchema: 'Show schema',
    browseRows: 'Browse rows',
    insertTableName: 'Insert table name',
    insertSelectTemplate: 'Insert SELECT template',
  },
  history: {
    count: (count) => plural(count, 'query', 'queries'),
    clear: 'Clear',
    rows: (count) => plural(count, 'row'),
    failed: 'Failed',
    empty: 'Queries you run appear here',
  },
  snippetSaved: (name) => `Saved “${name}”`,
  snippets: {
    save: 'Save',
    namePlaceholder: 'Name this query…',
    savedHeading: 'Saved',
    examplesHeading: 'Examples',
    delete: 'Delete snippet',
  },
}

export function mergeQueryConsoleLabels(
  labels: QueryConsoleLabelOverrides | undefined,
): QueryConsoleLabels {
  return {
    ...DEFAULT_QUERY_CONSOLE_LABELS,
    ...labels,
    rail: { ...DEFAULT_QUERY_CONSOLE_LABELS.rail, ...labels?.rail },
    schema: { ...DEFAULT_QUERY_CONSOLE_LABELS.schema, ...labels?.schema },
    history: { ...DEFAULT_QUERY_CONSOLE_LABELS.history, ...labels?.history },
    snippets: { ...DEFAULT_QUERY_CONSOLE_LABELS.snippets, ...labels?.snippets },
  }
}
