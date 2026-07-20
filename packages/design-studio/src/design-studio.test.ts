import assert from 'node:assert/strict'
import test from 'node:test'
import { hexColor } from '@appkit/tokens'
import { createDesignDocument, normalizeDesignDocument, renderDesignDocumentHtml, validateDesignDocument } from './index'

const theme = { primary: hexColor('primary'), accent: hexColor('warning'), paper: hexColor('surface'), ink: hexColor('fg'), muted: hexColor('fg-muted') }

test('normalizes hostile persisted dimensions and validates catalog fields', () => {
  const fallback = createDesignDocument({ name: 'Badge', format: 'cr80-front', theme })
  const document = normalizeDesignDocument({ ...fallback, dpi: 900, artboards: [{ ...fallback.artboards[0], width: 99, elements: [{ id: 'name', name: 'Name', kind: 'field', field: 'person.name', x: 1, y: 1, width: 2, height: .4 }] }] }, fallback)
  assert.equal(document.dpi, 300)
  assert.equal(document.artboards[0]?.width, 3.375)
  assert.deepEqual(validateDesignDocument(document, { fields: [{ key: 'person.name', label: 'Name' }] }), [])
})

test('renders nested app-defined data and escapes authored values', () => {
  const document = createDesignDocument({ name: 'Badge', theme })
  document.artboards[0]!.elements.push({ id: 'name', name: 'Name', kind: 'field', field: 'person.name', x: 1, y: 1, width: 2, height: .4 })
  const html = renderDesignDocumentHtml(document, { person: { name: '<Braedon>' } })
  assert.match(html, /&lt;Braedon&gt;/)
  assert.doesNotMatch(html, /<Braedon>/)
})

test('preserves the source renderer behavior for editor element kinds', () => {
  const document = createDesignDocument({ name: 'Credential', theme })
  document.artboards[0]!.elements.push(
    { id: 'title', name: 'Title', kind: 'text', text: 'Credential', x: 1, y: 1, width: 2, height: .4, letterSpacing: .02 },
    { id: 'logo', name: 'Logo', kind: 'image', field: 'organization.logo', x: 1, y: 2, width: 1, height: 1 },
    { id: 'qr', name: 'QR', kind: 'qr', field: 'verify.qr', x: 2, y: 2, width: 1, height: 1 },
    { id: 'seal', name: 'Seal', kind: 'seal', x: 3, y: 2, width: 1, height: 1 },
  )

  const html = renderDesignDocumentHtml(document, { organization: { name: 'Northstar Works' } })
  assert.match(html, /letter-spacing:0\.02in/)
  assert.match(html, />Logo<\/div>/)
  assert.match(html, />QR<\/div>/)
  assert.match(html, />NW<\/div>/)
})
