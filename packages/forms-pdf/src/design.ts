import {
  renderDesignDocumentHtml,
  renderDesignDocumentsHtml,
  type DesignData,
  type DesignDocument,
} from '@appkit/design-studio'
import { renderHtmlDocumentPdf } from '@appkit/pdf/html'

export async function renderDesignDocumentPdf(input: { document: DesignDocument; data: DesignData; title?: string }): Promise<Buffer> {
  const first = input.document.artboards[0]
  return renderHtmlDocumentPdf({
    bodyHtml: renderDesignDocumentHtml(input.document, input.data, { title: input.title }),
    paperSize: pageSize(first?.width, first?.height),
    orientation: (first?.width ?? 11) >= (first?.height ?? 8.5) ? 'landscape' : 'portrait',
    marginMm: 0,
    ...(first ? { physicalSize: { widthIn: first.width, heightIn: first.height } } : {}),
  })
}

export async function renderDesignDocumentsPdf(pages: { document: DesignDocument; data: DesignData }[], title?: string): Promise<Buffer> {
  if (!pages.length) throw new Error('renderDesignDocumentsPdf requires at least one page')
  const first = pages[0]!.document.artboards[0]
  return renderHtmlDocumentPdf({
    bodyHtml: renderDesignDocumentsHtml(pages, title),
    paperSize: pageSize(first?.width, first?.height),
    orientation: (first?.width ?? 11) >= (first?.height ?? 8.5) ? 'landscape' : 'portrait',
    marginMm: 0,
    ...(first ? { physicalSize: { widthIn: first.width, heightIn: first.height } } : {}),
  })
}

function pageSize(width?: number, height?: number): 'letter' | 'a4' | 'legal' {
  if ((width === 8.5 && height === 14) || (width === 14 && height === 8.5)) return 'legal'
  if ((width ?? 0) > 8.1 && (width ?? 0) < 8.4) return 'a4'
  return 'letter'
}
