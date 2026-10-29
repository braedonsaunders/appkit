---
'@braedonsaunders/appkit-i18n': minor
---

Support twenty locales (adding Czech, Danish, German, Finnish, Italian, Japanese,
Korean, Norwegian Bokmål, Dutch, Polish, Brazilian Portuguese, Russian, Swedish,
Turkish, Ukrainian, and Simplified and Traditional Chinese) with region and script
fallback in `matchLocale`, `negotiateLocale`, and `localeFromAcceptLanguage`. Add the
exact-copy `createSystemTranslator` over `systemMessageKey` catalogues, with
`{name}` placeholders, CLDR plural forms, English fallback, and `UiTextProvider`
compatibility, plus `formatMessage` and `messageProblems` for catalogue tooling.
`AppLocale` now covers the wider set; exhaustive per-locale records need entries for
the new locales.
