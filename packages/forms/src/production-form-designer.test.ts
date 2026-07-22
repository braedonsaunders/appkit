import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formSchemaV1Schema } from '@appkit/forms-core'
import { ProductionFormDesigner } from './production-form-designer'
import { formFlowProfile, lintFormFlowGraph } from './form-flow-validation'
import type { ProductionFormDesignerAdapter } from './production-designer-adapter'
import type { RecordActionFlowAdapter } from './record-config'

const schema = formSchemaV1Schema.parse({
  schemaVersion: 1,
  title: 'Supplier qualification',
  workflow: {
    steps: [{ key: 'review', title: 'Review', assignee: { type: 'expression', expr: '$submitter' } }],
  },
  sections: [
    {
      id: 'supplier',
      title: 'Supplier',
      fields: [
        { id: 'name', type: 'text', label: 'Supplier name' },
        { id: 'contact', type: 'person_picker', label: 'Primary contact' },
        { id: 'evidence', type: 'photo_ai', label: 'Evidence' },
      ],
    },
    {
      id: 'line_items',
      title: 'Line items',
      repeating: true,
      fields: [{ id: 'amount', type: 'number', label: 'Amount' }],
    },
  ],
})

const adapter: ProductionFormDesignerAdapter = {
  async publish() { return { ok: true, version: 2 } },
  async saveOverview() { return { ok: true } },
  async saveRecordConfig() { return { ok: true } },
  async saveListConfig() { return { ok: true } },
  async savePermissions() { return { ok: true } },
}

const actionAdapter: RecordActionFlowAdapter = {
  async create(name, graph) { return { id: 'flow-1', name, graph, enabled: true } },
  async update() {},
  async setEnabled() {},
  async remove() {},
}

test('production designer renders the complete source navigation and authoring canvas', () => {
  const html = renderToStaticMarkup(React.createElement(ProductionFormDesigner, {
    adapter,
    templateId: 'supplier-qualification',
    templateName: 'Supplier qualification',
    initialSchema: schema,
    currentVersion: 1,
    recordActionAdapter: actionAdapter,
    roles: [{ key: 'reviewer', name: 'Reviewer' }],
    renderFlows: () => React.createElement('div', null, 'Flow canvas'),
    backHref: '/forms',
    recordsHref: '/records',
    assignmentCreateHref: '/assignments/new',
    assignmentsHref: '/assignments',
    locale: 'en',
    defaultLocale: 'en',
    enabledLocales: ['en'],
  }))

  for (const label of ['Overview', 'Build', 'Record behaviour', 'Records list', 'Record actions', 'Assign', 'Access']) {
    assert.match(html, new RegExp(label))
  }
  assert.match(html, /Supplier qualification/)
  assert.match(html, /Supplier name/)
  assert.match(html, /Sign-off steps/)
  assert.match(html, /Publish v2/)
  assert.match(html, /w-1\/3/)
})

test('form flow profile preserves production field companion and mutability rules', () => {
  const profile = formFlowProfile('supplier-qualification', 'Supplier qualification', schema)
  assert.equal(profile.subjectType, 'form_template')
  assert.equal(profile.fields.some((field) => field.key === 'amount'), false)
  assert.deepEqual(
    profile.fields.find((field) => field.key === 'contact'),
    { key: 'contact', label: 'Primary contact', kind: 'person', writable: true, photoSource: false, textOutput: false },
  )
  assert.equal(profile.fields.find((field) => field.key === 'evidence')?.photoSource, true)
  assert.equal(profile.fields.find((field) => field.key === 'evidence')?.textOutput, false)
  assert.equal(profile.fields.find((field) => field.key === 'compliance_score')?.writable, false)
})

test('form flow lint rejects writes to content and repeating-row fields', () => {
  const errors = lintFormFlowGraph({
    schemaVersion: 1,
    nodes: [
      { id: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'trigger', trigger: { trigger: 'on_submit' } } },
      { id: 'write', position: { x: 100, y: 0 }, data: { kind: 'action', action: { action: 'set_field', field: 'amount', value: { kind: 'literal', value: 100 } } } },
    ],
    edges: [{ id: 'edge', source: 'trigger', target: 'write', sourceHandle: 'next' }],
  }, 'supplier-qualification', 'Supplier qualification', schema)

  assert.equal(errors.some((error) => error.includes('set_field must target a stored, top-level response field')), true)
})
