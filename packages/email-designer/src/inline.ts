// Server-only subpath: juice is a Node module (cheerio) and must not reach a
// browser bundle. Kept out of the package entry so the core stays isomorphic —
// import '@braedonsaunders/email-designer/inline' from a server action or job only.

import juice from 'juice'

/**
 * Inline a design's `<style>` rules onto each element's `style` attribute.
 *
 * Must run on raw authored HTML BEFORE repeat markers are expanded — juice
 * parses with cheerio and would mangle `{{#each}}` blocks. `juice()` inlines
 * embedded styles only and performs no network or file access (that is
 * `juiceResources`/`juiceFile`), so it is safe and synchronous.
 */
export function inlineEmailCss(html: string): string {
  if (!html.includes('<style')) return html
  try {
    return juice(html)
  } catch {
    // An inliner edge case must never block a save — fall back to the raw
    // markup, which still carries the <style> block.
    return html
  }
}
