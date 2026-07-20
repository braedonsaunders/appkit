import assert from 'node:assert/strict'
import test from 'node:test'

import {
  localeFromAcceptLanguage,
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
  assert.equal(localeFromAcceptLanguage('de;q=0.9, es;q=0.8, en;q=0.7'), 'es')
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
