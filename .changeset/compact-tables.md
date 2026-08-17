---
'@appkitjs/office': minor
---

`officeDocumentHtml` takes a table density.

Landscape buys a wide table one page-width, and that is not always enough. A
fourteen-column weekly financial summary still lost its last column off the
edge of a landscape sheet — silently, as ever, with nothing in the file to say
a column was missing.

`density: 'compact'` sets tabular type to 7pt and tightens cell padding, which
fits that table complete. Only tables are affected; prose keeps its size.
Defaults to normal, so nothing already rendering changes.

Note for anyone extending this: the converter honours `font-size` on `th`/`td`
but ignores it on `table`, and ignores `white-space`, `word-break` and
`overflow-wrap` on cells entirely. Cell-level font size is the lever that works.
