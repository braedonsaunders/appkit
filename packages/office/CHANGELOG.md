# @appkit/office

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
