import type { IntegrationItem, Scalar } from './types'
const SINGLE = /^\{\{\s*([\w.]+)\s*\}\}$/
const ANY = /\{\{\s*([\w.]+)\s*\}\}/g
export function resolveValue(
  expression: unknown,
  item: IntegrationItem,
): Scalar {
  if (expression === null) return null
  if (typeof expression === 'number')
    return Number.isFinite(expression) ? expression : null
  if (typeof expression === 'boolean') return expression
  if (typeof expression !== 'string') return null
  const single = expression.match(SINGLE)
  if (single) return item[single[1] ?? ''] ?? null
  return expression.includes('{{') ? resolveText(expression, item) : expression
}
export function resolveText(template: string, item: IntegrationItem): string {
  return template.replace(ANY, (_match, key: string) => {
    const value = item[key]
    return value == null ? '' : String(value)
  })
}
