# @appkit/office

## 0.3.0

### Minor Changes

- 453e0d4: `officeDocumentHtml` takes a table density.

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

- fb9f887: `officeDocumentHtml` takes a page orientation, and `@appkit/tenant` exports `RoleScope`.

  A wide table on a portrait page does not shrink to fit — it runs off the right
  edge of the sheet and the columns past the margin are simply not in the file. A
  fourteen-column weekly financial summary rendered as a report with its bank
  balance, line of credit, term deposit and both sales columns missing, and
  nothing in the output said anything was gone. `orientation: 'landscape'` is now
  available and defaults to portrait, so existing documents are unchanged.

  `RoleScope` is re-exported from `@appkit/tenant`. The package's own public types
  are written in terms of it — `RequestContext` carries scopes and `AccessCtx` is
  resolved against them — so a consumer typing a variable that holds one had to
  reach past this package into `@appkit/db` for a type it only ever meets through
  this API.

## 0.2.0

### Minor Changes

- 6806920: Add `@appkit/office`: office-document authoring for AI agents and
  applications. HTML becomes .docx or PDF through headless LibreOffice
  (`officeDocumentHtml` print shell, `sanitizeOfficeHtml` allowlist sanitizer,
  `htmlToDocx`, `htmlToPdf`, `docxToPdf`, `docxToText`), exact-match plain-text
  edits land inside .docx without disturbing formatting via the Flat ODT round
  trip (`replaceTextInFodt`, `replaceTextInDocx`), PDFs concatenate with poppler
  (`pdfUnite`), and declarative sheet specs render to .xlsx through the optional
  `exceljs` peer (`renderWorkbook`).
- Route HTML-to-PDF conversion through the stable DOCX importer so LibreOffice
  7.4 does not add a blank first page to generated PDFs.
