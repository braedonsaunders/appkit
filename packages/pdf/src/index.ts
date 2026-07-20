// @appkit/pdf — the dependency-light pure-JS document renderer.
// Authored templates and Chromium printing are opt-in through /template and /html.
// Server-only: import from route handlers / server components only.

export * from './types'
export * from './page'
export { drawTable, computeColumnWidths } from './table'
export { renderPdfDocument } from './document'
export { renderStatementPdf } from './statement'
export type {
  StatementPdfInput,
  StatementPdfColumn,
  StatementPdfColumnKind,
  StatementPdfRow,
  StatementPdfStyle,
} from './statement'
