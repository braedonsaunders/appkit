import type { CSSProperties } from 'react'
import { cn } from '@appkit/ui'
import {
  buildReportDocumentCss,
  renderReportDocumentBodyHtml,
  resolveReportLayout,
} from './document-render'
import type { ReportLayout, ReportRunResult } from './types'

const PAPER_WIDTH: Record<ReportLayout['paperSize'], string> = {
  letter: 'max-w-5xl',
  a4: 'max-w-[62rem]',
  legal: 'max-w-[78rem]',
}

/**
 * Screen representation of the canonical report document. PDF printers consume
 * the same body builder and CSS, leaving only the outer paper frame screen-only.
 */
export function ReportDocumentView({
  organization,
  logoUrl,
  primaryColor,
  title,
  description = '',
  layout,
  result,
  className,
}: {
  organization: string
  logoUrl?: string | null
  primaryColor?: string | null
  title: string
  description?: string
  layout?: Partial<ReportLayout>
  result: ReportRunResult
  className?: string
}) {
  const resolved = resolveReportLayout(layout)
  const documentCss = buildReportDocumentCss(primaryColor, resolved.density)
  const bodyHtml = renderReportDocumentBodyHtml({
    tenantName: organization,
    tenantLogoUrl: logoUrl,
    primaryColor,
    reportName: title,
    dateRangeLabel: description,
    summary: resolved.showSummary ? result.summary : undefined,
    groups: result.groups.map((group) => ({
      title: group.title,
      subtitle: group.subtitle,
      columns: group.columns,
      rows: group.rows,
      isEmpty: group.isEmpty,
    })),
  })
  const style = {
    '--report-paper-margin': `${resolved.marginMm}mm`,
  } as CSSProperties

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: documentCss }} />
      <article
        data-report-paper
        data-paper-size={resolved.paperSize}
        data-paper-orientation={resolved.orientation}
        data-paper-density={resolved.density}
        style={style}
        className={cn(
          'mx-auto w-full rounded-lg border border-border bg-surface p-[var(--report-paper-margin)] text-fg shadow-sm print:border-0 print:p-0 print:shadow-none',
          resolved.orientation === 'landscape'
            ? resolved.paperSize === 'legal'
              ? PAPER_WIDTH.legal
              : 'max-w-none'
            : PAPER_WIDTH[resolved.paperSize],
          className,
        )}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  )
}
