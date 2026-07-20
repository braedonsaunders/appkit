import { NextResponse } from 'next/server'
import { renderFormSummaryPdf } from '@appkit/forms-pdf'
import { renderPdfDocument, resolvePdfPageSetup } from '@appkit/pdf'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get('kind')
  const pdf = kind === 'form'
    ? await renderFormSummaryPdf({ tenantName: 'Northstar Works', title: 'Site inspection', reference: 'INS-1042', subtitle: 'North Tower · Level 7', fields: [{ key: 'inspector', label: 'Inspector', value: 'Pat Morgan' }, { key: 'status', label: 'Status', value: 'Complete' }, { key: 'completed', label: 'Completed', value: 'July 20, 2026' }], sections: [{ label: 'Inspection items', columns: [{ key: 'item', label: 'Item' }, { key: 'result', label: 'Result' }], rows: [{ item: 'Guardrails', result: 'Pass' }, { item: 'Access route', result: 'Pass' }, { item: 'Housekeeping', result: 'Follow-up' }] }] })
    : await renderPdfDocument({ title: 'Project portfolio', dateRangeLabel: 'July 2026', generatedAt: new Date(), branding: { orgName: 'Northstar Works' }, summary: [{ label: 'Projects', value: 3 }, { label: 'Portfolio value', value: '$4,995,000' }], groups: [{ kind: 'results', title: 'Projects', columns: ['Project', 'Status', 'Contract value'], align: ['left', 'left', 'right'], rows: [['North Tower', 'Active', '$1,840,000'], ['Civic Library', 'Bidding', '$725,000'], ['Harbour Plant', 'Active', '$2,430,000']] }], layout: resolvePdfPageSetup({ orientation: 'landscape' }) })
  return new NextResponse(new Blob([new Uint8Array(pdf)]), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${kind === 'form' ? 'site-inspection' : 'project-portfolio'}.pdf"`, 'cache-control': 'no-store' } })
}
