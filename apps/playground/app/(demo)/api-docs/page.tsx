import { ApiReference, type ApiEndpointDoc, PageContainer, PageHeader } from '@appkit/ui'

const LIVE_ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: 'GET',
    path: '/team',
    tag: 'Team',
    summary: 'List team members',
    description: 'List the people and roles in the current workspace.',
    permission: 'team.read',
    responseExample: { data: [{ id: '…', name: 'Ada Lovelace', email: 'admin@appkit.dev' }], total: 2 },
  },
]

const ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: 'GET',
    path: '/status',
    tag: 'System',
    summary: 'Service status',
    description: 'Returns the API status and version.',
    responseExample: { status: 'ok', version: '0.1.0', uptime: '3d 4h' },
  },
  {
    method: 'GET',
    path: '/invoices',
    tag: 'Invoices',
    summary: 'List invoices',
    description: 'Returns invoices visible to the current workspace.',
    permission: 'invoices.read',
    params: [
      { name: 'status', type: 'string', description: 'Filter by status (paid, pending, …)' },
      { name: 'limit', type: 'integer', description: 'Max rows to return' },
    ],
    responseExample: { data: [{ id: 'INV-1042', customer: 'Northwind Traders', amount: 4820, status: 'paid' }], total: 1 },
  },
  {
    method: 'POST',
    path: '/invoices',
    tag: 'Invoices',
    summary: 'Create an invoice',
    description: 'Creates a draft invoice. Requires an Idempotency-Key header.',
    permission: 'invoices.write',
    requestExample: { customer: 'Acme Co', amount: 990, currency: 'USD' },
    responseExample: { id: 'INV-1043', status: 'draft', customer: 'Acme Co', amount: 990 },
  },
]

export default function ApiDocs() {
  return (
    <PageContainer className="max-w-4xl space-y-10">
      <PageHeader
        title="API reference"
        description="Browse endpoints, parameters, request examples, and responses."
      />
      <div className="space-y-12">
        <ApiReference
          endpoints={LIVE_ENDPOINTS}
          baseUrl="/api/v1"
          showBearerToken={false}
          title="Workspace API"
          description="Expand an endpoint, send a request, and inspect the response."
        />
        <ApiReference
          endpoints={ENDPOINTS}
          baseUrl="/api/demo"
          showBearerToken={false}
          title="Invoice endpoints"
          description="Review request parameters and example responses."
        />
      </div>
    </PageContainer>
  )
}
