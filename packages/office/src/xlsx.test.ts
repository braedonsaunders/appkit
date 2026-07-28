import assert from 'node:assert/strict'
import test from 'node:test'
import { excelJsAvailable, renderWorkbook, sanitizeSheetName, type WorkbookSpec } from './xlsx'

async function loadExcelForAssertions(): Promise<typeof import('exceljs')> {
  const loaded = (await import('exceljs')) as typeof import('exceljs') & {
    default?: typeof import('exceljs')
  }
  return loaded.default ?? loaded
}

const SPEC: WorkbookSpec = {
  creator: 'AppKit tests',
  sheets: [
    {
      name: 'Invoices / Q3 [draft]?*:',
      columns: [
        { header: 'Invoice', key: 'invoice' },
        { header: 'Customer', key: 'customer' },
        { header: 'Amount', key: 'amount', numFmt: '#,##0.00', width: 14 },
      ],
      rows: [
        { invoice: 'INV-1001', customer: 'A very long customer name that should clamp the width', amount: 1250.5 },
        { invoice: 'INV-1002', customer: 'Shorter', amount: 90 },
      ],
      formulas: [{ cell: 'C4', formula: 'SUM(C2:C3)' }],
      freezeHeader: true,
      autoFilter: true,
    },
  ],
}

test('sanitizeSheetName strips forbidden characters and clamps to 31 characters', () => {
  assert.equal(sanitizeSheetName('Invoices / Q3 [draft]?*:'), 'Invoices   Q3  draft')
  assert.equal(sanitizeSheetName('x'.repeat(64)).length, 31)
  assert.equal(sanitizeSheetName('  \\ / ? * [ ] :  '), 'Sheet')
})

test('renderWorkbook renders the declarative spec through exceljs', async () => {
  assert.equal(await excelJsAvailable(), true)
  const bytes = await renderWorkbook(SPEC)
  // .xlsx files are ZIP containers: PK\x03\x04.
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04])

  const excel = await loadExcelForAssertions()
  const workbook = new excel.Workbook()
  await workbook.xlsx.load(new Uint8Array(bytes).buffer)
  const sheet = workbook.getWorksheet('Invoices   Q3  draft')
  assert.ok(sheet)
  assert.equal(sheet.getCell('A1').value, 'Invoice')
  assert.equal(sheet.getCell('A2').value, 'INV-1001')
  assert.equal(sheet.getCell('C3').value, 90)
  assert.equal(sheet.getRow(1).font?.bold, true)
  assert.equal(sheet.views[0]?.state, 'frozen')
  const total = sheet.getCell('C4').value as { formula?: string }
  assert.equal(total?.formula, 'SUM(C2:C3)')
  // Sampled auto-width clamps between 10 and 56; explicit widths are honored.
  const customerWidth = sheet.getColumn(2).width ?? 0
  assert.ok(customerWidth >= 10 && customerWidth <= 56)
  assert.equal(sheet.getColumn(3).width, 14)
})

test('renderWorkbook deduplicates colliding sanitized sheet names', async () => {
  const bytes = await renderWorkbook({
    sheets: [
      { name: 'Data?', columns: [{ header: 'A', key: 'a' }], rows: [] },
      { name: 'Data*', columns: [{ header: 'A', key: 'a' }], rows: [] },
    ],
  })
  const excel = await loadExcelForAssertions()
  const workbook = new excel.Workbook()
  await workbook.xlsx.load(new Uint8Array(bytes).buffer)
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Data', 'Data 2'])
})

test('renderWorkbook rejects empty specs', async () => {
  await assert.rejects(renderWorkbook({ sheets: [] }), /at least one sheet/)
  await assert.rejects(
    renderWorkbook({ sheets: [{ name: 'x', columns: [], rows: [] }] }),
    /at least one column/,
  )
})
