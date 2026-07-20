import { renderHtmlDocumentPdf } from '@appkit/pdf/html'
import { escapeHtml } from './shared'
import { renderFormSummaryHtml } from './summary-html'
import type { FormPdfInput } from './types'

export { renderFormSummaryHtml } from './summary-html'
export type { FormPdfField, FormPdfSection, FormPdfPhoto, FormPdfInput } from './types'

export async function renderFormSummaryPdf(input: FormPdfInput): Promise<Buffer> {
  return renderHtmlDocumentPdf({
    bodyHtml: renderFormSummaryHtml(input),
    paperSize: input.page?.paperSize ?? 'letter',
    orientation: input.page?.orientation ?? 'portrait',
    marginMm: input.page?.marginMm ?? 15,
    footerHtml: `${escapeHtml(input.tenantName)} · {{page}} / {{pages}}`,
  })
}
