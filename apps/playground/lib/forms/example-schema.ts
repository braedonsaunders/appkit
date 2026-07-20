import { formSchemaV1Schema, type FormSchemaV1 } from '@appkit/forms-core'

export const SUPPLIER_QUALIFICATION_SCHEMA: FormSchemaV1 = formSchemaV1Schema.parse({
  schemaVersion: 1,
  title: 'Supplier qualification',
  description: 'Collect the information needed to qualify a new supplier.',
  sections: [
    {
      id: 'company',
      title: 'Company details',
      description: 'Company, contact, spend, and risk details.',
      layout: { columns: 2, gap: 'md' },
      fields: [
        { id: 'company_name', type: 'text', label: 'Company name', required: true },
        { id: 'contact_email', type: 'email', label: 'Contact email', required: true },
        {
          id: 'expected_spend',
          type: 'currency',
          label: 'Expected annual spend',
          config: { min: 0, step: 100 },
        },
        {
          id: 'risk_tier',
          type: 'select',
          label: 'Risk tier',
          required: true,
          validation: {
            options: [
              { value: 'low', label: 'Low risk' },
              { value: 'medium', label: 'Medium risk' },
              { value: 'high', label: 'High risk' },
            ],
          },
        },
      ],
    },
    {
      id: 'review',
      title: 'Qualification review',
      fields: [
        { id: 'result', type: 'pass_fail_na', label: 'Qualification result', required: true },
        {
          id: 'notes',
          type: 'rich_text',
          label: 'Reviewer notes',
          helpText: 'Add supporting details for the qualification decision.',
        },
      ],
    },
  ],
})
