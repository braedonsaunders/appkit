// Render a compiled design against real or sample values. Shared by the live
// preview in the designer and by whatever sends the final message, so what an
// author previews is produced by the same code path that ships.

import { htmlToPlainText, renderTemplate } from '@appkitjs/email-render'
import type { EmailCollection, EmailMergeField } from './types'
import { safeTemplateKey } from './blocks'

export type RenderedEmailDesign = { html: string; text: string }

/**
 * Render `compiledHtml` with `{{token}}` and `{{#each}}` blocks resolved against
 * `values`. Substituted values are HTML-escaped, so untrusted data cannot inject
 * markup into the already-sanitized design.
 */
export function renderEmailDesign(
  compiledHtml: string,
  values: Record<string, unknown>,
): RenderedEmailDesign {
  if (!compiledHtml.trim()) return { html: '', text: '' }
  const html = renderTemplate(compiledHtml, values, { escapeHtml: true })
  return { html, text: htmlToPlainText(html) }
}

/**
 * Build a placeholder value map from the field catalog. Dotted keys become
 * nested objects so `{{agent.name}}` resolves the way it will at send time.
 */
export function sampleMergeValues(
  fields: EmailMergeField[] = [],
  collections: EmailCollection[] = [],
  rows = 2,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const key = safeTemplateKey(field.key)
    if (!key) continue
    setPath(values, key, field.sample ?? field.label ?? key)
  }
  for (const collection of collections) {
    const key = safeTemplateKey(collection.key)
    if (!key) continue
    const items = Array.from({ length: Math.max(0, rows) }, (_, index) => {
      const item: Record<string, unknown> = {}
      for (const column of collection.fields) {
        const columnKey = safeTemplateKey(column.key)
        if (columnKey) setPath(item, columnKey, `${column.label} ${index + 1}`)
      }
      return item
    })
    setPath(values, key, items)
  }
  return values
}

/** Assign `a.b.c` into nested plain objects, never overwriting a non-object. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    const next = cursor[part]
    if (!isPlainObject(next)) cursor[part] = {}
    cursor = cursor[part] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]!] = value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
