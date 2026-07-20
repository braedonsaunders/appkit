import assert from 'node:assert/strict'
import test from 'node:test'

import { FIELD_TYPES, formSchemaV1Schema, type FieldType } from '@appkit/forms-core'
import { createFormField } from './form-designer'

test('every palette field starts as a valid canonical schema node', () => {
  const fields = (Object.keys(FIELD_TYPES) as FieldType[]).map((type) => createFormField(type))
  const result = formSchemaV1Schema.safeParse({
    schemaVersion: 1,
    title: 'Palette contract',
    sections: [{ id: 'main', fields }],
  })
  assert.equal(result.success, true, result.success ? undefined : result.error.message)
})
