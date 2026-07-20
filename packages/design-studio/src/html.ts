import type { DesignArtboard, DesignData, DesignDocument, DesignElement } from './schema'
import { hexColor } from '@appkit/tokens'

export function valueForField(field: string, data: DesignData): string {
  const value = field.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, data)
  if (value === null || value === undefined) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

export function renderDesignDocumentHtml(document: DesignDocument, data: DesignData, options: { artboardId?: string; title?: string } = {}): string {
  const selected = options.artboardId ? document.artboards.filter((item) => item.id === options.artboardId) : document.artboards
  const artboards = selected.length ? selected : document.artboards
  const first = artboards[0]
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(options.title ?? document.name)}</title><style>@page{size:${first?.width ?? 11}in ${first?.height ?? 8.5}in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ds-page{position:relative;overflow:hidden;break-after:page}.ds-page:last-child{break-after:auto}.ds-el{position:absolute;transform-origin:top left;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${artboards.map((item) => renderArtboard(item, data)).join('')}</body></html>`
}

export function renderDesignDocumentsHtml(pages: { document: DesignDocument; data: DesignData }[], title = 'Design document'): string {
  const documents = pages.flatMap(({ document, data }) => document.artboards.map((artboard) => ({ artboard, data })))
  const first = documents[0]?.artboard
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${first?.width ?? 11}in ${first?.height ?? 8.5}in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ds-page{position:relative;overflow:hidden;break-after:page}.ds-page:last-child{break-after:auto}.ds-el{position:absolute;transform-origin:top left;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${documents.map(({ artboard, data }) => renderArtboard(artboard, data)).join('')}</body></html>`
}

function renderArtboard(artboard: DesignArtboard, data: DesignData): string { return `<section class="ds-page" data-artboard="${esc(artboard.id)}" style="width:${artboard.width}in;height:${artboard.height}in;background:${esc(artboard.background)}">${artboard.elements.filter((item) => item.visible !== false).map((item) => renderElement(item, data)).join('')}</section>` }

function renderElement(element: DesignElement, data: DesignData): string {
  const base = `left:${element.x}in;top:${element.y}in;width:${element.width}in;height:${element.height}in;opacity:${element.opacity ?? 1};transform:${element.rotation ? `rotate(${element.rotation}deg)` : 'none'};`
  if (element.kind === 'text' || element.kind === 'field') {
    let text = element.kind === 'text' ? element.text : valueForField(element.field, data) || element.fallback || ''
    if (element.kind === 'field' && text) { if (element.transform === 'uppercase') text = text.toUpperCase(); if (element.transform?.startsWith('date-')) text = formatDate(text, element.transform === 'date-long'); text = `${element.prefix ?? ''}${text}${element.suffix ?? ''}` }
    const align = element.align ?? 'left'
    return `<div class="ds-el" style="${base}font-family:${esc(element.fontFamily ?? 'Arial, sans-serif')};font-size:${element.fontSize ?? 12}pt;font-weight:${element.fontWeight ?? '600'};font-style:${element.fontStyle ?? 'normal'};color:${esc(element.color ?? hexColor('fg'))};text-align:${align};letter-spacing:${element.letterSpacing ?? 0}in;line-height:${element.lineHeight ?? 1.15};display:flex;align-items:center;justify-content:${align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'}">${esc(text)}</div>`
  }
  if (element.kind === 'image') {
    const source = element.field ? valueForField(element.field, data) : element.url ?? ''
    return source
      ? `<img class="ds-el" alt="" src="${esc(source)}" style="${base}object-fit:${element.fit ?? 'contain'};border-radius:${element.radius ?? 0}in">`
      : `<div class="ds-el" style="${base}border:.01in dashed ${hexColor('border-strong')};border-radius:${element.radius ?? 0}in;background:${hexColor('bg-subtle')};color:${hexColor('fg-subtle')};font-size:6pt;display:flex;align-items:center;justify-content:center">${esc(element.name)}</div>`
  }
  if (element.kind === 'qr') {
    const source = valueForField(element.field, data)
    return source
      ? `<img class="ds-el" alt="" src="${esc(source)}" style="${base}background:${esc(element.background ?? hexColor('surface'))};padding:.03in">`
      : `<div class="ds-el" style="${base}background:${esc(element.background ?? hexColor('surface'))};border:.01in solid ${hexColor('border-strong')};color:${esc(element.foreground ?? hexColor('fg'))};font-size:8pt;display:flex;align-items:center;justify-content:center">QR</div>`
  }
  if (element.kind === 'seal') {
    const organization = valueForField('organization.name', data) || valueForField('tenant.name', data)
    const initials = organization.split(/\s+/).filter(Boolean).map((word) => word[0]?.toUpperCase()).slice(0, 2).join('')
    return `<div class="ds-el" style="${base}border-radius:50%;background:${esc(element.fill ?? hexColor('primary'))};border:.025in solid ${esc(element.stroke ?? hexColor('primary-active'))};display:flex;align-items:center;justify-content:center;color:${hexColor('primary-fg')};font-weight:800">${esc(element.text || initials || 'OK')}</div>`
  }
  const borderRadius = element.kind === 'ellipse' ? '50%' : `${element.radius ?? 0}in`
  const line = element.kind === 'line' ? `border-top:${element.strokeWidth ?? .01}in solid ${esc(element.stroke ?? hexColor('fg'))};height:0` : `background:${esc(element.fill ?? 'transparent')};border:${element.strokeWidth ?? 0}in solid ${esc(element.stroke ?? 'transparent')};border-radius:${borderRadius}`
  return `<div class="ds-el" style="${base}${line}"></div>`
}

const formatDate = (value: string, long: boolean) => { const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); if (!match) return value; const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); return new Intl.DateTimeFormat('en-US', { dateStyle: long ? 'long' : 'medium', timeZone: 'UTC' }).format(date) }
const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
