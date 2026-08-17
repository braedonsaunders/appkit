# @braedonsaunders/appkit-email-designer

## 0.2.0

### Minor Changes

- 60a30ab: Add `@braedonsaunders/appkit-email-designer`: a drag-and-drop designer for email — whole
  messages and signatures — plus the compile pipeline that turns what an author
  built into markup Outlook will not mangle.

  Blocks are authored as real inline-styled, table-based HTML rather than a
  private document model, so the canvas holds delivery-ready markup from the
  first drag. There is no MJML step and no second renderer to drift out of sync.
  Merge fields drop in as `{{token}}`; a collection drops in as an editable table
  whose body row carries `data-each`, which compiles to an `{{#each}}` loop — the
  only way to make a repeating row authorable, since a `<tr>` cannot hold the
  text node a bare mustache block would need.

  `compileEmailDesign` returns the two halves an application persists: a
  reopenable `sourceHtml` and a delivery-ready `compiledHtml`. Both derive from
  the same inlined, sanitized markup and differ only in marker expansion, which
  is what makes a fragment round-trip lossless — sanitizing a fragment drops a
  top-level `<style>`, so a signature saved un-inlined would reopen stripped of
  every rule the editor had written to its stylesheet. Authored markup is
  sanitized once at save, never per send; merge values are escaped at render by
  `@braedonsaunders/appkit-email-render`.

  The root entry is isomorphic — types, themes, block catalogues, compile,
  render, preview. GrapesJS, React, and `juice` are optional peers behind
  `/react` and `/inline`, so an application that only renders saved designs
  installs none of them. Chrome is plain CSS keyed on `--ak-ed-*` custom
  properties with no UI-kit dependency, and every user-visible string comes from
  an overridable copy map.
