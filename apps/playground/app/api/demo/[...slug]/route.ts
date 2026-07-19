import type { NextRequest } from 'next/server'

// Demo endpoints so the API reference's "Send" button hits something real.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  const path = '/' + slug.join('/')
  if (path === '/status') {
    return Response.json({ status: 'ok', version: '0.1.0', uptime: '3d 4h' })
  }
  if (path === '/invoices') {
    return Response.json({
      data: [
        { id: 'INV-1042', customer: 'Northwind Traders', amount: 4820, status: 'paid' },
        { id: 'INV-1041', customer: 'Globex Corp', amount: 12960, status: 'pending' },
      ],
      total: 2,
    })
  }
  return Response.json({ error: { code: 'not_found', message: 'Unknown demo endpoint' } }, { status: 404 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  const path = '/' + slug.join('/')
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (path === '/invoices') {
    return Response.json({ id: 'INV-1043', status: 'draft', ...body }, { status: 201 })
  }
  return Response.json({ error: { code: 'not_found', message: 'Unknown demo endpoint' } }, { status: 404 })
}
