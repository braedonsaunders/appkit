import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readDestinationMapping,
  readIntegrationEditorSubmission,
  type DestinationAuthoringDefinition,
} from './authoring'
import { buildWeekRows } from './sql'

function destination(
  mappingKind: DestinationAuthoringDefinition['mappingKind'],
): DestinationAuthoringDefinition {
  return {
    key: mappingKind,
    name: mappingKind,
    description: '',
    iconKey: mappingKind,
    mappingKind,
    reversible: mappingKind === 'sql',
    configFields: [
      { key: 'port', label: 'Port', type: 'number' },
      { key: 'ssl', label: 'SSL', type: 'boolean' },
    ],
    secretFields: [{ key: 'password', label: 'Password' }],
  }
}

test('authoring parser reconstructs the complete SQL mapping and typed config', () => {
  const form = new FormData()
  form.set('id', 'automation-1')
  form.set('name', ' Weekly export ')
  form.set('triggerKey', 'record.approved')
  form.set('destinationKey', 'sql')
  form.set('enabled', 'on')
  form.set('oncePerRecord', 'on')
  form.set('port', '5432')
  form.set('ssl', 'on')
  form.set('password', ' new-secret ')
  form.set('map-table', 'time_entries')
  form.set('map-idColumn', 'id')
  form.set('map-mode', 'weekly')
  form.set('map-departmentMap', 'Operations = 10')
  form.set('map-requireField', 'externalEmployeeId')
  form.append('col-name', 'employee_id')
  form.append('col-val', '{{externalEmployeeId}}')
  form.append('col-name', 'approved')
  form.append('col-val', 'true')
  form.append('col-name', 'hours')
  form.append('col-val', '8')

  assert.deepEqual(
    readIntegrationEditorSubmission({
      destination: destination('sql'),
      formData: form,
      baseConfig: { retained: 'value' },
    }),
    {
      id: 'automation-1',
      name: 'Weekly export',
      enabled: true,
      ready: true,
      triggerKey: 'record.approved',
      destinationKey: 'sql',
      config: {
        retained: 'value',
        port: 5432,
        ssl: true,
        oncePerRecord: true,
        mapping: {
          table: 'time_entries',
          idColumn: 'id',
          mode: 'weekly',
          departmentMap: 'Operations = 10',
          requireField: 'externalEmployeeId',
          columns: {
            employee_id: '{{externalEmployeeId}}',
            approved: true,
            hours: 8,
          },
        },
      },
      secretReplacements: { password: 'new-secret' },
    },
  )
})

test('authoring parser preserves every production mapping shape', () => {
  const http = new FormData()
  http.append('hdr-key', 'X-Record')
  http.append('hdr-val', '{{reference}}')
  http.set('map-body', '{"id":"{{id}}"}')
  assert.deepEqual(readDestinationMapping(destination('http'), http), {
    headers: { 'X-Record': '{{reference}}' },
    body: '{"id":"{{id}}"}',
  })

  const chat = new FormData()
  chat.set('map-text', 'Ready: {{reference}}')
  chat.set('map-blocks', '[{"type":"section"}]')
  assert.deepEqual(readDestinationMapping(destination('slack'), chat), {
    text: 'Ready: {{reference}}',
    blocks: '[{"type":"section"}]',
  })

  const sheets = new FormData()
  sheets.append('val-expr', '{{reference}}')
  sheets.append('val-expr', '8')
  sheets.append('val-expr', '')
  assert.deepEqual(readDestinationMapping(destination('sheets'), sheets), {
    values: ['{{reference}}', 8],
  })

  const email = new FormData()
  email.set('map-body', '<p>{{reference}}</p>')
  assert.deepEqual(readDestinationMapping(destination('email'), email), {
    body: '<p>{{reference}}</p>',
  })
})

test('weekly SQL fan-out retains the complete production date/hour contract', () => {
  assert.deepEqual(buildWeekRows('2026-07-17', 8, 5), [
    {
      dateStart: '2026-07-12',
      dateEnd: '2026-07-18',
      dayHours: [0, 0, 0, 0, 0, 8, 8],
    },
    {
      dateStart: '2026-07-19',
      dateEnd: '2026-07-25',
      dayHours: [8, 8, 8, 0, 0, 0, 0],
    },
  ])
})
