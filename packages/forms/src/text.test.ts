import assert from 'node:assert/strict'
import test from 'node:test'

import { readText, writeText } from './text'

test('reads legacy string and localized copy through one API', () => {
  assert.equal(readText('Legacy title', 'fr'), 'Legacy title')
  assert.equal(readText({ en: 'Safety check', fr: 'Contrôle de sécurité' }, 'fr'), 'Contrôle de sécurité')
})

test('writes without forcing a migration between source shapes', () => {
  assert.equal(writeText('Old', 'New', 'en'), 'New')
  assert.deepEqual(writeText({ en: 'Old', fr: 'Ancien' }, 'Nouveau', 'fr'), {
    en: 'Old',
    fr: 'Nouveau',
  })
})
