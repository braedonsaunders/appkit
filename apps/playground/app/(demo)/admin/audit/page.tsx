import { desc } from 'drizzle-orm'
import { auditLog } from '@appkit/db'
import {
  Badge,
  EmptyState,
  PageContainer,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appkit/ui'
import { ScrollText } from 'lucide-react'
import { getDemoEnvironment } from '../../../../lib/server/demo-context'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit log — appkit' }

export default async function AuditPage() {
  const { ctx } = await getDemoEnvironment()
  const rows = await ctx.db((db) =>
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        summary: auditLog.summary,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(100),
  )

  return (
    <PageContainer>
      <PageHeader
        title="Audit log"
        description="Review changes made across the workspace."
        back={{ href: '/admin', label: 'Administration' }}
      />
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow noAnimate>
              <TableHead>Event</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><Badge variant="secondary">{row.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-fg-muted">{row.entityType}</TableCell>
                  <TableCell>{row.summary ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-muted">
                    {row.createdAt.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow noAnimate>
                <TableCell colSpan={4}>
                  <EmptyState
                    icon={<ScrollText />}
                    title="No audit events yet"
                    description="Workspace activity will appear here."
                    className="border-0 bg-transparent py-10 shadow-none"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  )
}
