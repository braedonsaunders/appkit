import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formSchemaV1Schema } from '@appkit/forms-core'
import { ProductionFormRenderer } from './production-form-renderer'
import type { ProductionFormRuntimeAdapter } from './production-runtime-adapter'
import { attachmentIdsEqual, singlePrimaryPhoto } from './photo-field-state'
import { resolveGeneratedCopy } from './generated-copy'

const adapter: ProductionFormRuntimeAdapter = {
  async createDraft() { return { ok: true, responseId: 'response-1' } },
  async saveDraft(input) {
    return { ok: true, savedAt: '2026-07-22T12:00:00.000Z', revision: input.baseRevision + 1, sequence: input.clientSequence }
  },
  async submit() { return { ok: true, responseId: 'response-1' } },
  async updateField() { return { ok: true } },
  async fetchEntityAttributes() { return { ok: true, attrs: {} } },
  async listHierarchyOptions() { return [] },
  async queryData(input) { return { columns: [], rows: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 25, selectedRow: null } },
  async aggregateData() { return { value: null, total: 0 } },
}

const schema = formSchemaV1Schema.parse({
  schemaVersion: 1,
  title: 'Equipment inspection',
  workflow: {
    steps: [{ key: 'inspect', title: 'Inspection', assignee: { type: 'expression', expr: '$submitter' } }],
  },
  sections: [{
    id: 'details',
    title: 'Inspection details',
    step: 'inspect',
    fields: [{ id: 'serial', type: 'text', label: 'Serial number', required: true }],
  }],
})

test('production renderer preserves the source record runtime caller and read-only surface', () => {
  const html = renderToStaticMarkup(React.createElement(ProductionFormRenderer, {
    adapter,
    templateId: 'template-1',
    templateName: 'Equipment inspection',
    version: 3,
    schema: { ...schema, workflow: schema.workflow! },
    sites: [],
    people: [],
    entitiesByField: {},
    currentUser: { personId: null, name: 'Inspector' },
    recordsHref: '/records',
    readOnly: true,
    responseStatus: 'submitted',
    initialValues: { serial: 'EQ-1042' },
  }))

  assert.match(html, /Equipment inspection/)
  assert.match(html, /Inspection details/)
  assert.match(html, /Serial number/)
  assert.match(html, /EQ-1042/)
  assert.match(html, /submitted/)
  assert.doesNotMatch(html, /Submit/)
})

test('source photo state keeps derived analysis only for an identical ordered selection', () => {
  const first = { attachmentId: 'first', filename: 'first.jpg' }
  const second = { attachmentId: 'second', filename: 'second.jpg' }
  assert.equal(attachmentIdsEqual([first, second], [{ ...first }, { ...second }]), true)
  assert.equal(attachmentIdsEqual([first, second], [second, first]), false)
  assert.deepEqual(singlePrimaryPhoto([first, second]), [second])
  assert.deepEqual(singlePrimaryPhoto([]), [])
})

test('every extracted production copy key resolves to readable English copy', async () => {
  const source = await readFile(new URL('./production-form-renderer.tsx', import.meta.url), 'utf8')
  const ids = new Set(source.match(/m_[0-9a-f]{14}/g) ?? [])
  const missing = [...ids].filter((id) => resolveGeneratedCopy(id) === id)
  assert.deepEqual(missing, [])
})
