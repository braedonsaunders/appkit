# @appkit/email-designer

A drag-and-drop designer for email — whole messages and signatures — plus the
compile pipeline that turns what an author built into markup Outlook will not
mangle.

The doctrine is **what you see is what ships**. Blocks are authored as real,
inline-styled, table-based HTML rather than a private document model, so the
canvas holds delivery-ready markup from the first drag. There is no MJML step
and no second renderer to drift out of sync.

## Entry points

| Import | Environment | Contents |
| --- | --- | --- |
| `@appkit/email-designer` | anywhere | Types, themes, block catalogs, `compileEmailDesign`, `renderEmailDesign`, `sampleMergeValues`, copy. No React, no Node built-ins. |
| `@appkit/email-designer/react` | client | `EmailDesigner` (the authoring surface), `EmailBlockPalette`, `EmailTableToolbar`. |
| `@appkit/email-designer/inline` | server | `inlineEmailCss` — the juice CSS inliner. Node only. |
| `@appkit/email-designer/styles.css` | client | Designer chrome. Also `@import`s GrapesJS's stylesheet. |

GrapesJS, `@grapesjs/react`, `juice`, and React are **optional peers**. An app
that only compiles or renders saved designs installs none of them.

## The two halves of a design

`compileEmailDesign` returns the pair you persist:

```ts
const { sourceHtml, compiledHtml, errors } = compileEmailDesign(raw, {
  inlineCss,              // from @appkit/email-designer/inline
  fragment: true,         // signatures splice into an existing body
})
```

- **`sourceHtml`** — inlined and sanitized, still carrying its `data-each`
  markers. This is what the designer reopens, so a round-trip through the editor
  is lossless.
- **`compiledHtml`** — the same markup with markers expanded to `{{#each}}` /
  `{{#if}}` blocks. Tokens are still embedded; this is what gets rendered per
  recipient.

Both halves derive from the same inlined, sanitized markup and differ only in
marker expansion. Inlining first is what makes the round-trip lossless:
sanitizing a *fragment* drops a top-level `<style>` block, so a signature saved
without inlining would reopen stripped of every rule the editor had written to
its stylesheet. Inline `style` attributes survive sanitizing — and they are what
email needs anyway, since Gmail and Outlook drop `<style>`.

The order is fixed: **inline, sanitize, expand**. The inliner cannot run last,
because juice parses with cheerio and would mangle handlebars block syntax.

Authored markup is sanitized **once, here** — never per send. Merge values are
escaped at render time by `@appkit/email-render`, so a compiled design is safe
to store and re-render without re-sanitizing.

## Rendering

```ts
const { html, text } = renderEmailDesign(compiledHtml, {
  agent: { name: 'Dana Reid', title: 'Operations' },
  hazards: [{ name: 'Silica', level: 'High' }],
})
```

Dotted tokens resolve through nested objects. Substituted values are
HTML-escaped, and the plain-text part is derived from the rendered HTML so the
two always agree.

## Merge fields and collections

A **merge field** is a scalar the author drags in as `{{key}}`. A **collection**
becomes an editable table whose body row carries `data-each="key"` — a real,
invisible attribute that survives the editor and compiles to a loop. This is the
trick that makes repeating rows authorable at all: a `<tr>` cannot hold the text
node a bare `{{#each}}` would need.

Keys are held to `^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`. A block with an unsafe
key is dropped rather than emitted, and one bad column voids its whole table.

## Presets

| Preset | Starter | Palette |
| --- | --- | --- |
| `email` | Centered content column on a page background | Content, Layout, Signature |
| `signature` | Accent-ruled identity block, no page chrome | Signature |

Signature blocks are deliberately table-based and narrow — Outlook renders
floats and flex unpredictably inside a quoted reply chain.

Signature blocks and the signature starter are written against the conventional
`agent.*` / `company.*` keys. If your catalog uses different ones, pass your own
`initialHtml` and `extraBlocks`. The `email` starter is deliberately token-free:
the package cannot know which keys a host defines, and an unresolved token would
render as a blank in a real send.

## Theming

`EmailDesignerTheme` colors are baked into blocks **as they are inserted**;
email clients cannot resolve CSS variables. Changing the theme restyles newly
dragged blocks, not what is already on the canvas. Every color that reaches a
`style` attribute must be a plain hex literal — anything else falls back to the
default rather than being concatenated into markup.

The designer's own chrome is plain CSS with no Tailwind or UI-kit dependency.
Override the `--ak-ed-*` custom properties to restyle it.

## Mounting

GrapesJS touches `window`, so mount behind a dynamic import with SSR disabled:

```tsx
const EmailDesigner = dynamic(
  () => import('@appkit/email-designer/react').then((m) => m.EmailDesigner),
  { ssr: false },
)

<EmailDesigner
  preset="signature"
  initialHtml={saved?.sourceHtml}
  mergeFields={fields}
  theme={{ accent: '#F5A623' }}
  onChange={setDraftHtml}
  onReady={(editor) => (editorRef.current = editor)}
/>
```

`onChange` hands you the serialized design (`<style>` + markup) on every edit —
feed it straight to `compileEmailDesign` for a live preview. `onReady` gives you
the editor to snapshot with `serializeEmailEditor` on save.
