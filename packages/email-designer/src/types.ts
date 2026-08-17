// The vocabulary the host app speaks to the designer: what can be merged, what
// repeats, and how the authored blocks should look. Everything here is plain
// data so it can cross a server/client boundary and be persisted as-is.

/** A scalar token the author can drop into the canvas as `{{key}}`. */
export type EmailMergeField = {
  /** Token key. Must satisfy {@link safeTemplateKey} or the block is skipped. */
  key: string
  /** Human label shown in the palette. Falls back to `key`. */
  label?: string
  /** Value used for preview rendering. */
  sample?: string
  /** Palette sub-grouping; defaults to the designer's "Fields" category. */
  group?: string
}

/** One column of a repeating collection table. */
export type EmailCollectionField = { key: string; label: string }

/**
 * A repeating list the author can drop in as an editable table. The row carries
 * a `data-each` marker that compiles to a `{{#each}}` block — see
 * `expandRepeatMarkers` in `@appkitjs/email-render`.
 */
export type EmailCollection = {
  key: string
  label: string
  fields: EmailCollectionField[]
}

/**
 * Visual defaults for generated blocks. These are baked into inline styles at
 * authoring time (email clients cannot resolve CSS variables), so changing the
 * theme restyles newly inserted blocks — not blocks already on the canvas.
 */
export type EmailDesignerTheme = {
  /** Buttons, links, and rules. */
  accent: string
  /** Body copy. */
  ink: string
  /** Secondary copy, labels, disclaimers. */
  muted: string
  /** Hairlines and table borders. */
  border: string
  /** Page background behind the content column. */
  background: string
  /** Content column background. */
  surface: string
  /** Font stack written into every generated block. */
  fontFamily: string
  /** Content column width for the full-email preset, in px. */
  maxWidth: number
  /** Corner radius for buttons and cards, in px. */
  radius: number
}

/**
 * What the designer is authoring. The preset selects the starter document and
 * which block groups the palette offers.
 *  • `email` — a whole message: a centered content column on a page background.
 *  • `signature` — a compact block appended to a message; no page chrome.
 */
export type EmailDesignerPreset = 'email' | 'signature'

/** One draggable entry in the palette. */
export type EmailBlock = {
  id: string
  label: string
  category: string
  content: string
}

/**
 * The two halves of a saved design.
 *  • `sourceHtml` — sanitized, still carries any `<style>` block and the
 *    `data-each` markers; this is what the designer reopens.
 *  • `compiledHtml` — CSS inlined and markers expanded to mustache blocks;
 *    this is what gets rendered and delivered. Tokens are still embedded.
 */
export type EmailDesign = {
  sourceHtml: string
  compiledHtml: string
}
