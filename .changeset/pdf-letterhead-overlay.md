---
'@braedonsaunders/appkit-pdf': minor
---

Compose: `ComposePart.letterhead.reserveSpace`.

A letterhead band shrinks the page beneath it to make room. That is only right
when the page is full — when the source document already leaves the strip blank,
reserving again scales that page down against every other page in the book.
Measured on a real 244-page manual, the third of pages carrying a band rendered
at 9.5pt against 11.5pt elsewhere, with double the left margin.

Set `reserveSpace: false` to draw the band into space the source reserved and
leave the page at full size.
