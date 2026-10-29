import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  localeFromAcceptLanguage,
  matchLocale,
  negotiateLocale,
  localizeText,
  normalizeLocalePolicy,
  resolveLocalePreferences,
} from './index'

test('normalizes tenant locale policy and preserves the default locale', () => {
  assert.deepEqual(
    normalizeLocalePolicy({ defaultLocale: 'fr', enabledLocales: ['es', 'bogus'] }),
    { defaultLocale: 'fr', enabledLocales: ['fr', 'es'] },
  )
})

test('negotiates and resolves localized authoring copy', () => {
  assert.equal(localeFromAcceptLanguage('xx;q=0.95, es;q=0.8, de;q=0.9, en;q=0.7'), 'de')
  assert.equal(localeFromAcceptLanguage('pt-BR,pt;q=0.9'), 'pt-BR')
  assert.equal(localeFromAcceptLanguage('zh-Hant-TW'), 'zh-TW')
  assert.equal(localizeText({ en: 'Inspection', fr: 'Inspection FR' }, 'fr', 'Form'), 'Inspection FR')
  assert.equal(localizeText('Legacy title', 'es', 'Form'), 'Legacy title')
})

test('rejects disabled user overrides', () => {
  assert.deepEqual(
    resolveLocalePreferences({
      defaultLocale: 'en',
      enabledLocales: ['en', 'fr'],
      userLocale: 'es',
    }),
    {
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en', 'fr'],
      localeOverride: null,
    },
  )
})

test('maps regional and script tags onto supported locales', () => {
  assert.equal(matchLocale('de-AT'), 'de')
  assert.equal(matchLocale('pt_PT'), 'pt-BR')
  assert.equal(matchLocale('zh-Hans-SG'), 'zh-CN')
  assert.equal(matchLocale('zh-HK'), 'zh-TW')
  assert.equal(matchLocale('nn-NO'), 'nb')
  assert.equal(matchLocale('tlh'), null)
  assert.equal(negotiateLocale(['tlh', 'fr-CA', 'de']), 'fr')
  assert.equal(negotiateLocale([]), 'en')
})

test('lists every supported locale once', () => {
  assert.deepEqual(
    LOCALE_OPTIONS.map((option) => option.value),
    [...SUPPORTED_LOCALES],
  )
})
