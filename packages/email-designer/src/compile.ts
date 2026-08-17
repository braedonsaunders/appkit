// Save-time pipeline. Authored markup is sanitized ONCE here — never per send —
// and the repeat markers are expanded into mustache blocks the renderer
// understands. Merge values are escaped at render time by @braedonsaunders/appkit-email-render,
// so a compiled design is safe to store and re-render without re-sanitizing.

import { expandRepeatMarkers, sanitizeEmailFragment, sanitizeEmailHtml } from '@braedonsaunders/appkit-email-render'
import type { EmailDesign } from './types'

export type CompileEmailDesignOptions = {
  /**
   * Inliner applied before sanitizing so `<style>` rules land on each element's
   * `style` attribute — Gmail and Outlook strip `<style>` blocks. Pass
   * `inlineEmailCss` from `@braedonsaunders/appkit-email-designer/inline` on the server. Omit it
   * (as a browser-side preview does) and authored rules stay in the `<style>`
   * block, which a browser honors but many mail clients do not.
   */
  inlineCss?: (html: string) => string
  /**
   * Sanitize as an embeddable fragment instead of a whole document — correct for
   * signatures and anything else spliced into an existing message body.
   */
  fragment?: boolean
}

export type CompileEmailDesignResult = EmailDesign & {
  /** Non-empty when compilation failed; both HTML fields are then empty. */
  errors: string[]
}

/**
 * Turn a designer snapshot into the pair that gets persisted.
 *
 * Both halves derive from the same inlined, sanitized markup, and differ only in
 * whether the repeat markers have been expanded. That matters for the
 * round-trip: sanitizing a FRAGMENT drops a top-level `<style>` block, so a
 * signature reopened from un-inlined source would come back stripped of every
 * rule GrapesJS wrote to its stylesheet. Inlining first turns those rules into
 * `style` attributes, which survive sanitizing and reopen intact — and inline
 * styles are what email needs anyway.
 *
 * Order is therefore fixed: inline, sanitize, then expand. The inliner cannot
 * run last — juice parses HTML with cheerio and would choke on `{{#each}}`.
 */
export function compileEmailDesign(
  rawHtml: string,
  options: CompileEmailDesignOptions = {},
): CompileEmailDesignResult {
  if (!rawHtml.trim()) return { sourceHtml: '', compiledHtml: '', errors: [] }
  const sanitize = options.fragment ? sanitizeEmailFragment : sanitizeEmailHtml
  try {
    const sourceHtml = sanitize(options.inlineCss ? options.inlineCss(rawHtml) : rawHtml)
    return { sourceHtml, compiledHtml: expandRepeatMarkers(sourceHtml), errors: [] }
  } catch (error) {
    return {
      sourceHtml: '',
      compiledHtml: '',
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}
