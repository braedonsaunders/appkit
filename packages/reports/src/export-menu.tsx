'use client'

import * as React from 'react'
import { ChevronDown, Download, FileText, Printer, Sheet } from 'lucide-react'
import { Button, Popover } from '@appkit/ui'

export type ReportExportOption = {
  format: 'pdf' | 'xlsx' | 'csv'
  label: string
  href?: string
  onSelect?: () => void | Promise<void>
}

export async function printReportPdf(href: string): Promise<void> {
  const response = await fetch(href)
  if (!response.ok) throw new Error('The printable report could not be loaded.')
  const objectUrl = URL.createObjectURL(await response.blob())
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = objectUrl
  iframe.onload = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => { URL.revokeObjectURL(objectUrl); iframe.remove() }, 60_000)
  }
  document.body.appendChild(iframe)
}

/** One compact report action containing print, PDF, spreadsheet, and CSV. */
export function ReportExportMenu({
  options,
  printHref,
  label = 'Export',
  printLabel = 'Print',
  onError,
}: {
  options: ReportExportOption[]
  printHref?: string
  label?: string
  printLabel?: string
  onError?: (error: Error) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg hover:bg-surface-hover'
  const icon = (format: ReportExportOption['format']) => format === 'pdf' ? <FileText size={14} /> : format === 'xlsx' ? <Sheet size={14} /> : <Download size={14} />
  const act = async (operation: () => void | Promise<void>) => {
    setOpen(false); setBusy(true)
    try { await operation() } catch (cause) { onError?.(cause instanceof Error ? cause : new Error('The report action failed.')) }
    finally { setBusy(false) }
  }
  return <Popover open={open} onOpenChange={setOpen} align="end" trigger={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen((value) => !value)}><Download size={14} />{label}<ChevronDown size={13} className="opacity-60" /></Button>}>
    <div className="w-44 p-1">
      {printHref ? <button type="button" className={item} onClick={() => void act(() => printReportPdf(printHref))}><Printer size={14} />{printLabel}</button> : null}
      {options.map((option) => option.href ? <a key={option.format} className={item} href={option.href} onClick={() => setOpen(false)}>{icon(option.format)}{option.label}</a> : <button key={option.format} type="button" className={item} onClick={() => void act(option.onSelect ?? (() => undefined))}>{icon(option.format)}{option.label}</button>)}
    </div>
  </Popover>
}
