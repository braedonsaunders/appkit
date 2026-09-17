---
'@braedonsaunders/appkit-pdf': minor
---

Compose: let the caller choose a part's scale, and centre scaled content.

`ComposePart.contentScale` replaces the book-level `normalizeContentScale`.
Fitting decides the scale from a page's geometry, which is the wrong input when
the goal is even type: source documents are authored at different body sizes, so
equal fit means unequal type. Measured on a real 61-document manual, 39
documents were set at 14.5pt and 14 at 17.5pt — a 21% difference no amount of
page-fitting removes. The caller measures the type and asks for the scale that
evens it out; the value is still clamped down so a page can never overflow.

Scaled content is centred horizontally and pinned to the top of the content box.
Left-aligning a narrow document left all of its slack on one side, which reads
as a broken right margin rather than a narrow measure.
