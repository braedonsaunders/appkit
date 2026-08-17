// Declarative .xlsx generation over the optional `exceljs` peer dependency.
// The module never loads exceljs at import time — `renderWorkbook` resolves it
// on first use and reports a clear installation error when the application has
// not opted in, mirroring how @appkitjs/pdf treats puppeteer-core.

export type WorkbookColumnSpec = {
  header: string
  key: string
  /** Character width; computed from a sample of the rows when omitted. */
  width?: number
  /** Excel number format for the column, e.g. `'#,##0.00'` or `'yyyy-mm-dd'`. */
  numFmt?: string
}

export type SheetSpec = {
  name: string
  columns: WorkbookColumnSpec[]
  rows: Record<string, string | number | boolean | null>[]
  /** Cell formulas applied after the rows land, e.g. `{ cell: 'D2', formula: 'B2*C2' }`. */
  formulas?: { cell: string; formula: string }[]
  freezeHeader?: boolean
  autoFilter?: boolean
  /** Bold the header row. Defaults to true. */
  boldHeader?: boolean
}

export type WorkbookSpec = {
  creator?: string
  sheets: SheetSpec[]
}

type ExcelModule = typeof import('exceljs')

const MIN_COLUMN_WIDTH = 10
const MAX_COLUMN_WIDTH = 56
const WIDTH_SAMPLE_ROWS = 200

async function loadExcelJs(): Promise<ExcelModule> {
  try {
    const loaded = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
    return loaded.default ?? loaded
  } catch (error) {
    throw new Error(
      'renderWorkbook needs the optional peer dependency exceljs — install it in the application (`pnpm add exceljs`) to generate .xlsx files.',
      { cause: error },
    )
  }
}

/** True when the optional `exceljs` peer resolves in this environment. */
export async function excelJsAvailable(): Promise<boolean> {
  try {
    await import('exceljs')
    return true
  } catch {
    return false
  }
}

/** Strip characters Excel forbids in sheet names and clamp to 31 characters. */
export function sanitizeSheetName(value: string): string {
  return (
    value
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet'
  )
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let candidate = base
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix++) {
    const tail = ` ${suffix}`
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function displayLength(value: string | number | boolean | null | undefined): number {
  if (value === null || value === undefined) return 0
  return String(value).length
}

function columnWidth(column: WorkbookColumnSpec, rows: SheetSpec['rows']): number {
  if (column.width !== undefined) {
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, column.width))
  }
  const sampled = rows
    .slice(0, WIDTH_SAMPLE_ROWS)
    .map((row) => displayLength(row[column.key]))
  return Math.min(
    MAX_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, column.header.length, ...sampled) + 2,
  )
}

/**
 * Render a declarative workbook spec to .xlsx bytes: typed columns with number
 * formats and sampled auto-widths, ordered data rows, optional cell formulas,
 * a bold (default) and optionally frozen/filtered header row, and Excel-legal
 * deduplicated sheet names.
 */
export async function renderWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  if (spec.sheets.length === 0) {
    throw new Error('renderWorkbook needs at least one sheet')
  }
  const excel = await loadExcelJs()
  const workbook = new excel.Workbook()
  workbook.creator = spec.creator ?? 'AppKit'
  workbook.created = new Date()

  const usedNames = new Set<string>()
  for (const sheetSpec of spec.sheets) {
    if (sheetSpec.columns.length === 0) {
      throw new Error(`Sheet "${sheetSpec.name}" needs at least one column`)
    }
    const sheet = workbook.addWorksheet(uniqueSheetName(sanitizeSheetName(sheetSpec.name), usedNames))
    sheet.columns = sheetSpec.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: columnWidth(column, sheetSpec.rows),
      ...(column.numFmt ? { style: { numFmt: column.numFmt } } : {}),
    }))
    for (const row of sheetSpec.rows) {
      sheet.addRow(sheetSpec.columns.map((column) => row[column.key] ?? null))
    }
    if (sheetSpec.boldHeader !== false) sheet.getRow(1).font = { bold: true }
    if (sheetSpec.freezeHeader) sheet.views = [{ state: 'frozen', ySplit: 1 }]
    if (sheetSpec.autoFilter) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheetSpec.columns.length },
      }
    }
    for (const { cell, formula } of sheetSpec.formulas ?? []) {
      sheet.getCell(cell).value = { formula }
    }
  }

  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(new Uint8Array(bytes as ArrayBuffer))
}
