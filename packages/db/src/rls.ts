// Row-Level Security for tenant isolation.
//
// Every tenant-owned table enforces isolation with FORCE ROW LEVEL SECURITY and
// a SINGLE-equality policy:
//     tenant_id = current_setting('app.tenant_id')::uuid
// A single equality (no `OR bypass` branch) stays index-usable — the planner can
// push it into a (tenant_id, …) composite index. Cross-tenant / super-admin
// access runs on a dedicated BYPASSRLS role (see `createDb({ superUrl })`), NOT
// an `OR current_setting('app.bypass') = 'on'` branch, which would degrade every
// RLS query to a Seq Scan.
//
// FORCE ROW LEVEL SECURITY is defense in depth: runtime traffic uses a non-owner
// DML role, and FORCE means even the table owner is subject to the policy.
//
// nullif(current_setting('app.tenant_id', true), '') maps the empty-string a
// custom GUC reverts to (after a SET LOCAL ends on a pooled connection) to NULL,
// so the cast never throws and an unscoped query simply matches no rows.

const TENANT_ID_SQL = `nullif(current_setting('app.tenant_id', true), '')::uuid`

/** SQL to install RLS on one tenant-scoped table. Idempotent (drops + recreates).
 *  `globallyReadable`: rows with `tenant_id IS NULL` are readable by any tenant
 *  (e.g. built-in templates), but never writable by runtime roles. */
export function rlsPolicySql(table: string, opts?: { globallyReadable?: boolean }): string {
  const reset = `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ${table};
DROP POLICY IF EXISTS tenant_write_insert ON ${table};
DROP POLICY IF EXISTS tenant_write_update ON ${table};
DROP POLICY IF EXISTS tenant_write_delete ON ${table};`

  if (opts?.globallyReadable) {
    return `${reset}
CREATE POLICY tenant_isolation ON ${table}
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = ${TENANT_ID_SQL});
CREATE POLICY tenant_write_insert ON ${table}
  FOR INSERT WITH CHECK (tenant_id = ${TENANT_ID_SQL});
CREATE POLICY tenant_write_update ON ${table}
  FOR UPDATE USING (tenant_id = ${TENANT_ID_SQL}) WITH CHECK (tenant_id = ${TENANT_ID_SQL});
CREATE POLICY tenant_write_delete ON ${table}
  FOR DELETE USING (tenant_id = ${TENANT_ID_SQL});
`
  }

  return `${reset}
CREATE POLICY tenant_isolation ON ${table}
  USING (tenant_id = ${TENANT_ID_SQL})
  WITH CHECK (tenant_id = ${TENANT_ID_SQL});
`
}

/** Install RLS across a set of tenant-scoped tables. Run after migrations. */
export function installRlsSql(
  tables: readonly (string | { table: string; globallyReadable?: boolean })[],
): string {
  return tables
    .map((t) => (typeof t === 'string' ? rlsPolicySql(t) : rlsPolicySql(t.table, t)))
    .join('\n')
}
