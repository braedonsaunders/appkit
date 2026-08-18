import { DatabaseSync } from 'node:sqlite'
import { NextResponse } from 'next/server'
import {
  quoteSqlIdentifier,
  validateReadOnlySql,
  type QuerySchemaTable,
} from '@braedonsaunders/appkit-query-console'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const database = new DatabaseSync(':memory:')
database.exec(`
  create table projects (
    id integer primary key,
    project_name text not null,
    status text not null,
    budget_cents integer not null,
    opened_on text not null
  );
  create table invoices (
    id integer primary key,
    invoice_number text not null,
    project_id integer not null references projects(id),
    project_name text not null,
    status text not null,
    amount_cents integer not null,
    due_on text not null
  );
  insert into projects values
    (1, 'North Tower', 'active', 12500000, '2026-01-15'),
    (2, 'Harbour Retrofit', 'active', 8400000, '2026-03-04'),
    (3, 'Cedar Clinic', 'planning', 6100000, '2026-06-20'),
    (4, 'Transit Annex', 'complete', 9300000, '2025-09-10'),
    (5, 'Foundry Offices', 'on_hold', 4750000, '2026-04-12');
  insert into invoices values
    (1, 'INV-2601', 1, 'North Tower', 'paid', 2450000, '2026-02-28'),
    (2, 'INV-2608', 1, 'North Tower', 'open', 1875000, '2026-09-15'),
    (3, 'INV-2610', 2, 'Harbour Retrofit', 'paid', 1320000, '2026-06-30'),
    (4, 'INV-2615', 2, 'Harbour Retrofit', 'open', 980000, '2026-09-30'),
    (5, 'INV-2618', 3, 'Cedar Clinic', 'draft', 760000, '2026-10-10'),
    (6, 'INV-2522', 4, 'Transit Annex', 'paid', 9300000, '2025-12-20');
  create view project_summary as
    select p.id as project_id,
           p.project_name,
           p.status,
           count(i.id) as invoice_count,
           coalesce(sum(i.amount_cents), 0) as invoiced_cents,
           coalesce(sum(case when i.status = 'paid' then i.amount_cents else 0 end), 0) as paid_cents
      from projects p
      left join invoices i on i.project_id = p.id
     group by p.id, p.project_name, p.status;
  pragma query_only = on;
`)

function schemaTables(): QuerySchemaTable[] {
  const relations = database.prepare(`
    select name, type
      from sqlite_schema
     where type in ('table', 'view')
       and name not like 'sqlite_%'
     order by name
  `).all() as { name: string; type: string }[]

  return relations.map((relation) => {
    const columns = database
      .prepare(`pragma table_info(${quoteSqlIdentifier(relation.name)})`)
      .all() as { name: string; type: string; notnull: number }[]
    return {
      name: relation.name,
      kind: relation.type === 'view' ? 'view' : 'table',
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type.toLocaleLowerCase() || 'unknown',
        nullable: column.notnull === 0,
      })),
    }
  })
}

export function GET() {
  return NextResponse.json({ tables: schemaTables() })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
  }

  const input = body as { sql?: unknown; maxRows?: unknown }
  if (typeof input.sql !== 'string' || !input.sql.trim()) {
    return NextResponse.json({ error: 'Missing SQL query' }, { status: 400 })
  }
  const maxRows = Math.min(Math.max(Math.trunc(Number(input.maxRows)) || 500, 1), 5_000)

  try {
    const sql = validateReadOnlySql(input.sql)
    const started = performance.now()
    const statement = database.prepare(`select * from (${sql}) as appkit_query limit ?`)
    const allRows = statement.all(maxRows + 1) as Record<string, unknown>[]
    const truncated = allRows.length > maxRows
    const rows = truncated ? allRows.slice(0, maxRows) : allRows
    return NextResponse.json({
      columns: statement.columns().map((column) => column.name),
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Query failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
