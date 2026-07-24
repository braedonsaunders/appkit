// The report DOCUMENT renderer — the single template behind the in-app
// paginated preview (Paged.js in the browser), the on-demand PDF export, and
// the worker's scheduled-PDF pipeline. Pure string building: no puppeteer, no
// React — safe to import from web server components and the worker alike.
//
// Page-number strategy: the browser preview draws them with @page margin
// boxes (pass opts.marginBoxes to buildReportPageCss); Chromium print omits
// the margin boxes and uses Puppeteer's footerTemplate instead. Both derive
// paper size + margins from the same ReportLayoutConfig, so the preview and
// the delivered PDF paginate identically.

import {
  REPORT_PAPER_SIZES,
  type ReportDensity,
  type ReportLayout as ReportLayoutConfig,
  type ReportPaperSize,
} from './types'
import type { ReportColumn, ReportSummaryItem } from './types'

export type { ReportDensity, ReportLayoutConfig, ReportPaperSize }

export const DEFAULT_REPORT_LAYOUT: Required<ReportLayoutConfig> = {
  paperSize: 'letter',
  orientation: 'landscape',
  marginMm: 15,
  showSummary: true,
  density: 'standard',
}

export const REPORT_MARGIN_MM_MIN = 5
export const REPORT_MARGIN_MM_MAX = 30

/** Normalise a stored (or user-supplied) layout: whitelist paper/orientation/
 *  density, clamp margins, default the optionals — always returns a fully
 *  populated config. */
export function resolveReportLayout(
  layout?: Partial<ReportLayoutConfig> | null,
): Required<ReportLayoutConfig> {
  const paperSize = REPORT_PAPER_SIZES.includes(layout?.paperSize as ReportPaperSize)
    ? (layout?.paperSize as ReportPaperSize)
    : DEFAULT_REPORT_LAYOUT.paperSize
  const orientation =
    layout?.orientation === 'portrait' || layout?.orientation === 'landscape'
      ? layout.orientation
      : DEFAULT_REPORT_LAYOUT.orientation
  const m = Number(layout?.marginMm)
  const marginMm = Number.isFinite(m)
    ? Math.min(Math.max(Math.round(m), REPORT_MARGIN_MM_MIN), REPORT_MARGIN_MM_MAX)
    : DEFAULT_REPORT_LAYOUT.marginMm
  const showSummary = layout?.showSummary !== false
  const density: ReportDensity = layout?.density === 'compact' ? 'compact' : 'standard'
  return { paperSize, orientation, marginMm, showSummary, density }
}

/** CSS @page size keyword per paper size. Casing matters: Paged.js looks the
 *  keyword up in a case-SENSITIVE map ("letter"/"legal" lowercase, "A4"
 *  uppercase) while Chromium print parses keywords case-insensitively — these
 *  exact spellings satisfy both. */
const PAGE_SIZE_NAME: Record<ReportPaperSize, string> = {
  letter: 'letter',
  a4: 'A4',
  legal: 'legal',
}

export const REPORT_PAPER_SIZE_LABELS: Record<ReportPaperSize, string> = {
  letter: 'Letter',
  a4: 'A4',
  legal: 'Legal',
}

export type ReportDocumentInput = {
  tenantName: string
  tenantLogoUrl?: string | null
  primaryColor?: string | null
  reportName: string
  dateRangeLabel: string
  generatedAt: Date
  summary?: ReportSummaryItem[]
  groups: {
    title: string
    subtitle?: string
    columns: (string | ReportColumn)[]
    rows: (unknown[] | Record<string, unknown>)[]
    isEmpty?: boolean
  }[]
  translate?: (source: string) => string
}

/** Escape a string into a CSS `content:` literal. */
function cssString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** The @page rule for a layout. With `opts.marginBoxes` (browser preview only)
 *  it adds running footer margin boxes with live page counters — the print
 *  path must NOT pass it (Puppeteer's footerTemplate draws those instead). */
export function buildReportPageCss(
  layout: ReportLayoutConfig,
  opts: { marginBoxes?: { footerLeft: string } } = {},
): string {
  const boxes = opts.marginBoxes
    ? `
  @bottom-left { content: ${cssString(opts.marginBoxes.footerLeft)}; font-size: 8px; color: #666; }
  @bottom-right { content: counter(page) " / " counter(pages); font-size: 8px; color: #666; }`
    : ''
  return `@page {
  size: ${PAGE_SIZE_NAME[layout.paperSize]} ${layout.orientation};
  margin: ${layout.marginMm}mm;${boxes}
}`
}

/** Element styles for the document markup. Kept SEPARATE from the markup so
 *  the browser preview can hand them to Paged.js's Polisher (which only
 *  processes CSS passed through its stylesheets argument — inline <style>
 *  tags inside the flowed content are never parsed, so @page/break rules in
 *  them would be silently ignored). Selectors are scoped under
 *  .appkit-report-doc so the fragment can mount inside the app without
 *  restyling the page around it. `density: 'compact'` shrinks type + padding
 *  so more rows fit per page.
 *
 *  The look mirrors the on-screen <ReportPaper>/<PaperView>: a centered
 *  document header, a divided summary band (no cards), plain uppercase section
 *  headers, and clean borderless rows under a ruled header — so the exported
 *  PDF is visually identical to the in-app preview. */
export function buildReportDocumentCss(
  _primaryColor?: string | null,
  density: ReportDensity = 'standard',
): string {
  const compact = density === 'compact'
  const s = compact
    ? {
        body: '8.5pt',
        org: '10pt',
        title: '15pt',
        period: '9pt',
        note: '8pt',
        logo: '30px',
        headMargin: '16px',
        sumMargin: '0 0 16px',
        sumPad: '8px 0',
        sumLabel: '7.5pt',
        sumValue: '10.5pt',
        section: '0 0 18px',
        h3: '8pt',
        subtitle: '8pt',
        table: '8.5pt',
        thPad: '4px 10px 4px 0',
        tdPad: '3px 10px 3px 0',
      }
    : {
        body: '10pt',
        org: '11.5pt',
        title: '18pt',
        period: '10pt',
        note: '8.5pt',
        logo: '40px',
        headMargin: '24px',
        sumMargin: '0 0 24px',
        sumPad: '12px 0',
        sumLabel: '8.5pt',
        sumValue: '12.5pt',
        section: '0 0 28px',
        h3: '8.5pt',
        subtitle: '8.5pt',
        table: '9.5pt',
        thPad: '6px 14px 6px 0',
        tdPad: '4px 14px 4px 0',
      }
  return `
  .appkit-report-doc { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial; color: #111827; font-size: ${s.body}; font-variant-numeric: tabular-nums; }
  .appkit-report-doc * { box-sizing: border-box; }
  .appkit-report-doc .doc-head { text-align: center; margin-bottom: ${s.headMargin}; }
  .appkit-report-doc .doc-head img.logo { max-height: ${s.logo}; margin: 0 auto 6px; display: block; }
  .appkit-report-doc .doc-org { font-size: ${s.org}; font-weight: 600; }
  .appkit-report-doc .doc-title { font-size: ${s.title}; font-weight: 700; letter-spacing: -0.01em; margin: 2px 0; }
  .appkit-report-doc .doc-period { font-size: ${s.period}; color: #6b7280; }
  .appkit-report-doc .doc-note { font-size: ${s.note}; color: #9ca3af; font-style: italic; }
  .appkit-report-doc .summary {
    display: flex;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: ${s.sumPad};
    margin: ${s.sumMargin};
    break-inside: avoid;
  }
  .appkit-report-doc .sum { flex: 1 1 0; min-width: 0; padding: 0 12px; text-align: center; }
  .appkit-report-doc .sum + .sum { border-left: 1px solid #e5e7eb; }
  .appkit-report-doc .sum-label { color: #6b7280; font-size: ${s.sumLabel}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .appkit-report-doc .sum-value { font-size: ${s.sumValue}; font-weight: 600; margin-top: 2px; }
  .appkit-report-doc section.group { margin: ${s.section}; }
  .appkit-report-doc section.group .group-title {
    font-size: ${s.h3};
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 8px 0 6px;
    break-after: avoid;
  }
  .appkit-report-doc section.group .group-title .subtitle { margin-left: 8px; font-weight: 400; text-transform: none; letter-spacing: normal; color: #6b7280; }
  .appkit-report-doc table { width: 100%; max-width: 100%; border-collapse: collapse; font-size: ${s.table}; }
  .appkit-report-doc thead { display: table-header-group; }
  .appkit-report-doc tr { break-inside: avoid; }
  .appkit-report-doc thead th {
    text-align: left;
    vertical-align: bottom;
    border-bottom: 1px solid #d1d5db;
    padding: ${s.thPad};
    color: #6b7280;
    font-weight: 600;
    font-size: 0.82em;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
  .appkit-report-doc tbody td {
    padding: ${s.tdPad};
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .appkit-report-doc th:last-child, .appkit-report-doc td:last-child { padding-right: 0; }
  .appkit-report-doc .a-right { text-align: right; }
  .appkit-report-doc .a-center { text-align: center; }
  .appkit-report-doc tbody td em { color: #9ca3af; font-style: italic; }
  .appkit-report-doc .empty { color: #9ca3af; font-style: italic; text-align: center; padding: 24px 0; }
  .appkit-report-doc img { max-width: 100%; height: auto; }
`
}

const NUMERIC_CELL = /^-?[$(]?-?[\d,]+(\.\d+)?\)?%?$/

/** Mirror of PaperView's per-cell numeric heuristic so free-form values align
 *  the same way on paper as they do on screen. */
function isNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  return NUMERIC_CELL.test(value.trim())
}

function alignClass(align: 'left' | 'center' | 'right'): string {
  return align === 'right' ? ' class="a-right"' : align === 'center' ? ' class="a-center"' : ''
}

/** The document body fragment: cover header + summary band + one section per
 *  group. Style-free and @page-free — callers pair it with
 *  buildReportDocumentCss() and buildReportPageCss() (browser preview passes
 *  both to Paged.js; the PDF shell puts them in <head>). */
export function renderReportDocumentBodyHtml(input: ReportDocumentInput): string {
  const translate = input.translate ?? ((source: string) => source)
  const multiGroup = input.groups.length > 1
  const summaryCells = (input.summary ?? [])
    .map(
      (item) => `<div class="sum">
        <div class="sum-label">${escapeHtml(translate(item.label))}</div>
        <div class="sum-value">${escapeHtml(String(item.value))}</div>
      </div>`,
    )
    .join('')

  const groupsHtml = input.groups
    .map((g) => {
      const showTitle = g.title && (multiGroup || Boolean(g.subtitle))
      const titleHtml = showTitle
        ? `<div class="group-title">${escapeHtml(translate(g.title))}${g.subtitle ? `<span class="subtitle">${escapeHtml(translate(g.subtitle))}</span>` : ''}</div>`
        : ''
      if (g.isEmpty || g.rows.length === 0) {
        return `<section class="group">
          ${titleHtml}
          <div class="empty">${escapeHtml(translate('No data.'))}</div>
        </section>`
      }
      const columnAlign = g.columns.map((column) => {
        if (typeof column === 'string') return 'left' as const
        return column.align ?? (column.semanticType === 'number' || column.semanticType === 'currency' ? 'right' : 'left')
      })
      const head = g.columns
        .map((column, index) => `<th${alignClass(columnAlign[index] ?? 'left')}>${escapeHtml(translate(typeof column === 'string' ? column : column.label))}</th>`)
        .join('')
      const body = g.rows
        .map((row) => {
          const cells = Array.isArray(row)
            ? row
            : g.columns.map((column) => row[typeof column === 'string' ? column : column.key])
          return `<tr>${cells
            .map((value, index) => {
              const declared = columnAlign[index] ?? 'left'
              const align = declared === 'left' && isNumericValue(value) ? 'right' : declared
              return `<td${alignClass(align)}>${value === null || value === undefined || value === '' ? '<em>—</em>' : escapeHtml(String(value))}</td>`
            })
            .join('')}</tr>`
        })
        .join('')
      return `<section class="group">
        ${titleHtml}
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </section>`
    })
    .join('')

  const generated = `${escapeHtml(translate('Generated'))} ${escapeHtml(input.generatedAt.toISOString().slice(0, 19).replace('T', ' '))}`
  return `<div class="appkit-report-doc">
  <header class="doc-head">
    ${input.tenantLogoUrl ? `<img class="logo" src="${escapeHtml(input.tenantLogoUrl)}" alt=""/>` : ''}
    ${input.tenantName ? `<div class="doc-org">${escapeHtml(input.tenantName)}</div>` : ''}
    <div class="doc-title">${escapeHtml(input.reportName)}</div>
    ${input.dateRangeLabel ? `<div class="doc-period">${escapeHtml(input.dateRangeLabel)}</div>` : ''}
    <div class="doc-note">${generated}</div>
  </header>
  ${summaryCells ? `<div class="summary">${summaryCells}</div>` : ''}
  ${groupsHtml}
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
