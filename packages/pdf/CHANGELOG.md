# @braedonsaunders/appkit-pdf

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
