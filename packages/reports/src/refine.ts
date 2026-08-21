// Document refinement — makes discovered entities print like documents, not
// database dumps. Applied by the REPORTS layer only (studio picker + every
// executor map); analytics and public API consumers keep the raw catalogue.
//
//   • jsonb/array columns (discovery flags them `arrayUnnest`) are DROPPED —
//     raw JSON never belongs in a printed report.
//   • Foreign-key uuid columns with a discovered relation are RESOLVED to the
//     target's display column via a scalar subselect (e.g. site_org_unit_id →
//     the org unit's name). Same column key, so saved plans keep working;
//     label loses the "ID" suffix and the kind becomes text.
//   • Filters on those resolved columns still hit the physical identifier so
//     pick-list UUIDs keep matching after the display expression changes.
//   • Related table fields (status, employee number, …) are exposed as
//     `via.column` expressions so a report can filter a PPE item by its
//     holder's employment status without a hand-built view.
//
// Injection safety: every identifier comes from the schema-discovered
// catalog (table names, physical column names, single-column FKs) — never
// from user input.

import type { ReportEntity, ReportEntityColumn } from './entities'

/** Structural relation contract kept local so
 *  this package never depends on analytics (the graph stays one-way). */
type RelationLike = {
  via: string
  target: string
  foreignColumn: string
  label: string
}

type RefinableColumn = ReportEntityColumn & { arrayUnnest?: 'array' | 'jsonb' }
type RefinableEntity = ReportEntity & {
  columns: RefinableColumn[]
  relations?: RelationLike[]
}

/** Physical display-column preference for a relation target, best first. */
const DISPLAY_PREFERENCE = [
  'name',
  'title',
  'display_name',
  'full_name',
  'label',
  'reference',
  'course_name',
  'certification_name',
  'asset_tag',
  'serial_number',
  'key',
  'slug',
  'email',
] as const

const RELATED_SKIP = new Set([
  'id',
  'tenant_id',
  'deleted_at',
  'created_at',
  'updated_at',
  'metadata',
])

const IDENT_RE = /^[a-z_][a-z0-9_]*$/i

function q(ident: string): string {
  return `"${ident}"`
}

function physicalTable(entity: ReportEntity | undefined): string | null {
  const table = entity?.table ?? entity?.from
  return table && IDENT_RE.test(table) ? table : null
}

function physicalColumn(column: ReportEntityColumn): string | null {
  const name = column.sql ?? column.key
  return IDENT_RE.test(name) ? name : null
}

function physicalRef(table: string, column: string): string {
  return `${q(table)}.${q(column)}`
}

function relatedSubselect(
  targetTable: string,
  foreignColumn: string,
  sourceTable: string,
  via: string,
  display: string,
): string {
  return `(SELECT ${display} FROM ${q(targetTable)} "_ref" WHERE "_ref".${q(foreignColumn)} = ${physicalRef(sourceTable, via)})`
}

/** SQL expression (against alias `_ref`) that best names one row of `target`,
 *  or null when the target has no usable display column. */
function displayExprFor(target: ReportEntity): string | null {
  const physical = new Map<string, string>()
  for (const c of target.columns) {
    const name = c.sql ?? c.key
    const expression = c.expression ?? c.expr ?? name
    const plain = expression === name || expression === c.key
    const qualified = new RegExp(`^(?:"?[a-z_][a-z0-9_]*"?\\.)?"?${name}"?$`, 'i').test(expression)
    if (!plain && !qualified) continue
    if (IDENT_RE.test(name)) physical.set(name, name)
  }
  // People-style names read better as "Last, First".
  if (physical.has('last_name') && physical.has('first_name')) {
    return `("_ref".${q('last_name')} || ', ' || "_ref".${q('first_name')})`
  }
  for (const pref of DISPLAY_PREFERENCE) {
    if (physical.has(pref)) return `"_ref".${q(pref)}`
  }
  return null
}

function relatedColumnsFor(
  rel: RelationLike,
  sourceTable: string,
  target: ReportEntity,
  targetTable: string,
  existingKeys: Set<string>,
): ReportEntityColumn[] {
  const extras: ReportEntityColumn[] = []
  for (const column of target.columns) {
    if (column.hidden || column.arrayUnnest) continue
    if (RELATED_SKIP.has(column.key) || column.kind === 'uuid') continue
    if (column.key.endsWith('_id')) continue
    const name = physicalColumn(column)
    if (!name) continue
    const key = `${rel.via}.${column.key}`
    if (existingKeys.has(key)) continue
    extras.push({
      key,
      label: `${rel.label} · ${column.label}`,
      kind: column.kind,
      expression: relatedSubselect(targetTable, rel.foreignColumn, sourceTable, rel.via, `"_ref".${q(name)}`),
      filterOptions: column.filterOptions,
    })
    existingKeys.add(key)
    if (extras.length >= 16) break
  }
  return extras
}

/** Refine one entity: drop jsonb/array columns, resolve FK uuid columns whose
 *  relation target (looked up in `resolveTarget`) has a display column. */
export function refineReportEntityForDocuments(
  entity: ReportEntity,
  resolveTarget: (key: string) => ReportEntity | undefined,
): ReportEntity {
  const e = entity as RefinableEntity
  const sourceTable = physicalTable(e)
  const relationByVia = new Map<string, RelationLike>()
  for (const r of e.relations ?? []) relationByVia.set(r.via, r)

  let changed = false
  const columns: ReportEntityColumn[] = []
  const existingKeys = new Set<string>()
  for (const col of e.columns) {
    if (col.arrayUnnest) {
      changed = true
      continue
    }
    const rel = col.kind === 'uuid' ? relationByVia.get(col.sql ?? col.key) : undefined
    if (
      !rel ||
      !sourceTable ||
      !IDENT_RE.test(rel.via) ||
      !IDENT_RE.test(rel.foreignColumn)
    ) {
      columns.push(col)
      existingKeys.add(col.key)
      continue
    }
    const target = resolveTarget(rel.target)
    const targetTable = physicalTable(target)
    const display = target && targetTable ? displayExprFor(target) : null
    if (!display || !target || !targetTable) {
      columns.push(col)
      existingKeys.add(col.key)
      continue
    }
    changed = true
    existingKeys.add(col.key)
    columns.push({
      ...col,
      label: rel.label,
      kind: 'text',
      expression: relatedSubselect(targetTable, rel.foreignColumn, sourceTable, rel.via, display),
      filterExpression: physicalRef(sourceTable, rel.via),
      sql: col.sql ?? col.key,
    })
  }

  if (sourceTable) {
    for (const rel of e.relations ?? []) {
      if (!IDENT_RE.test(rel.via) || !IDENT_RE.test(rel.foreignColumn)) continue
      const target = resolveTarget(rel.target)
      const targetTable = physicalTable(target)
      if (!target || !targetTable) continue
      const extras = relatedColumnsFor(rel, sourceTable, target, targetTable, existingKeys)
      if (extras.length) {
        changed = true
        columns.push(...extras)
      }
    }
  }

  return changed ? { ...entity, columns } : entity
}

/** Refine a list (the studio's source picker). Targets resolve within the same
 *  list so FK labels line up with what the picker offers. */
export function refineReportEntitiesForDocuments(entities: ReportEntity[]): ReportEntity[] {
  const byKey = new Map(entities.map((e) => [e.key, e]))
  return entities.map((e) => refineReportEntityForDocuments(e, (k) => byKey.get(k)))
}

/** Refine an executor entity map lazily (it may be a Proxy that resolves
 *  scoped per-app keys on demand, so eager enumeration is not an option). */
export function refineEntityMapForDocuments(
  map: Record<string, ReportEntity>,
): Record<string, ReportEntity> {
  const cache = new Map<string, ReportEntity>()
  const resolve = (key: string): ReportEntity | undefined => {
    if (cache.has(key)) return cache.get(key)
    const raw = map[key]
    if (!raw) return undefined
    const refined = refineReportEntityForDocuments(raw, (k) => map[k])
    cache.set(key, refined)
    return refined
  }
  return new Proxy({} as Record<string, ReportEntity>, {
    get(_t, prop) {
      return typeof prop === 'string' ? resolve(prop) : undefined
    },
    has(_t, prop) {
      return typeof prop === 'string' && prop in map
    },
  })
}
