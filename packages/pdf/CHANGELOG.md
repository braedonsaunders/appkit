# @braedonsaunders/appkit-pdf

## 0.4.0

### Minor Changes

- 40ad102: `ComposePart.contentBoxes` fits a region of each source page instead of the
  whole page.

  Assembling documents that already exist means inheriting whatever margins their
  authors chose. Fitting whole pages preserves that variance, so one policy lands
  a 52%-wide text column in small type beside another at 80% in larger type — the
  assembled result reads as a pile of documents rather than one book. Supplying
  the content region per page puts every source's text in the same place at a
  comparable size.

  Boxes are in the source page's own user space (origin bottom-left) and index
  against the selected `pages` when given. A null, empty or inverted box falls
  back to fitting the page whole, so a page with nothing to measure still renders.
  Cropped pages may scale past 1:1 — a crop is already just its content, and
  holding it to natural size would defeat the normalisation.

## 0.3.0

### Minor Changes

- 9246120: `composePdf` gains a content margin and a first-page letterhead band.

  - `marginPt` (per document, overridable per part) insets content without
    changing the page size, so an assembled document can be given breathing room
    — or have it taken away — without re-rendering its sources.
  - `ComposePart.letterhead` draws a band across the top of a part's FIRST page
    and fits that page's content beneath it. This is how a control block or
    letterhead sits ON a document instead of consuming a sheet of its own. The
    source page is already rendered and cannot reflow to make room, so it is
    scaled into the reduced box; later pages of the same part are untouched,
    because reserving the strip on every sheet would waste it.

## 0.2.1

### Patch Changes

- c39b716: Embed each distinct source once in `composePdf` rather than once per part.

  Composing a document that takes one page from the same multi-page source many
  times — one generated sheet per member — parsed and embedded that source for
  every part. The cost is quadratic: on a 196-member document it turned a 3.5
  second compose into 27 seconds and inflated the output from 7MB to 19MB through
  duplicated resources.

  Sources are now loaded once and every page a source contributes is embedded in
  a single call. Page placement moved into a shared helper so `imposePages` and
  `composePdf` cannot drift apart in how they fit, rotate, or handle blank pages.

## 0.2.0

### Minor Changes

- 6a4d434: Add PDF composition: assemble many existing PDFs into one document on a single
  page geometry.

  `appkit-pdf` could previously only generate pages. Assembling a document out of
  PDFs that already exist — a policy manual built from exported Word files plus
  scanned uploads — meant byte concatenation, which keeps every source's own page
  size. A book stitched that way physically changes paper size as you read it, and
  cannot carry page numbers or a footer across the seams.

  - `imposePages` centres and scales each source page onto a uniform geometry.
    It honours `/Rotate`, so a copier that writes a landscape MediaBox with
    `/Rotate 270` is treated as the portrait page it actually displays as rather
    than letterboxed sideways. Pages are not enlarged past 1:1 unless asked,
    because upscaling a small scan magnifies its artefacts.
  - `stampFooter` draws a three-column footer, optionally with a second centred
    line, and can skip pages so a cover stays clean.
  - `composePdf` ties the two together and numbers only the pages you mark as
    numbered, so a cover does not consume "page 1" and the printed numbers match
    what a reader counts.

  Geometry comes from the renderer's existing paper table, so a composed document
  and a generated one cannot disagree about what "letter" means.

  A source page with no content stream — a genuinely blank sheet, which scanners
  do emit — is reproduced as a blank page rather than throwing, so one empty sheet
  cannot fail an entire manual.

  `imposePages` and `ComposePart` also accept a `pages` subset, so many small
  sheets can be rendered once as a single multi-page document and sliced into
  place rather than paying browser startup per sheet.

## 0.1.1

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ab6056]
  - @braedonsaunders/appkit-tokens@0.1.1
