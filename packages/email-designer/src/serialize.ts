/** The slice of a GrapesJS editor the designer needs to snapshot a design. */
export type EmailEditorSnapshot = {
  getHtml: () => string
  getCss?: () => string | undefined
}

/**
 * GrapesJS keeps authored rules in `getCss()` — keyed by generated ids like
 * `#iltl` — separately from the component markup in `getHtml()`. Persisting one
 * without the other silently drops styling, so the two are always serialized
 * together. The `<style>` block survives sanitizing and is inlined at compile.
 */
export function serializeEmailEditor(editor: EmailEditorSnapshot): string {
  const css = editor.getCss?.() ?? ''
  const html = editor.getHtml()
  return css ? `<style>${css}</style>${html}` : html
}
