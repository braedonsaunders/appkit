'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { ApiReference, type ApiEndpointDoc, Badge, Button } from '@appkit/ui'

function useTheme() {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const r = document.documentElement
    setDark(r.classList.contains('dark') || (!r.classList.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches))
  }, [])
  const toggle = () =>
    setDark((d) => {
      const next = !d
      const r = document.documentElement
      r.classList.toggle('dark', next)
      r.classList.toggle('light', !next)
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {}
      return next
    })
  return { dark, toggle }
}

const LIVE_ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: 'GET',
    path: '/team',
    tag: 'Team',
    summary: 'List team members',
    description:
      'A REAL @appkit/api endpoint: Bearer-key authenticated, permission-checked (team.read), and RLS-scoped to the key’s tenant. Paste the seeded API key above and Send — without it you get the typed 401 envelope.',
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
    description: 'Returns invoices for the authenticated tenant.',
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
  const { dark, toggle } = useTheme()
  return (
    <div className="mx-auto min-h-screen max-w-4xl">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" /> appkit
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">@appkit/api</Badge>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </div>
      </header>
      <main className="space-y-12 px-6 py-10">
        <ApiReference
          endpoints={LIVE_ENDPOINTS}
          baseUrl="/api/v1"
          title="Live API (key-authed)"
          description="Backed by @appkit/api against the real database. Paste the API key printed by the seed to authenticate; sending without it demonstrates the typed 401."
        />
        <ApiReference
          endpoints={ENDPOINTS}
          baseUrl="/api/demo"
          title="Demo endpoints"
          description="Self-documenting — generated from route descriptions. Expand an endpoint and hit Send."
        />
      </main>
    </div>
  )
}
