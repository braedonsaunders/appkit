---
'@braedonsaunders/appkit-pdf': minor
---

`composePdf` gains a content margin and a first-page letterhead band.

- `marginPt` (per document, overridable per part) insets content without
  changing the page size, so an assembled document can be given breathing room
  — or have it taken away — without re-rendering its sources.
- `ComposePart.letterhead` draws a band across the top of a part's FIRST page
  and fits that page's content beneath it. This is how a control block or
  letterhead sits ON a document instead of consuming a sheet of its own. The
  source page is already rendered and cannot reflow to make room, so it is
  scaled into the reduced box; later pages of the same part are untouched,
  because reserving the strip on every sheet would waste it.
