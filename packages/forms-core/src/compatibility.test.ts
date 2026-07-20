import { describe, expect, test } from 'vitest'

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

describe('cross-sibling compatibility', () => {
test('accepts a plain-string schema without workflow metadata', () => {
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

  expect(result.ok).toBe(true)
  expect(FIELD_TYPES.currency.valueKind).toBe('number')
  expect(FIELD_TYPES.party.optionsSource).toBe('parties')
})

test('accepts a localized schema with workflow metadata', () => {
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

  expect(schema.workflow?.steps[0]?.key).toBe('submit')
  expect(validateResponse(schema, { result: 'pass' })).toEqual([])
})

test('compatibility helpers expose safe defaults and subject fields', () => {
  expect(emptyFormSchema('New form').title).toBe('New form')
  expect(recipientTargetSchema.parse({ type: 'submitter' }).type).toBe('submitter')
  expect([...scheduledSafeActions()].sort()).toEqual(['notify_role', 'send_email'])

  const profile: FlowSubjectProfile = {
    subjectType: 'module',
    subjectKey: 'invoice',
    label: 'Invoice',
    triggers: ['on_submit'],
    actions: ['send_email'],
    fields: [{ key: 'total', label: 'Total', kind: 'number' }],
  }
  expect([...profileFieldIds(profile)]).toEqual(['total'])
})
})
