import assert from 'node:assert/strict'
import test from 'node:test'
import { hexColor } from '@appkit/tokens'
import type { DesignElement, DesignFieldCatalog, DesignStudioTheme } from './schema'
import { createDesignElement, uniqueDesignElementId } from './editor'

const catalog: DesignFieldCatalog = {
  fields: [
    { key: 'record.name', label: 'Name', semanticType: 'text' },
    { key: 'record.photo', label: 'Photo', semanticType: 'image' },
    { key: 'record.qr', label: 'QR', semanticType: 'qr' },
  ],
}
const theme: DesignStudioTheme = {
  primary: hexColor('primary'),
  accent: hexColor('warning'),
  paper: hexColor('surface'),
  ink: hexColor('fg'),
  muted: hexColor('fg-muted'),
}

test('the editor constructs every supported element kind from the app catalogue', () => {
  const elements: DesignElement[] = []
  for (const kind of ['text', 'field', 'rect', 'ellipse', 'line', 'image', 'qr', 'seal'] as const) {
    elements.push(createDesignElement(kind, elements, catalog, theme))
  }

  assert.deepEqual(elements.map((element) => element.kind), ['text', 'field', 'rect', 'ellipse', 'line', 'image', 'qr', 'seal'])
  assert.equal((elements.find((element) => element.kind === 'image') as Extract<DesignElement, { kind: 'image' }>).field, 'record.photo')
  assert.equal((elements.find((element) => element.kind === 'qr') as Extract<DesignElement, { kind: 'qr' }>).field, 'record.qr')
})

test('element ids remain unique across duplicates', () => {
  const element = createDesignElement('text', [], catalog, theme)
  assert.equal(uniqueDesignElementId(element.id, [element]), `${element.id}-2`)
})
