import { formSchemaV1Schema, type FormSchemaV1 } from '@appkit/forms-core'

export const SUPPLIER_QUALIFICATION_SCHEMA: FormSchemaV1 = formSchemaV1Schema.parse({
  schemaVersion: 1,
  title: 'Supplier qualification',
  description: 'Collect the information needed to qualify a new supplier.',
  workflow: {
    steps: [
      {
        key: 'intake',
        title: 'Supplier intake',
        assignee: { type: 'role', role: 'procurement' },
      },
      {
        key: 'review',
        title: 'Qualification review',
        assignee: { type: 'role', role: 'manager' },
        signatureRequired: true,
      },
    ],
    scoreRouting: {
      thresholdScore: 80,
      hardFailRules: [
        { kind: 'any_field_eq', fieldKeys: ['result'], value: 'fail' },
      ],
    },
  },
  sections: [
    {
      id: 'company',
      title: 'Company details',
      description: 'Company, contact, spend, and risk details.',
      layout: { columns: 2, gap: 'md' },
      step: 'intake',
      fields: [
        { id: 'company_name', type: 'text', label: 'Company name', required: true },
        { id: 'contact_email', type: 'email', label: 'Contact email', required: true },
        {
          id: 'approved_supplier',
          type: 'lookup',
          label: 'Match an approved supplier',
          binding: {
            sourceKey: 'suppliers',
            valueColumn: 'id',
            labelColumn: 'name',
            autofill: [{ column: 'name', targetFieldId: 'company_name' }],
          },
        },
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
        {
          id: 'contract_value',
          type: 'formula',
          label: 'Contract value with contingency',
          formula: {
            kind: 'product',
            of: [
              { kind: 'field_ref', fieldKey: 'expected_spend' },
              { kind: 'literal', value: 1.1 },
            ],
          },
        },
      ],
    },
    {
      id: 'services',
      title: 'Services and projects',
      description: 'Capture line-level scope and select the projects this supplier can support.',
      step: 'intake',
      fields: [
        {
          id: 'service_lines',
          type: 'table',
          label: 'Service lines',
          required: true,
          config: {
            rowMode: 'addable',
            minRows: 1,
            maxRows: 12,
            columns: [
              { key: 'description', label: 'Description', type: 'text' },
              {
                key: 'category',
                label: 'Category',
                type: 'select',
                options: [
                  { value: 'materials', label: 'Materials' },
                  { value: 'services', label: 'Services' },
                  { value: 'equipment', label: 'Equipment' },
                ],
              },
              { key: 'quantity', label: 'Quantity', type: 'number' },
              { key: 'start_date', label: 'Start date', type: 'date' },
            ],
          },
        },
        {
          id: 'supported_projects',
          type: 'data_table',
          label: 'Supported projects',
          binding: {
            sourceKey: 'projects',
            columns: ['name', 'region', 'budget'],
            selectable: 'multi',
            limit: 25,
          },
        },
      ],
    },
    {
      id: 'review',
      title: 'Qualification review',
      step: 'review',
      fields: [
        { id: 'result', type: 'pass_fail_na', label: 'Qualification result', required: true },
        {
          id: 'evaluation',
          type: 'matrix',
          label: 'Evaluation matrix',
          required: true,
          config: {
            rows: [
              { key: 'quality', label: 'Quality controls' },
              { key: 'delivery', label: 'Delivery capability' },
              { key: 'commercial', label: 'Commercial fit' },
            ],
            scale: [
              { value: '1', label: 'Needs improvement' },
              { value: '2', label: 'Meets requirements' },
              { value: '3', label: 'Exceeds requirements' },
            ],
          },
        },
        {
          id: 'risk_assessment',
          type: 'risk_matrix',
          label: 'Supplier risk',
          required: true,
        },
        {
          id: 'supplier_count',
          type: 'metric',
          label: 'Approved suppliers in directory',
          binding: {
            sourceKey: 'suppliers',
            aggregate: { fn: 'count' },
            display: 'number',
          },
        },
        {
          id: 'notes',
          type: 'rich_text',
          label: 'Reviewer notes',
          helpText: 'Add supporting details for the qualification decision.',
        },
        {
          id: 'approval_signature',
          type: 'signature',
          label: 'Reviewer signature',
          required: true,
        },
      ],
    },
  ],
})
