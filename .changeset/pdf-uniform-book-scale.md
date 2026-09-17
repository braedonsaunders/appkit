---
'@braedonsaunders/appkit-pdf': minor
---

Compose: normalise an assembled book to ONE scale, and reserve the footer band.

`composePdf` gains `normalizeContentScale`, which gives every part with
`contentBoxes` a single scale — the largest at which each page still fits — and
pins content to the content box corner instead of centring it. Fitting each
document individually made the scale a property of that document: measured on a
real 61-document manual it ranged 0.965–1.495 and the side margin 0–126pt, which
reads as the type size and the margins changing from document to document.

A first page carrying a `letterhead` band is excluded from that calculation and
falls back to its own fit. Source documents run headers and footers close to the
sheet edge, so there is little vertical slack: letting a 132pt band bind the
result dragged the same manual from 0.84 to 0.68, shrinking every page in the
book to make room for a strip on one page per document.

`footerReservePt` keeps a band clear at the foot of every numbered page. The
footer is stamped after imposition, so without it the imposed content ran
straight underneath the page number. Unnumbered parts (covers, dividers) keep
the whole sheet.
