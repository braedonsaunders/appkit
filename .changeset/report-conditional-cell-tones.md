---
'@braedonsaunders/appkit-reports': minor
---

Report columns can colour their values by content

A report could say a certificate was expired but not show it. Every status
column rendered as plain text, so the row that needed acting on looked exactly
like the twenty rows above it that did not, and readers scanned for the word
instead of seeing the shape of the page.

`ReportColumn.tones` maps a value to one of five named tones — critical,
warning, positive, info, muted — matched case-insensitively against the cell's
rendered text. A small named set rather than free colours, because a report is
printed as well as viewed: the palette has to stay legible in greyscale, and a
stored definition has to keep meaning when the theme changes.

The tone is applied in `renderReportDocumentBodyHtml`, which the screen view and
the PDF both render through, so a report cannot colour one way on screen and
another on paper.

Colour rides on the text with a weight bump rather than a background fill.
Browsers drop backgrounds when printing unless print-color-adjust is honoured, a
status still has to read on a black-and-white office printer, and anyone who
cannot separate red from green gets the weight as the signal and the hue as the
hint.
