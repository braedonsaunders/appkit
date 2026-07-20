import { renderDesignDocumentHtml, renderDesignDocumentsHtml, type DesignData, type DesignDocument } from '@appkit/design-studio'
import { compileTemplateHtml, renderHtmlDocumentPdf, renderTemplate } from '@appkit/pdf'
import { color } from '@appkit/tokens'

export type FormPdfField = { key: string; label: string; value: string }
export type FormPdfSection = { label: string; columns: { key: string; label: string }[]; rows: Record<string, string>[]; moreRows?: number }
export type FormPdfPhoto = { url: string; caption?: string }
export type FormPdfInput = {
  tenantName: string
  title: string
  reference?: string
  subtitle?: string
  fields: FormPdfField[]
  sections?: FormPdfSection[]
  photos?: FormPdfPhoto[]
  page?: { paperSize?: 'letter' | 'a4' | 'legal'; orientation?: 'portrait' | 'landscape'; marginMm?: number }
}

export type AuthoredFormPdfInput = {
  sourceHtml: string
  values: Record<string, unknown>
  paperSize?: 'letter' | 'a4' | 'legal'
  orientation?: 'portrait' | 'landscape'
  marginMm?: number
  headerHtml?: string | null
  footerHtml?: string | null
  allowRawValues?: boolean
}

export function renderFormSummaryHtml(input: FormPdfInput): string {
  const rows = input.fields.length
    ? input.fields.map((field) => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value)}</td></tr>`).join('')
    : '<tr><td class="empty">No details captured.</td></tr>'
  const sections = (input.sections ?? []).map((section) => `<section><h2>${escapeHtml(section.label)}</h2><table><thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(row[column.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${section.moreRows ? `<p class="more">+ ${section.moreRows} more ${section.moreRows === 1 ? 'row' : 'rows'} not shown.</p>` : ''}</section>`).join('')
  const photos = input.photos?.length ? `<section><h2>Photos</h2><div class="photos">${input.photos.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="">${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}</figure>`).join('')}</div></section>` : ''
  return `<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:${color('fg')}}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}.subtitle,.reference,.more,figcaption{color:${color('fg-muted')}}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid ${color('border')};padding:7px 10px;vertical-align:top;text-align:left}th{background:${color('bg-subtle')};color:${color('fg')};font-weight:600}.details th{width:34%}.empty{color:${color('fg-subtle')}}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos figure{margin:0}.photos img{width:100%;max-height:340px;object-fit:contain;border:1px solid ${color('border')};border-radius:4px}figcaption{font-size:10px;margin-top:3px}</style><h1>${escapeHtml(input.title)}</h1>${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ''}${input.reference ? `<p class="reference">Reference: ${escapeHtml(input.reference)}</p>` : ''}<table class="details"><tbody>${rows}</tbody></table>${sections}${photos}`
}

export async function renderFormSummaryPdf(input: FormPdfInput): Promise<Buffer> {
  return renderHtmlDocumentPdf({ bodyHtml: renderFormSummaryHtml(input), paperSize: input.page?.paperSize ?? 'letter', orientation: input.page?.orientation ?? 'portrait', marginMm: input.page?.marginMm ?? 15, footerHtml: `${escapeHtml(input.tenantName)} · {{page}} / {{pages}}` })
}

export function compileAuthoredFormPdf(input: AuthoredFormPdfInput): string {
  const { compiledHtml } = compileTemplateHtml(input.sourceHtml)
  return renderTemplate(compiledHtml, input.values, {
    escapeHtml: true,
    allowRawValues: input.allowRawValues ?? false,
  })
}

export async function renderAuthoredFormPdf(input: AuthoredFormPdfInput): Promise<Buffer> {
  return renderHtmlDocumentPdf({ bodyHtml: compileAuthoredFormPdf(input), paperSize: input.paperSize ?? 'letter', orientation: input.orientation ?? 'portrait', marginMm: input.marginMm ?? 15, headerHtml: input.headerHtml, footerHtml: input.footerHtml })
}

export async function renderDesignDocumentPdf(input: { document: DesignDocument; data: DesignData; title?: string }): Promise<Buffer> {
  const first = input.document.artboards[0]
  return renderHtmlDocumentPdf({ bodyHtml: renderDesignDocumentHtml(input.document, input.data, { title: input.title }), paperSize: pageSize(first?.width, first?.height), orientation: (first?.width ?? 11) >= (first?.height ?? 8.5) ? 'landscape' : 'portrait', marginMm: 0, physicalSize: first ? { widthIn: first.width, heightIn: first.height } : undefined })
}

export async function renderDesignDocumentsPdf(pages: { document: DesignDocument; data: DesignData }[], title?: string): Promise<Buffer> {
  if (!pages.length) throw new Error('renderDesignDocumentsPdf requires at least one page')
  const first = pages[0]!.document.artboards[0]
  return renderHtmlDocumentPdf({ bodyHtml: renderDesignDocumentsHtml(pages, title), paperSize: pageSize(first?.width, first?.height), orientation: (first?.width ?? 11) >= (first?.height ?? 8.5) ? 'landscape' : 'portrait', marginMm: 0, physicalSize: first ? { widthIn: first.width, heightIn: first.height } : undefined })
}

function pageSize(width?: number, height?: number): 'letter' | 'a4' | 'legal' { if ((width === 8.5 && height === 14) || (width === 14 && height === 8.5)) return 'legal'; if ((width ?? 0) > 8.1 && (width ?? 0) < 8.4) return 'a4'; return 'letter' }
export function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
