# @braedonsaunders/appkit-forms-documents

## 0.1.3

### Patch Changes

- 8f4d9e1: Support twenty locales (adding Czech, Danish, German, Finnish, Italian, Japanese,
  Korean, Norwegian Bokmål, Dutch, Polish, Brazilian Portuguese, Russian, Swedish,
  Turkish, Ukrainian, and Simplified and Traditional Chinese) with region and script
  fallback in `matchLocale`, `negotiateLocale`, and `localeFromAcceptLanguage`. Add the
  exact-copy `createSystemTranslator` over `systemMessageKey` catalogues, with
  `{name}` placeholders, CLDR plural forms, English fallback, and `UiTextProvider`
  compatibility, plus `formatMessage` and `messageProblems` for catalogue tooling.
  `AppLocale` now covers the wider set; exhaustive per-locale records need entries for
  the new locales.

  Generated PDF record reports carry their heading copy in every supported locale.

- Updated dependencies [8f4d9e1]
  - @braedonsaunders/appkit-i18n@0.2.0
  - @braedonsaunders/appkit-forms-core@0.1.2

## 0.1.2

### Patch Changes

- Updated dependencies [c99bcaf]
  - @braedonsaunders/appkit-tokens@0.2.0

## 0.1.1

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ab6056]
  - @braedonsaunders/appkit-forms-core@0.1.1
  - @braedonsaunders/appkit-i18n@0.1.1
  - @braedonsaunders/appkit-tokens@0.1.1
