import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSystemTranslator,
  formatMessage,
  messageProblems,
  systemMessageKey,
  type MessageCatalog,
} from './index'

const de: MessageCatalog = {
  [systemMessageKey('Save')]: 'Speichern',
  [systemMessageKey('Deleted {name}')]: '{name} gelöscht',
  [systemMessageKey('{count} files')]: { one: '{count} Datei', other: '{count} Dateien' },
}

test('translates exact source copy and falls back to the English', () => {
  const t = createSystemTranslator('de', de)
  assert.equal(t.locale, 'de')
  assert.equal(t('Save'), 'Speichern')
  assert.equal(t('Deleted {name}', { name: 'Notiz' }), 'Notiz gelöscht')
  assert.equal(t('Cancel'), 'Cancel')
  assert.equal(t('Keep {missing}'), 'Keep {missing}')
})

test('selects plural forms with the locale grammar and number format', () => {
  const t = createSystemTranslator('de', de)
  assert.equal(t.plural(1, '{count} file', '{count} files'), '1 Datei')
  assert.equal(t.plural(1200, '{count} file', '{count} files'), '1.200 Dateien')
  const en = createSystemTranslator('en')
  assert.equal(en.plural(1, '{count} file', '{count} files'), '1 file')
  assert.equal(en.plural(0, '{count} file', '{count} files'), '0 files')
})

test('fills placeholders and leaves unknown tokens', () => {
  assert.equal(formatMessage('{a} and {b}', { a: 1, b: null }), '1 and {b}')
})

test('reports catalogue entries that cannot ship', () => {
  assert.deepEqual(
    messageProblems({ locale: 'fr', source: 'Deleted {name}', translation: 'Supprimé' }),
    ['placeholders differ from the source'],
  )
  assert.deepEqual(
    messageProblems({
      locale: 'pl',
      source: '{count} files',
      one: '{count} file',
      translation: { one: '1 plik', other: '{count} plików' },
    }),
    ['missing plural form "few"', 'missing plural form "many"'],
  )
  assert.deepEqual(
    messageProblems({
      locale: 'ja',
      source: '{count} files',
      one: '{count} file',
      translation: { other: '{count} 件のファイル' },
    }),
    [],
  )
})
