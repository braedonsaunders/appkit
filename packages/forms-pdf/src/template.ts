import { renderHtmlDocumentPdf } from '@appkit/pdf/html'
import { compileTemplateHtml, renderTemplate } from '@appkit/pdf/template'
import type { AuthoredFormPdfInput } from './types'

export type { AuthoredFormPdfInput } from './types'

export function compileAuthoredFormPdf(input: AuthoredFormPdfInput): string {
  const { compiledHtml } = compileTemplateHtml(input.sourceHtml)
  return renderTemplate(compiledHtml, input.values, {
    escapeHtml: true,
    allowRawValues: input.allowRawValues ?? false,
  })
}

export async function renderAuthoredFormPdf(input: AuthoredFormPdfInput): Promise<Buffer> {
  return renderHtmlDocumentPdf({
    bodyHtml: compileAuthoredFormPdf(input),
    paperSize: input.paperSize ?? 'letter',
    orientation: input.orientation ?? 'portrait',
    marginMm: input.marginMm ?? 15,
    headerHtml: input.headerHtml,
    footerHtml: input.footerHtml,
  })
}
