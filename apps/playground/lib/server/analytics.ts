import 'server-only'

import { compileQuery, type AnalyticsCatalog, type InsightQuery, type QueryResult } from '@appkit/analytics/server'
import { getDemoEnvironment } from './demo-context'
import { executeDemoQueryInMemory } from './demo-analytics-memory'
import { isDatabaseConfigured, platform } from './platform'

/**
 * The app owns this semantic catalogue. appkit owns parsing, validation,
 * compilation, rendering, and the builder UI; no domain table names leak into
 * those packages.
 */
export const DEMO_ANALYTICS_CATALOG: AnalyticsCatalog = {
  sources: [
    {
      key: 'members',
      label: 'Team members',
      description: 'Workspace memberships joined to their user and role records.',
      from: 'tenant_users m join users u on u.id = m.user_id left join role_assignments ra on ra.tenant_user_id = m.id and ra.tenant_id = m.tenant_id left join roles r on r.id = ra.role_id and r.tenant_id = m.tenant_id',
      tenantColumn: 'm.tenant_id',
      detailColumns: ['name', 'email', 'role', 'joined_at'],
      defaultSort: { field: 'joined_at', direction: 'desc' },
      fields: [
        { key: 'name', label: 'Name', expression: 'm.display_name', semanticType: 'text', canDimension: true },
        { key: 'email', label: 'Email', expression: 'u.email', semanticType: 'text', canDimension: true },
        { key: 'role', label: 'Role', expression: "coalesce(r.name, 'Unassigned')", semanticType: 'category', canDimension: true },
        { key: 'active', label: 'Active', expression: 'u.is_active', semanticType: 'boolean', canDimension: true },
        { key: 'joined_at', label: 'Joined at', expression: 'm.created_at', semanticType: 'date', canDimension: true, canBin: true },
      ],
    },
    {
      key: 'roles',
      label: 'Roles',
      description: 'Role definitions and their permission sets.',
      from: 'roles r',
      tenantColumn: 'r.tenant_id',
      detailColumns: ['name', 'key', 'created_at'],
      fields: [
        { key: 'name', label: 'Name', expression: 'r.name', semanticType: 'category', canDimension: true },
        { key: 'key', label: 'Key', expression: 'r.key', semanticType: 'text', canDimension: true },
        { key: 'created_at', label: 'Created at', expression: 'r.created_at', semanticType: 'date', canDimension: true, canBin: true },
      ],
    },
    {
      key: 'audit',
      label: 'Audit activity',
      description: 'Append-only workspace activity recorded by appkit events.',
      from: 'audit_log a',
      tenantColumn: 'a.tenant_id',
      detailColumns: ['action', 'entity_type', 'summary', 'created_at'],
      defaultSort: { field: 'created_at', direction: 'desc' },
      fields: [
        { key: 'action', label: 'Action', expression: 'a.action', semanticType: 'category', canDimension: true },
        { key: 'entity_type', label: 'Entity type', expression: 'a.entity_type', semanticType: 'category', canDimension: true },
        { key: 'summary', label: 'Summary', expression: 'a.summary', semanticType: 'text', canDimension: true },
        { key: 'created_at', label: 'Occurred at', expression: 'a.created_at', semanticType: 'date', canDimension: true, canBin: true },
      ],
    },
  ],
}

export async function executeDemoQuery(query: InsightQuery): Promise<QueryResult> {
  if (!isDatabaseConfigured()) return executeDemoQueryInMemory(query, DEMO_ANALYTICS_CATALOG)

  const { tenant } = await getDemoEnvironment()
  const compiled = compileQuery(query, tenant.id, DEMO_ANALYTICS_CATALOG)
  const started = performance.now()
  const response = await platform().appkit.withTenantContext(tenant.id, () =>
    platform().appkit.pool.query<Record<string, unknown>>(compiled.sql, compiled.params),
  )
  const truncated = response.rows.length > compiled.limit
  const rows = response.rows.slice(0, compiled.limit).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])))
  return {
    columns: compiled.columns,
    rows,
    rowCount: rows.length,
    truncated,
    durationMs: Math.max(1, Math.round(performance.now() - started)),
  }
}
