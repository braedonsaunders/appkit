---
'@braedonsaunders/appkit-pdf': patch
---

Embed each distinct source once in `composePdf` rather than once per part.

Composing a document that takes one page from the same multi-page source many
times — one generated sheet per member — parsed and embedded that source for
every part. The cost is quadratic: on a 196-member document it turned a 3.5
second compose into 27 seconds and inflated the output from 7MB to 19MB through
duplicated resources.

Sources are now loaded once and every page a source contributes is embedded in
a single call. Page placement moved into a shared helper so `imposePages` and
`composePdf` cannot drift apart in how they fit, rotate, or handle blank pages.
