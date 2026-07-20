import assert from 'node:assert/strict'
import test from 'node:test'
import { compileAuthoredFormPdf, renderFormSummaryHtml } from './index'

test('summary renderer preserves sections and escapes record data', () => {
  const html = renderFormSummaryHtml({ tenantName: 'Acme', title: 'Inspection', fields: [{ key: 'hazard', label: 'Hazard', value: '<unsafe>' }], sections: [{ label: 'Items', columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Guard' }] }] })
  assert.match(html, /&lt;unsafe&gt;/)
  assert.match(html, /Items/)
  assert.doesNotMatch(html, /<unsafe>/)
})

test('authored templates use the bounded AppKit PDF template engine', () => {
  const html = compileAuthoredFormPdf({ sourceHtml: '<p>{{person.name}}</p>{{#each items}}<b>{{name}}</b>{{/each}}', values: { person: { name: 'Pat & Co' }, items: [{ name: 'A' }, { name: 'B' }] } })
  assert.match(html, /<p>Pat &amp; Co<\/p><b>A<\/b><b>B<\/b>/)
})
