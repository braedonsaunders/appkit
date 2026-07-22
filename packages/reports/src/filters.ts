import { reportColumnExpression, type ReportEntity } from './entities'
import { resolvePreset } from './period-presets'

export const REPORT_FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'not_in', 'gte', 'lte', 'contains',
  'is_null', 'is_not_null', 'is_true', 'is_false',
  'between_days_ago', 'due_within_days', 'since_today',
  'this_week', 'this_month', 'this_year', 'before_now',
  'period_preset',
] as const
export type ReportFilterOperator = (typeof REPORT_FILTER_OPERATORS)[number]
export type ReportRule = { field: string; op: ReportFilterOperator; value?: string | number | boolean | string[] | number[] | null }
export type ReportRuleGroup = { combinator: 'and' | 'or'; not?: boolean; rules: (ReportRule | ReportRuleGroup)[] }

export type ReportFilterOperatorMeta = { key: ReportFilterOperator; label: string; needsValue: 'none' | 'one' | 'list' }
const META_ROWS: [ReportFilterOperator, string, ReportFilterOperatorMeta['needsValue']][] = [
  ['eq', 'is', 'one'], ['neq', 'is not', 'one'], ['in', 'is any of', 'list'], ['not_in', 'is none of', 'list'],
  ['gte', 'is at least', 'one'], ['lte', 'is at most', 'one'], ['contains', 'contains', 'one'],
  ['is_null', 'is empty', 'none'], ['is_not_null', 'is not empty', 'none'], ['is_true', 'is true', 'none'], ['is_false', 'is false', 'none'],
  ['between_days_ago', 'is within the last days', 'one'], ['due_within_days', 'is due within days', 'one'],
  ['since_today', 'is today', 'none'], ['this_week', 'is this week', 'none'], ['this_month', 'is this month', 'none'], ['this_year', 'is this year', 'none'], ['before_now', 'is before now', 'none'],
  ['period_preset', 'is in period', 'one'],
]
const OPERATOR_META = Object.fromEntries(META_ROWS.map(([key, label, needsValue]) => [key, { key, label, needsValue }])) as Record<ReportFilterOperator, ReportFilterOperatorMeta>

export function operatorsForKind(kind: ReportEntity['columns'][number]['kind']): ReportFilterOperatorMeta[] {
  const keys: ReportFilterOperator[] = kind === 'boolean'
    ? ['is_true', 'is_false', 'is_null', 'is_not_null']
    : kind === 'date' || kind === 'timestamp'
      ? ['eq', 'gte', 'lte', 'period_preset', 'between_days_ago', 'due_within_days', 'since_today', 'this_week', 'this_month', 'this_year', 'before_now', 'is_null', 'is_not_null']
      : kind === 'number'
        ? ['eq', 'neq', 'gte', 'lte', 'in', 'not_in', 'is_null', 'is_not_null']
        : kind === 'enum'
          ? ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null']
          : ['eq', 'neq', 'contains', 'in', 'not_in', 'is_null', 'is_not_null']
  return keys.map((key) => OPERATOR_META[key])
}

export class SqlParameters {
  readonly values: unknown[] = []
  add(value: unknown): string { this.values.push(value); return `$${this.values.length}` }
}

export function compileReportRule(
  entity: ReportEntity,
  rule: ReportRule,
  parameters: SqlParameters,
  now = new Date(),
  fiscalStartMonth = 1,
): string | null {
  const column = reportColumnExpression(entity, rule.field)
  if (!column) return null
  const value = rule.value
  const present = value !== null && value !== undefined && value !== ''
  switch (rule.op) {
    case 'eq': return present ? `${column} = ${parameters.add(value)}` : null
    case 'neq': return present ? `${column} <> ${parameters.add(value)}` : null
    case 'in': case 'not_in': {
      if (!Array.isArray(value) || !value.length) return null
      const list = value.map((entry) => parameters.add(entry)).join(', ')
      return `${column} ${rule.op === 'not_in' ? 'NOT ' : ''}IN (${list})`
    }
    case 'gte': return present ? `${column} >= ${parameters.add(value)}` : null
    case 'lte': return present ? `${column} <= ${parameters.add(value)}` : null
    case 'contains': return present ? `${column}::text ILIKE ${parameters.add(`%${String(value)}%`)}` : null
    case 'is_null': return `${column} IS NULL`
    case 'is_not_null': return `${column} IS NOT NULL`
    case 'is_true': return `${column} IS TRUE`
    case 'is_false': return `${column} IS FALSE`
    case 'between_days_ago': {
      const days = Number(value ?? 30)
      return Number.isFinite(days) ? `${column} >= ${parameters.add(new Date(now.getTime() - days * 86_400_000).toISOString())}` : null
    }
    case 'due_within_days': {
      const days = Number(value ?? 30)
      return Number.isFinite(days) ? `${column} <= ${parameters.add(new Date(now.getTime() + days * 86_400_000).toISOString())}` : null
    }
    case 'since_today': return currentPeriod(column, 'day')
    case 'this_week': return currentPeriod(column, 'week')
    case 'this_month': return currentPeriod(column, 'month')
    case 'this_year': return currentPeriod(column, 'year')
    case 'before_now': return `${column} < now()`
    case 'period_preset': {
      if (typeof value !== 'string') return null
      const range = resolvePreset(value, { today: now.toISOString().slice(0, 10), startMonth: fiscalStartMonth })
      if (!range) return null
      return `(${column} >= ${parameters.add(range.from)} AND ${column} <= ${parameters.add(range.to)})`
    }
  }
}

export function compileReportRuleGroup(
  entity: ReportEntity,
  group: ReportRuleGroup,
  parameters: SqlParameters,
  options: { maxDepth?: number; maxRules?: number; now?: Date; fiscalStartMonth?: number } = {},
): string | null {
  let count = 0
  const maxDepth = options.maxDepth ?? 5
  const maxRules = options.maxRules ?? 60
  const walk = (current: ReportRuleGroup, depth: number): string | null => {
    if (depth > maxDepth) throw new Error('Filter tree is nested too deeply')
    const parts: string[] = []
    for (const item of current.rules) {
      if (++count > maxRules) throw new Error('Filter tree contains too many rules')
      const compiled = isRuleGroup(item)
        ? walk(item, depth + 1)
        : compileReportRule(entity, item, parameters, options.now, options.fiscalStartMonth)
      if (compiled) parts.push(compiled)
    }
    if (!parts.length) return null
    const joined = parts.length === 1 ? parts[0]! : `(${parts.join(current.combinator === 'or' ? ' OR ' : ' AND ')})`
    return current.not ? `NOT (${joined})` : joined
  }
  return walk(group, 1)
}

function isRuleGroup(value: ReportRule | ReportRuleGroup): value is ReportRuleGroup {
  return 'rules' in value
}
function currentPeriod(column: string, unit: 'day' | 'week' | 'month' | 'year'): string {
  return `(${column} >= date_trunc('${unit}', now()) AND ${column} < date_trunc('${unit}', now()) + interval '1 ${unit}')`
}
