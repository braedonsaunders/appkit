import { reportColumn, type ReportEntity } from './entities'
import type { ReportRuleGroup } from './filters'
import type { ReportRowScopeRule } from './types'

export type ReportDrillCodec<T> = {
  encode(target: T): string
  parse(raw: string | null): T | null
}

/**
 * URL drill state is untrusted input. This factory preserves the source
 * implementation's bounded, fail-closed contract while allowing each app to
 * validate its own target vocabulary.
 */
export function createReportDrillCodec<T>(
  validate: (value: unknown) => T | null,
  options: { maxLength?: number } = {},
): ReportDrillCodec<T> {
  const maxLength = Math.max(256, Math.min(64_000, Math.trunc(options.maxLength ?? 8_000)))
  return {
    encode(target) {
      const encoded = JSON.stringify(target)
      if (encoded.length > maxLength) throw new Error('Report drill target is too large')
      return encoded
    },
    parse(raw) {
      if (!raw || raw.length > maxLength) return null
      try {
        return validate(JSON.parse(raw))
      } catch {
        return null
      }
    },
  }
}

const SCOPE_FIELD_RE = /^[a-z][a-z0-9_]{0,62}$/
const SCOPE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates an untrusted aggregate-drill scope (the `rowKeys` entry a viewer
 * round-trips through URL state): per-breakout predicates, each with exactly
 * one shape — eq value, inclusive date range, or null-bucket marker. Bounded
 * and fail-closed: any malformed entry rejects the whole scope. Use inside a
 * drill codec's validate function.
 */
export function parseReportDrillScope(raw: unknown): ReportRowScopeRule[] | null {
  if (!Array.isArray(raw) || raw.length > 8) return null
  const clean: ReportRowScopeRule[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const { field, value, from, to, empty } = entry as Record<string, unknown>
    if (typeof field !== 'string' || !SCOPE_FIELD_RE.test(field)) return null
    if (empty === true) clean.push({ field, empty: true })
    else if (typeof from === 'string' && SCOPE_DATE_RE.test(from) && typeof to === 'string' && SCOPE_DATE_RE.test(to)) clean.push({ field, from, to })
    else if ((typeof value === 'string' || typeof value === 'number') && String(value).length <= 256) clean.push({ field, value: String(value) })
    else return null
  }
  return clean
}

/**
 * Compiles a validated drill scope into the filter group that selects exactly
 * the clicked bucket's rows (AND of eq / gte+lte / is_null predicates). Fields
 * are checked against the entity catalogue at load time; an unknown or
 * internal field fails the whole scope closed — better no rows than the wrong
 * rows.
 */
export function reportDrillScopeFilter(entity: ReportEntity, scope: ReportRowScopeRule[]): ReportRuleGroup {
  const rules: ReportRuleGroup['rules'] = []
  for (const item of scope) {
    const column = reportColumn(entity, item.field)
    if (!column || column.hidden) throw new Error(`Report drill scope references an unknown column: ${item.field}`)
    if ('empty' in item) rules.push({ field: item.field, op: 'is_null' })
    else if ('from' in item) {
      rules.push({ field: item.field, op: 'gte', value: item.from })
      rules.push({ field: item.field, op: 'lte', value: item.to })
    } else rules.push({ field: item.field, op: 'eq', value: item.value })
  }
  return { combinator: 'and', rules }
}
