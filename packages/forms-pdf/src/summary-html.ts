import { color } from '@appkit/tokens'
import { escapeHtml } from './shared'
import type { FormPdfInput } from './types'

export function renderFormSummaryHtml(input: FormPdfInput): string {
  const rows = input.fields.length
    ? input.fields.map((field) => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value)}</td></tr>`).join('')
    : '<tr><td class="empty">No details captured.</td></tr>'
  const sections = (input.sections ?? []).map((section) => `<section><h2>${escapeHtml(section.label)}</h2><table><thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(row[column.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${section.moreRows ? `<p class="more">+ ${section.moreRows} more ${section.moreRows === 1 ? 'row' : 'rows'} not shown.</p>` : ''}</section>`).join('')
  const photos = input.photos?.length ? `<section><h2>Photos</h2><div class="photos">${input.photos.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="">${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}</figure>`).join('')}</div></section>` : ''
  return `<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:${color('fg')}}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}.subtitle,.reference,.more,figcaption{color:${color('fg-muted')}}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid ${color('border')};padding:7px 10px;vertical-align:top;text-align:left}th{background:${color('bg-subtle')};color:${color('fg')};font-weight:600}.details th{width:34%}.empty{color:${color('fg-subtle')}}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos figure{margin:0}.photos img{width:100%;max-height:340px;object-fit:contain;border:1px solid ${color('border')};border-radius:4px}figcaption{font-size:10px;margin-top:3px}</style><h1>${escapeHtml(input.title)}</h1>${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ''}${input.reference ? `<p class="reference">Reference: ${escapeHtml(input.reference)}</p>` : ''}<table class="details"><tbody>${rows}</tbody></table>${sections}${photos}`
}
