// HTML authoring surface for LibreOffice conversion. `officeDocumentHtml`
// wraps agent- or application-authored body HTML in a complete printable
// document (page margins, serif hierarchy, bordered tables, page-break
// hygiene, optional letterhead branding) that soffice converts cleanly to
// .docx or PDF. `sanitizeOfficeHtml` is the matching allowlist sanitizer —
// a small hand-rolled tag scanner, no parser dependency — that reduces
// untrusted HTML to the exact element set the print stylesheet covers.
//
// Conversions run in a local headless LibreOffice with no network guarantee,
// so remote images are refused outright; embedded `data:` images are the one
// supported image transport.

export type OfficeBranding = {
  companyName?: string
  /** Hex color (`#rgb`, `#rrggbb`, …) for the letterhead rule and links. */
  accentColor?: string
  footerText?: string
}

export type OfficeDocumentHtmlInput = {
  /** Body markup — sanitize untrusted input with `sanitizeOfficeHtml` first. */
  bodyHtml: string
  title?: string
  branding?: OfficeBranding
}

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'u',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'br', 'hr',
  'img',
])

const VOID_TAGS = new Set(['br', 'hr', 'img'])

/** Disallowed elements whose text content must vanish with them. */
const DROPPED_WITH_CONTENT = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
  'svg', 'math', 'head', 'title', 'textarea', 'select', 'canvas',
])

const DATA_IMAGE_PREFIXES = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'bmp'].map(
  (type) => `data:image/${type};base64,`,
)

type ParsedTag = {
  name: string
  closing: boolean
  selfClosing: boolean
  attributes: Map<string, string>
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

function isTagStartChar(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

function isTagNameChar(char: string): boolean {
  return isTagStartChar(char) || (char >= '0' && char <= '9') || char === '-' || char === ':'
}

/** Index of the `>` closing the tag at `start`, honoring quoted attributes. */
function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i]!
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return i
    }
  }
  return -1
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Parse one raw `<...>` slice into name + entity-decoded attributes. */
function parseTag(raw: string): ParsedTag | null {
  let i = 1
  let closing = false
  if (raw[i] === '/') {
    closing = true
    i += 1
  }
  let name = ''
  while (i < raw.length && isTagNameChar(raw[i]!)) {
    name += raw[i]!.toLowerCase()
    i += 1
  }
  if (!name) return null

  const attributes = new Map<string, string>()
  while (i < raw.length - 1) {
    while (i < raw.length - 1 && (isSpace(raw[i]!) || raw[i] === '/')) i += 1
    if (raw[i] === '>' || i >= raw.length - 1) break
    let attributeName = ''
    while (
      i < raw.length - 1 &&
      !isSpace(raw[i]!) &&
      raw[i] !== '=' &&
      raw[i] !== '/' &&
      raw[i] !== '>'
    ) {
      attributeName += raw[i]!.toLowerCase()
      i += 1
    }
    if (!attributeName) {
      i += 1
      continue
    }
    while (i < raw.length - 1 && isSpace(raw[i]!)) i += 1
    let value = ''
    if (raw[i] === '=') {
      i += 1
      while (i < raw.length - 1 && isSpace(raw[i]!)) i += 1
      const quote = raw[i]
      if (quote === '"' || quote === "'") {
        i += 1
        while (i < raw.length - 1 && raw[i] !== quote) {
          value += raw[i]!
          i += 1
        }
        i += 1
      } else {
        while (i < raw.length - 1 && !isSpace(raw[i]!) && !(raw[i] === '/' && raw[i + 1] === '>')) {
          value += raw[i]!
          i += 1
        }
      }
    }
    if (!attributes.has(attributeName)) attributes.set(attributeName, decodeEntities(value))
  }

  let end = raw.length - 2
  while (end > 0 && isSpace(raw[end]!)) end -= 1
  return { name, closing, selfClosing: raw[end] === '/', attributes }
}

/** Strip ASCII control characters and whitespace that mask URL schemes. */
function compactUrl(value: string): string {
  let out = ''
  for (const char of value) {
    if (char.charCodeAt(0) > 0x20) out += char
  }
  return out
}

function safeHref(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = compactUrl(value)
  const lower = cleaned.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return cleaned
  }
  return null
}

function safeDataImageSrc(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = compactUrl(value)
  const lower = cleaned.toLowerCase()
  return DATA_IMAGE_PREFIXES.some((prefix) => lower.startsWith(prefix)) ? cleaned : null
}

/** Re-emit an allowed tag with only its allowed, re-validated attributes. */
function emitTag(tag: ParsedTag): string | null {
  const parts: string[] = []
  if (tag.name === 'a') {
    const href = safeHref(tag.attributes.get('href'))
    if (href) parts.push(` href="${escapeHtml(href)}"`)
  } else if (tag.name === 'img') {
    const src = safeDataImageSrc(tag.attributes.get('src'))
    if (!src) return null
    parts.push(` src="${escapeHtml(src)}"`)
    const alt = tag.attributes.get('alt')
    if (alt) parts.push(` alt="${escapeHtml(alt)}"`)
    for (const dimension of ['width', 'height'] as const) {
      const value = tag.attributes.get(dimension)
      if (value && /^\d{1,5}$/.test(value)) parts.push(` ${dimension}="${value}"`)
    }
  } else if (tag.name === 'th' || tag.name === 'td') {
    for (const span of ['colspan', 'rowspan'] as const) {
      const value = tag.attributes.get(span)
      if (value && /^\d{1,3}$/.test(value)) parts.push(` ${span}="${value}"`)
    }
  }
  return `<${tag.name}${parts.join('')}>`
}

/** Skip past the matching close tag of a dropped-with-content element. */
function skipDroppedElement(html: string, from: number, name: string): number {
  const lower = html.toLowerCase()
  let depth = 1
  let i = from
  while (i < lower.length) {
    const close = lower.indexOf(`</${name}`, i)
    if (close === -1) return html.length
    const open = lower.indexOf(`<${name}`, i)
    if (open !== -1 && open < close) {
      const after = lower[open + 1 + name.length]
      if (after === undefined || isSpace(after) || after === '>' || after === '/') depth += 1
      i = open + 1 + name.length
      continue
    }
    const after = lower[close + 2 + name.length]
    const gt = lower.indexOf('>', close)
    const next = gt === -1 ? html.length : gt + 1
    if (after === undefined || isSpace(after) || after === '>') {
      depth -= 1
      if (depth === 0) return next
    }
    i = next
  }
  return html.length
}

/**
 * Reduce untrusted HTML to the print-safe allowlist: h1–h4, p, ul/ol/li,
 * strong/em/u, blockquote, table/thead/tbody/tr/th/td, a[href http/https/
 * mailto], br, hr, and img limited to embedded `data:` raster images.
 * Disallowed wrappers keep their text; script-like elements vanish with their
 * content; comments, doctypes, and processing instructions are removed; the
 * output is re-balanced so every emitted element is closed.
 */
export function sanitizeOfficeHtml(html: string): string {
  const out: string[] = []
  const stack: string[] = []
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out.push(html.slice(i))
      break
    }
    if (lt > i) out.push(html.slice(i, lt))
    const next = html[lt + 1]
    if (next === undefined) {
      out.push('&lt;')
      break
    }
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? html.length : end + 3
      continue
    }
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', lt + 1)
      i = end === -1 ? html.length : end + 1
      continue
    }
    if (!isTagStartChar(next) && next !== '/') {
      out.push('&lt;')
      i = lt + 1
      continue
    }
    const end = findTagEnd(html, lt)
    if (end === -1) {
      out.push('&lt;')
      i = lt + 1
      continue
    }
    const tag = parseTag(html.slice(lt, end + 1))
    i = end + 1
    if (!tag) continue

    if (tag.closing) {
      if (stack.includes(tag.name)) {
        for (;;) {
          const open = stack.pop()!
          out.push(`</${open}>`)
          if (open === tag.name) break
        }
      }
      continue
    }
    if (DROPPED_WITH_CONTENT.has(tag.name)) {
      if (!tag.selfClosing) i = skipDroppedElement(html, i, tag.name)
      continue
    }
    if (!ALLOWED_TAGS.has(tag.name)) continue

    const emitted = emitTag(tag)
    if (emitted === null) continue
    out.push(emitted)
    if (VOID_TAGS.has(tag.name)) continue
    if (tag.selfClosing) out.push(`</${tag.name}>`)
    else stack.push(tag.name)
  }
  while (stack.length > 0) out.push(`</${stack.pop()!}>`)
  return out.join('')
}

/** Throw if the body embeds an `<img>` whose src is not a `data:` URI. */
function assertNoRemoteImages(bodyHtml: string): void {
  let i = 0
  while (i < bodyHtml.length) {
    const lt = bodyHtml.indexOf('<', i)
    if (lt === -1) break
    const next = bodyHtml[lt + 1]
    if (next === undefined) break
    if (bodyHtml.startsWith('<!--', lt)) {
      const end = bodyHtml.indexOf('-->', lt + 4)
      i = end === -1 ? bodyHtml.length : end + 3
      continue
    }
    if (!isTagStartChar(next) && next !== '/' && next !== '!' && next !== '?') {
      i = lt + 1
      continue
    }
    const end = findTagEnd(bodyHtml, lt)
    if (end === -1) {
      i = lt + 1
      continue
    }
    const tag = parseTag(bodyHtml.slice(lt, end + 1))
    i = end + 1
    if (!tag || tag.closing || tag.name !== 'img') continue
    const src = tag.attributes.get('src')
    if (src && !compactUrl(src).toLowerCase().startsWith('data:')) {
      throw new Error(
        'officeDocumentHtml refuses <img> elements with remote sources — embed images as data: URIs so conversion never fetches the network.',
      )
    }
  }
}

const HEX_COLOR_LENGTHS = new Set([4, 5, 7, 9])

function assertHexColor(value: string): string {
  const valid =
    value.startsWith('#') &&
    HEX_COLOR_LENGTHS.has(value.length) &&
    [...value.slice(1)].every(
      (char) =>
        (char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F'),
    )
  if (!valid) {
    throw new Error('branding.accentColor must be a hex color such as #1a4f8a')
  }
  return value
}

function printStylesheet(accent: string): string {
  return `
@page { size: letter; margin: 0.75in; }
html, body { margin: 0; padding: 0; }
body {
  background-color: #ffffff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #1a1a1a;
}
h1, h2, h3, h4 { line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 20pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 16pt 0 8pt; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; }
h4 { font-size: 11pt; margin: 12pt 0 4pt; text-transform: uppercase; letter-spacing: 0.04em; }
p { margin: 0 0 8pt; orphans: 2; widows: 2; }
ul, ol { margin: 0 0 8pt; padding-left: 22pt; }
li { margin: 0 0 3pt; }
blockquote {
  margin: 8pt 0 8pt 14pt;
  padding-left: 10pt;
  border-left: 2pt solid #c8c8c8;
  color: #444444;
}
table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 0.75pt solid #8c8c8c; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background-color: #efefef; font-weight: bold; }
a { color: ${accent}; }
hr { border: none; border-top: 0.75pt solid #b4b4b4; margin: 12pt 0; }
img { max-width: 100%; }
.appkit-letterhead {
  border-bottom: 1.5pt solid ${accent};
  padding-bottom: 6pt;
  margin-bottom: 16pt;
  font-size: 13pt;
  font-weight: bold;
  letter-spacing: 0.02em;
  color: ${accent};
  page-break-after: avoid;
}
.appkit-document-footer {
  border-top: 0.75pt solid #b4b4b4;
  margin-top: 20pt;
  padding-top: 6pt;
  font-size: 8.5pt;
  color: #666666;
  text-align: center;
}
`.trim()
}

/**
 * Wrap body HTML in a complete printable document for LibreOffice conversion
 * (`htmlToDocx` / `htmlToPdf`): US-letter pages with 0.75in margins, a serif
 * reading hierarchy, bordered tables, page-break-friendly headings and rows,
 * and an optional letterhead line plus footer from `branding`. Remote images
 * are refused; embed images as `data:` URIs. Sanitize untrusted body markup
 * with `sanitizeOfficeHtml` before calling.
 */
export function officeDocumentHtml(input: OfficeDocumentHtmlInput): string {
  assertNoRemoteImages(input.bodyHtml)
  const branding = input.branding ?? {}
  const accent = branding.accentColor ? assertHexColor(branding.accentColor) : '#1a4f8a'
  const title = escapeHtml(input.title?.trim() || 'Document')
  const letterhead = branding.companyName
    ? `<div class="appkit-letterhead">${escapeHtml(branding.companyName)}</div>\n`
    : ''
  const footer = branding.footerText
    ? `\n<div class="appkit-document-footer">${escapeHtml(branding.footerText)}</div>`
    : ''
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${printStylesheet(accent)}
</style>
</head>
<body>
${letterhead}${input.bodyHtml}${footer}
</body>
</html>
`
}
