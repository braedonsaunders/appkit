'use client'

// Tables carry the layout in email, so they need real structural editing —
// add/remove columns and rows, set a per-column width — which GrapesJS does not
// expose out of the box. These helpers walk the selected cell's table in the
// component tree; the toolbar appears whenever a cell is selected.

import { useEffect, useState } from 'react'
import type { Component, Editor } from 'grapesjs'
import type { EmailDesignerCopy } from './copy'
import { resolveEmailDesignerCopy } from './copy'

const CELL_TAGS = new Set(['td', 'th'])

function closestCell(cmp: Component | undefined): Component | null {
  let c: Component | undefined = cmp
  while (c) {
    if (CELL_TAGS.has(String(c.get('tagName')))) return c
    c = c.parent()
  }
  return null
}

function closestTable(cmp: Component | null): Component | null {
  let c: Component | null | undefined = cmp
  while (c) {
    if (String(c.get('tagName')) === 'table') return c
    c = c.parent()
  }
  return null
}

function collectRows(node: Component, out: Component[]): void {
  node.components().forEach((child: Component) => {
    const tag = String(child.get('tagName'))
    if (tag === 'tr') out.push(child)
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') collectRows(child, out)
  })
}

type CellContext = {
  cell: Component
  row: Component
  table: Component
  colIndex: number
  rows: Component[]
}

function cellContext(editor: Editor): CellContext | null {
  const cell = closestCell(editor.getSelected())
  if (!cell) return null
  const row = cell.parent()
  if (!row || String(row.get('tagName')) !== 'tr') return null
  const table = closestTable(row)
  if (!table) return null
  const rows: Component[] = []
  collectRows(table, rows)
  return { cell, row, table, colIndex: cell.index(), rows }
}

// Copy a reference cell's resolved style onto a freshly inserted one. GrapesJS
// keeps styles in CSS rules keyed by id rather than inline, so a bare new cell
// would otherwise render unstyled next to its neighbours.
function copyStyle(from: Component | undefined, to: Component | undefined): void {
  if (!from || !to || typeof to.setStyle !== 'function') return
  const style = { ...from.getStyle() }
  delete (style as Record<string, unknown>).width // per-column, set explicitly
  to.setStyle(style)
}

function firstAdded(added: Component | Component[]): Component | undefined {
  return Array.isArray(added) ? added[0] : added
}

export function addTableColumn(editor: Editor): void {
  const ctx = cellContext(editor)
  if (!ctx) return
  const at = ctx.colIndex + 1
  ctx.rows.forEach((row) => {
    const cells = row.components()
    const ref = cells.at(Math.min(ctx.colIndex, cells.length - 1))
    const tag = String(ref?.get('tagName')) === 'th' ? 'th' : 'td'
    const label = tag === 'th' ? 'Column' : '&nbsp;'
    // component.append() parses the HTML into a real component; the collection's
    // own .add() does not parse an HTML string.
    const created = firstAdded(
      row.append(`<${tag}>${label}</${tag}>`, { at: Math.min(at, cells.length) }),
    )
    copyStyle(ref, created)
  })
  editor.trigger('change:canvasOffset')
}

export function removeTableColumn(editor: Editor): void {
  const ctx = cellContext(editor)
  if (!ctx) return
  if (ctx.rows.every((row) => row.components().length <= 1)) return // keep one column
  ctx.rows.forEach((row) => row.components().at(ctx.colIndex)?.remove())
  editor.trigger('change:canvasOffset')
}

export function addTableRow(editor: Editor): void {
  const ctx = cellContext(editor)
  if (!ctx) return
  const parent = ctx.row.parent()
  if (!parent) return
  const at = ctx.row.index() + 1
  const cellsHtml = ctx.row
    .components()
    .map((c: Component) => {
      const tag = String(c.get('tagName')) === 'th' ? 'th' : 'td'
      return `<${tag}>&nbsp;</${tag}>`
    })
    .join('')
  // New rows are static — repeating rows come from a collection's data-each.
  const newRow = firstAdded(parent.append(`<tr>${cellsHtml}</tr>`, { at }))
  if (newRow) {
    const source = ctx.row.components()
    const target = newRow.components()
    source.forEach((c: Component, i: number) => copyStyle(c, target.at(i)))
  }
  editor.trigger('change:canvasOffset')
}

export function removeTableRow(editor: Editor): void {
  const ctx = cellContext(editor)
  if (!ctx) return
  if (ctx.rows.length <= 1) return
  ctx.row.remove()
  editor.trigger('change:canvasOffset')
}

/**
 * Apply a width to every cell in the selected column (px, or `null` to clear).
 * Widths are captured by the design serialization and inlined at compile, so
 * they survive to the delivered message.
 */
export function setTableColumnWidth(editor: Editor, px: number | null): void {
  const ctx = cellContext(editor)
  if (!ctx) return
  ctx.rows.forEach((row) => {
    const cell = row.components().at(ctx.colIndex)
    if (!cell || typeof cell.setStyle !== 'function') return
    const style = { ...cell.getStyle() }
    if (px && px > 0) style.width = `${px}px`
    else delete (style as Record<string, unknown>).width
    cell.setStyle(style)
  })
  editor.trigger('change:canvasOffset')
}

function currentColumnWidthPx(editor: Editor): string {
  const ctx = cellContext(editor)
  if (!ctx) return ''
  const width = String(ctx.cell.getStyle().width ?? '')
  return width.match(/^(\d+(?:\.\d+)?)px$/)?.[1] ?? ''
}

/** Floats over the canvas whenever a table cell is selected. */
export function EmailTableToolbar({
  editor,
  copy,
}: {
  editor: Editor | null
  copy?: Partial<EmailDesignerCopy>
}) {
  const t = resolveEmailDesignerCopy(copy)
  const [active, setActive] = useState(false)
  const [width, setWidth] = useState('')

  useEffect(() => {
    if (!editor) return
    const sync = () => {
      setActive(!!cellContext(editor))
      setWidth(currentColumnWidthPx(editor))
    }
    editor.on('component:selected', sync)
    editor.on('component:deselected', sync)
    editor.on('component:update', sync)
    return () => {
      editor.off('component:selected', sync)
      editor.off('component:deselected', sync)
      editor.off('component:update', sync)
    }
  }, [editor])

  if (!editor || !active) return null

  const applyWidth = (raw: string) => {
    const value = Number(raw)
    setTableColumnWidth(editor, Number.isFinite(value) && value > 0 ? value : null)
  }

  return (
    <div className="ak-ed-tabletools">
      <span className="ak-ed-tabletools__label">{t.tableLabel}</span>
      <button
        type="button"
        className="ak-ed-tabletools__btn"
        onClick={() => addTableColumn(editor)}
        title={t.addColumnTitle}
      >
        {t.addColumn}
      </button>
      <button
        type="button"
        className="ak-ed-tabletools__btn"
        onClick={() => removeTableColumn(editor)}
        title={t.removeColumnTitle}
      >
        {t.removeColumn}
      </button>
      <span className="ak-ed-tabletools__sep" />
      <button
        type="button"
        className="ak-ed-tabletools__btn"
        onClick={() => addTableRow(editor)}
        title={t.addRowTitle}
      >
        {t.addRow}
      </button>
      <button
        type="button"
        className="ak-ed-tabletools__btn"
        onClick={() => removeTableRow(editor)}
        title={t.removeRowTitle}
      >
        {t.removeRow}
      </button>
      <span className="ak-ed-tabletools__sep" />
      <label className="ak-ed-tabletools__width">
        {t.columnWidth}
        <input
          type="number"
          min={0}
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          onBlur={(event) => applyWidth(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyWidth((event.target as HTMLInputElement).value)
          }}
          placeholder={t.columnWidthPlaceholder}
        />
        {t.columnWidthUnit}
      </label>
    </div>
  )
}
