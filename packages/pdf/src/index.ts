// @appkit/pdf — the extracted OpenBooks pure-JS document renderer plus the
// hardened Chromium path for authored HTML templates.
// Server-only: import from route handlers / server components only.

export * from './types'
export * from './page'
export { drawTable, computeColumnWidths } from './table'
export { renderPdfDocument } from './document'
export { renderStatementPdf } from './statement'
export { renderHtmlDocumentPdf, type HtmlDocumentPdfInput, type PdfOrientation } from './html'
export {
  renderTemplate,
  expandRepeatMarkers,
  sanitizeTemplateHtml,
  sanitizeTemplateFragment,
  sanitizeTokenizedFragment,
  compileTemplateHtml,
  escapeTemplateHtml,
  htmlToPlainText,
  TEMPLATE_RENDER_LIMITS,
} from './template'
export type {
  StatementPdfInput,
  StatementPdfColumn,
  StatementPdfColumnKind,
  StatementPdfRow,
  StatementPdfStyle,
} from './statement'
