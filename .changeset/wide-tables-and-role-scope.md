---
'@appkitjs/office': minor
'@appkitjs/tenant': minor
---

`officeDocumentHtml` takes a page orientation, and `@appkitjs/tenant` exports `RoleScope`.

A wide table on a portrait page does not shrink to fit — it runs off the right
edge of the sheet and the columns past the margin are simply not in the file. A
fourteen-column weekly financial summary rendered as a report with its bank
balance, line of credit, term deposit and both sales columns missing, and
nothing in the output said anything was gone. `orientation: 'landscape'` is now
available and defaults to portrait, so existing documents are unchanged.

`RoleScope` is re-exported from `@appkitjs/tenant`. The package's own public types
are written in terms of it — `RequestContext` carries scopes and `AccessCtx` is
resolved against them — so a consumer typing a variable that holds one had to
reach past this package into `@appkitjs/db` for a type it only ever meets through
this API.
