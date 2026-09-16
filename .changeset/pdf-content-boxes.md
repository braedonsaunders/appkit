---
'@braedonsaunders/appkit-pdf': minor
---

`ComposePart.contentBoxes` fits a region of each source page instead of the
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
