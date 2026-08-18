'use client'

import { useMemo } from 'react'
import {
  createHttpQueryConsoleAdapter,
  type QuerySnippet,
} from '@braedonsaunders/appkit-query-console'
import { QueryConsole } from '@braedonsaunders/appkit-query-console/react'

const STARTER_SQL = `select project_name,
       invoice_count,
       printf('$%.2f', invoiced_cents / 100.0) as invoiced,
       printf('$%.2f', paid_cents / 100.0) as paid
  from project_summary
 order by invoiced_cents desc`

const SNIPPETS: QuerySnippet[] = [
  {
    key: 'project-summary',
    label: 'Project summary',
    description: 'Invoice and payment totals from the governed reporting view.',
    sql: STARTER_SQL,
  },
  {
    key: 'open-invoices',
    label: 'Open invoices',
    description: 'Outstanding invoices ordered by due date.',
    sql: `select invoice_number, project_name, due_on, amount_cents
  from invoices
 where status = 'open'
 order by due_on`,
  },
  {
    key: 'status-counts',
    label: 'Projects by status',
    description: 'Count and budget by the current project state.',
    sql: `select status,
       count(*) as projects,
       sum(budget_cents) as budget_cents
  from projects
 group by status
 order by projects desc`,
  },
]

export function QueryConsoleWorkbench() {
  const adapter = useMemo(() => createHttpQueryConsoleAdapter({
    executeUrl: '/api/demo/query-console',
    schemaUrl: '/api/demo/query-console',
  }), [])

  return (
    <QueryConsole
      adapter={adapter}
      starterSql={STARTER_SQL}
      snippets={SNIPPETS}
      storageNamespace="appkit.playground.queryConsole"
      labels={{
        subtitle: 'Live read-only SQLite demo. Production hosts inject their tenant-scoped PostgreSQL executor.',
      }}
      className="h-full min-h-0"
    />
  )
}
