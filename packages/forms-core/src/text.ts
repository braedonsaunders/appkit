// Flatten rich-text HTML into readable plaintext without allocating a browser
// DOM. This entry is used by validation and search/indexing paths, so it must be
// safe to import in Node, workers, and serverless runtimes. htmlparser2 handles
// malformed/nested markup and entity decoding; regex tag stripping does not.

import { Parser } from 'htmlparser2'

const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
])

/** Convert rich-text HTML to readable plaintext, preserving block line breaks. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  const out: string[] = []
  let suppressedDepth = 0
  const parser = new Parser(
    {
      onopentag(name) {
        if (name === 'script' || name === 'style' || name === 'template') suppressedDepth += 1
        if (!suppressedDepth && name === 'br') out.push('\n')
      },
      ontext(value) {
        if (!suppressedDepth) out.push(value)
      },
      onclosetag(name) {
        if (name === 'script' || name === 'style' || name === 'template') {
          suppressedDepth = Math.max(0, suppressedDepth - 1)
          return
        }
        if (!suppressedDepth && BLOCK_ELEMENTS.has(name)) out.push('\n')
      },
    },
    { decodeEntities: true },
  )
  parser.end(html)
  return out
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Single-line preview: strips HTML, collapses whitespace, and ellipsizes. */
export function htmlToSnippet(html: string | null | undefined, max = 160): string {
  const clean = htmlToText(html).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}
