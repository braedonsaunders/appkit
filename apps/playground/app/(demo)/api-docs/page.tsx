import { ApiReference, type ApiEndpointDoc, Badge, PageContainer, PageHeader } from '@appkit/ui'

const LIVE_ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: 'GET',
    path: '/team',
    tag: 'Team',
    summary: 'List team members',
    description:
      'A real database endpoint using the fixed public demo context. Authentication is disabled, while the query remains RLS-scoped to the demo tenant. In a production app, @appkit/api adds API-key auth, permission scopes, rate limiting, and idempotency.',
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
    description: 'Returns the API status and version. No auth required.',
    responseExample: { status: 'ok', version: '0.1.0', uptime: '3d 4h' },
  },
  {
    method: 'GET',
    path: '/invoices',
    tag: 'Invoices',
    summary: 'List invoices',
    description: 'Returns example invoices. A production route would resolve the requesting tenant first.',
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
        description="Interactive documentation generated from the same route descriptions used by @appkit/api."
        actions={<Badge variant="secondary">@appkit/api</Badge>}
      />
      <div className="space-y-12">
        <ApiReference
          endpoints={LIVE_ENDPOINTS}
          baseUrl="/api/v1"
          showBearerToken={false}
          title="Live API (public demo)"
          description="Backed by the real RLS-scoped database with authentication deliberately disabled. Expand Team and send the request immediately."
        />
        <ApiReference
          endpoints={ENDPOINTS}
          baseUrl="/api/demo"
          showBearerToken={false}
          title="Demo endpoints"
          description="Self-documenting — generated from route descriptions. Expand an endpoint and hit Send."
        />
      </div>
    </PageContainer>
  )
}
