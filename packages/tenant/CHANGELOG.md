# @braedonsaunders/tenant

## 0.2.0

### Minor Changes

- fb9f887: `officeDocumentHtml` takes a page orientation, and `@braedonsaunders/tenant` exports `RoleScope`.

  A wide table on a portrait page does not shrink to fit — it runs off the right
  edge of the sheet and the columns past the margin are simply not in the file. A
  fourteen-column weekly financial summary rendered as a report with its bank
  balance, line of credit, term deposit and both sales columns missing, and
  nothing in the output said anything was gone. `orientation: 'landscape'` is now
  available and defaults to portrait, so existing documents are unchanged.

  `RoleScope` is re-exported from `@braedonsaunders/tenant`. The package's own public types
  are written in terms of it — `RequestContext` carries scopes and `AccessCtx` is
  resolved against them — so a consumer typing a variable that holds one had to
  reach past this package into `@braedonsaunders/db` for a type it only ever meets through
  this API.

## 0.1.1

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- 1319bfb: Restore the complete source role-scope vocabulary, impersonation guard, template
  access rules, response editing policy, and `selfOnlyFilter` compatibility name.
- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @braedonsaunders/db@0.2.0
  - @braedonsaunders/i18n@0.1.1
