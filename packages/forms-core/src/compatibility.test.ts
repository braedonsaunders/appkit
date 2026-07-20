import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FIELD_TYPES,
  emptyFormSchema,
  formSchemaV1Schema,
  parseFormSchema,
  profileFieldIds,
  recipientTargetSchema,
  scheduledSafeActions,
  validateResponse,
  type FlowSubjectProfile,
} from './index'

test('accepts an OpenBooks-style string schema without workflow', () => {
  const result = parseFormSchema({
    schemaVersion: 1,
    title: 'Vendor onboarding',
    sections: [
      {
        id: 'details',
        fields: [
          { id: 'amount', type: 'currency', label: 'Expected spend' },
          { id: 'vendor', type: 'party', label: 'Vendor' },
          { id: 'account', type: 'gl_account', label: 'Expense account' },
        ],
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(FIELD_TYPES.currency.valueKind, 'number')
  assert.equal(FIELD_TYPES.party.optionsSource, 'parties')
})

test('accepts a BeaconHS-style localized schema with workflow', () => {
  const schema = formSchemaV1Schema.parse({
    schemaVersion: 1,
    title: { en: 'Inspection', fr: 'Inspection' },
    sections: [
      {
        id: 'inspection',
        title: { en: 'Site inspection' },
        step: 'submit',
        fields: [
          {
            id: 'result',
            type: 'pass_fail_na',
            label: { en: 'Result' },
            required: true,
          },
        ],
      },
    ],
    workflow: {
      steps: [
        {
          key: 'submit',
          title: { en: 'Submit' },
          assignee: { type: 'role', role: 'inspector' },
        },
      ],
    },
  })

  assert.equal(schema.workflow?.steps[0]?.key, 'submit')
  assert.deepEqual(validateResponse(schema, { result: 'pass' }), [])
})

test('compatibility helpers expose safe defaults and subject fields', () => {
  assert.equal(emptyFormSchema('New form').title, 'New form')
  assert.equal(recipientTargetSchema.parse({ type: 'submitter' }).type, 'submitter')
  assert.deepEqual([...scheduledSafeActions()].sort(), ['notify_role', 'send_email'])

  const profile: FlowSubjectProfile = {
    subjectType: 'module',
    subjectKey: 'invoice',
    label: 'Invoice',
    triggers: ['on_submit'],
    actions: ['send_email'],
    fields: [{ key: 'total', label: 'Total', kind: 'number' }],
  }
  assert.deepEqual([...profileFieldIds(profile)], ['total'])
})
