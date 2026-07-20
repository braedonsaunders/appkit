import { hexColor } from '@appkit/tokens'

export const DESIGN_DOCUMENT_LIMITS = {
  maxJsonBytes: 512_000,
  maxArtboards: 12,
  maxElementsPerArtboard: 240,
  documentNameLength: 120,
  artboardNameLength: 80,
  elementNameLength: 80,
  fieldKeyLength: 160,
  textLength: 4_000,
  imageUrlLength: 2_000,
} as const

export type ArtboardFormat = 'letter-landscape' | 'letter-portrait' | 'cr80-front' | 'cr80-back' | 'label-4x6' | 'custom'
export type PrintProvider = 'browser-pdf' | 'cardpresso-wps' | 'zebra-browser-print' | 'evolis-sdk' | 'hid-fargo-sdk' | (string & {})
export type PrintProfile = { provider: PrintProvider; media: 'letter' | 'cr80' | 'custom'; duplex?: boolean; edgeToEdge?: boolean; orientation?: 'portrait' | 'landscape' }
export type DesignStudioTheme = { primary: string; accent: string; paper: string; ink: string; muted: string; typeface?: string }
export type DesignData = Record<string, unknown>
export type DesignFieldDefinition = { key: string; label: string; group?: string; semanticType?: 'text' | 'number' | 'date' | 'image' | 'qr'; example?: string }
export type DesignFieldCatalog = { fields: DesignFieldDefinition[] }

export type DesignDocument = { version: 1; engine: 'fabric'; kind: string; name: string; unit: 'in'; dpi: number; artboards: DesignArtboard[] }
export type DesignArtboard = { id: string; name: string; format: ArtboardFormat; width: number; height: number; background: string; bleed?: number; printProfile?: PrintProfile; elements: DesignElement[] }
export type BaseElement = { id: string; name: string; x: number; y: number; width: number; height: number; rotation?: number; opacity?: number; visible?: boolean; locked?: boolean }
export type TextStyle = { fontFamily?: string; fontSize?: number; fontWeight?: '400' | '500' | '600' | '700' | '800'; fontStyle?: 'normal' | 'italic'; color?: string; align?: 'left' | 'center' | 'right'; letterSpacing?: number; lineHeight?: number }
export type FillStroke = { fill?: string; stroke?: string; strokeWidth?: number; radius?: number }
export type DesignElement =
  | (BaseElement & TextStyle & { kind: 'text'; text: string })
  | (BaseElement & TextStyle & { kind: 'field'; field: string; fallback?: string; prefix?: string; suffix?: string; transform?: 'none' | 'uppercase' | 'date-long' | 'date-short' })
  | (BaseElement & FillStroke & { kind: 'rect' | 'ellipse' | 'line' })
  | (BaseElement & { kind: 'image'; field?: string; url?: string; fit?: 'cover' | 'contain'; radius?: number })
  | (BaseElement & { kind: 'qr'; field: string; background?: string; foreground?: string })
  | (BaseElement & { kind: 'seal'; text?: string; fill?: string; stroke?: string })

export function artboardSizeForFormat(format: ArtboardFormat): { width: number; height: number } {
  switch (format) {
    case 'letter-portrait': return { width: 8.5, height: 11 }
    case 'cr80-front': case 'cr80-back': return { width: 3.375, height: 2.125 }
    case 'label-4x6': return { width: 4, height: 6 }
    default: return { width: 11, height: 8.5 }
  }
}

export function createDesignDocument(input: { name: string; kind?: string; format?: ArtboardFormat; theme: DesignStudioTheme }): DesignDocument {
  const format = input.format ?? 'letter-landscape'
  const size = artboardSizeForFormat(format)
  return { version: 1, engine: 'fabric', kind: input.kind ?? 'generic', name: input.name, unit: 'in', dpi: 96, artboards: [{ id: 'artboard-1', name: 'Artboard 1', format, ...size, background: input.theme.paper, printProfile: defaultPrintProfile(format), elements: [] }] }
}

export function isDesignDocument(value: unknown): value is DesignDocument {
  const doc = value as Partial<DesignDocument> | null
  return !!doc && doc.version === 1 && doc.engine === 'fabric' && doc.unit === 'in' && typeof doc.name === 'string' && typeof doc.dpi === 'number' && Array.isArray(doc.artboards)
}

export function normalizeDesignDocument(value: unknown, fallback: DesignDocument): DesignDocument {
  if (!isDesignDocument(value)) return structuredClone(fallback)
  const artboards = value.artboards.slice(0, DESIGN_DOCUMENT_LIMITS.maxArtboards).map((artboard, index) => normalizeArtboard(artboard, fallback.artboards[index]))
  return { version: 1, engine: 'fabric', kind: clean(value.kind, 'generic', 80), name: clean(value.name, fallback.name, DESIGN_DOCUMENT_LIMITS.documentNameLength), unit: 'in', dpi: clamp(value.dpi, 72, 300, 96), artboards: artboards.length ? artboards : structuredClone(fallback.artboards) }
}

export function validateDesignDocument(document: DesignDocument, catalog?: DesignFieldCatalog): string[] {
  const errors: string[] = []
  const jsonBytes = new TextEncoder().encode(JSON.stringify(document)).byteLength
  if (jsonBytes > DESIGN_DOCUMENT_LIMITS.maxJsonBytes) errors.push('Design document exceeds the maximum serialized size')
  if (!document.artboards.length) errors.push('A design requires at least one artboard')
  const fields = catalog ? new Set(catalog.fields.map((field) => field.key)) : null
  const ids = new Set<string>()
  for (const artboard of document.artboards) {
    if (ids.has(artboard.id)) errors.push(`Duplicate id: ${artboard.id}`)
    ids.add(artboard.id)
    for (const element of artboard.elements) {
      if (ids.has(element.id)) errors.push(`Duplicate id: ${element.id}`)
      ids.add(element.id)
      if ((element.kind === 'field' || element.kind === 'qr') && fields && !fields.has(element.field)) errors.push(`Unknown data field: ${element.field}`)
    }
  }
  return errors
}

function normalizeArtboard(value: DesignArtboard, fallback?: DesignArtboard): DesignArtboard {
  const format = validFormat(value.format) ? value.format : fallback?.format ?? 'letter-landscape'
  const size = format === 'custom' ? { width: clamp(value.width, 1, 40, fallback?.width ?? 11), height: clamp(value.height, 1, 40, fallback?.height ?? 8.5) } : artboardSizeForFormat(format)
  return { id: slug(value.id, `artboard-${crypto.randomUUID()}`), name: clean(value.name, fallback?.name ?? 'Artboard', DESIGN_DOCUMENT_LIMITS.artboardNameLength), format, ...size, background: safeColor(value.background, fallback?.background ?? hexColor('surface')), bleed: clamp(value.bleed, 0, 0.25, 0), printProfile: value.printProfile ?? fallback?.printProfile ?? defaultPrintProfile(format), elements: Array.isArray(value.elements) ? value.elements.slice(0, DESIGN_DOCUMENT_LIMITS.maxElementsPerArtboard).map((element, index) => normalizeElement(element, index)) : [] }
}

function normalizeElement(value: DesignElement, index: number): DesignElement {
  const base = { id: slug(value.id, `element-${index + 1}`), name: clean(value.name, `Element ${index + 1}`, DESIGN_DOCUMENT_LIMITS.elementNameLength), x: clamp(value.x, -40, 40, 0), y: clamp(value.y, -40, 40, 0), width: clamp(value.width, 0.01, 40, 1), height: clamp(value.height, 0.001, 40, 0.4), rotation: clamp(value.rotation, -360, 360, 0), opacity: clamp(value.opacity, 0, 1, 1), visible: value.visible !== false, locked: value.locked === true }
  if (value.kind === 'text') return { ...base, kind: 'text', text: clean(value.text, '', DESIGN_DOCUMENT_LIMITS.textLength), ...textStyle(value) }
  if (value.kind === 'field') return { ...base, kind: 'field', field: clean(value.field, '', DESIGN_DOCUMENT_LIMITS.fieldKeyLength), fallback: value.fallback?.slice(0, 200), prefix: value.prefix?.slice(0, 40), suffix: value.suffix?.slice(0, 40), transform: value.transform ?? 'none', ...textStyle(value) }
  if (value.kind === 'image') return { ...base, kind: 'image', field: value.field?.slice(0, DESIGN_DOCUMENT_LIMITS.fieldKeyLength), url: value.url?.slice(0, DESIGN_DOCUMENT_LIMITS.imageUrlLength), fit: value.fit === 'cover' ? 'cover' : 'contain', radius: clamp(value.radius, 0, 1, 0) }
  if (value.kind === 'qr') return { ...base, kind: 'qr', field: clean(value.field, '', DESIGN_DOCUMENT_LIMITS.fieldKeyLength), background: safeColor(value.background, hexColor('surface')), foreground: safeColor(value.foreground, hexColor('fg')) }
  if (value.kind === 'seal') return { ...base, kind: 'seal', text: value.text?.slice(0, 80), fill: safeColor(value.fill, hexColor('primary')), stroke: safeColor(value.stroke, hexColor('primary-active')) }
  return { ...base, kind: value.kind, fill: safeColor(value.fill, 'transparent'), stroke: safeColor(value.stroke, hexColor('border-strong')), strokeWidth: clamp(value.strokeWidth, 0, 0.2, 0.01), radius: clamp(value.radius, 0, 1, 0) }
}

function textStyle(value: TextStyle): TextStyle { return { fontFamily: value.fontFamily?.slice(0, 120) || 'Arial, sans-serif', fontSize: clamp(value.fontSize, 3, 120, 14), fontWeight: ['400','500','600','700','800'].includes(value.fontWeight ?? '') ? value.fontWeight : '600', fontStyle: value.fontStyle === 'italic' ? 'italic' : 'normal', color: safeColor(value.color, hexColor('fg')), align: value.align === 'center' || value.align === 'right' ? value.align : 'left', letterSpacing: clamp(value.letterSpacing, 0, 0.25, 0), lineHeight: clamp(value.lineHeight, 0.8, 2, 1.15) } }
function defaultPrintProfile(format: ArtboardFormat): PrintProfile { return { provider: 'browser-pdf', media: format.startsWith('cr80') ? 'cr80' : format === 'custom' ? 'custom' : 'letter', duplex: format.startsWith('cr80'), edgeToEdge: true, orientation: format === 'letter-portrait' ? 'portrait' : 'landscape' } }
function validFormat(value: string): value is ArtboardFormat { return ['letter-landscape','letter-portrait','cr80-front','cr80-back','label-4x6','custom'].includes(value) }
function safeColor(value: string | undefined, fallback: string) { return value && (value === 'transparent' || /^#[0-9a-f]{6}$/i.test(value) || /^rgb\(/.test(value)) ? value : fallback }
function clamp(value: number | undefined, min: number, max: number, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback }
function clean(value: string | undefined, fallback: string, length: number) { return value?.trim().slice(0, length) || fallback }
function slug(value: string | undefined, fallback: string) { return (value ?? fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || fallback }
