import assert from 'node:assert/strict'
import test from 'node:test'
import { computeNextReportRun, queryResultToReport, resolveReportLayout, runReport, validateReportSchedule, type ReportDefinition, type ReportSchedule } from './index'

test('query results become typed report groups without losing row shape', () => {
  const result = queryResultToReport({ columns: [{ key: 'team', label: 'Team', semanticType: 'category', role: 'dimension' }, { key: 'total', label: 'Total', semanticType: 'currency', role: 'measure' }], rows: [{ team: 'A', total: 12 }, { team: 'B', total: 8 }], rowCount: 2, truncated: false, durationMs: 4 }, { groupBy: 'team' })
  assert.equal(result.groups.length, 2)
  assert.equal(result.groups[0]?.columns[1]?.align, 'right')
  assert.equal(result.rowCount, 2)
})

test('report layout is clamped to source-system document limits', () => {
  assert.deepEqual(resolveReportLayout({ marginMm: 99, density: 'compact', orientation: 'portrait' }), { paperSize: 'letter', orientation: 'portrait', marginMm: 30, showSummary: true, density: 'compact' })
})

test('timezone-aware weekly scheduling produces a future occurrence', () => {
  const schedule: ReportSchedule = { schemaVersion: 1, id: 's', definitionId: 'r', name: 'Monday', active: true, cadence: 'weekly', timezone: 'America/Toronto', hour: 8, minute: 30, dayOfWeek: 1, repeatEvery: 1, recipientUserIds: [], recipientEmails: [], filters: {} }
  assert.equal(computeNextReportRun(schedule, new Date('2026-07-20T13:00:00Z'))?.toISOString(), '2026-07-27T12:30:00.000Z')
})

test('schedule validation rejects incomplete monthly patterns and unsafe delivery data', () => {
  const monthly: ReportSchedule = { id: 's', definitionId: 'r', name: 'Month end', active: true, cadence: 'monthly', timezone: 'UTC', hour: 7, minute: 0, dayOfMonth: null, weekOfMonth: null, repeatEvery: 1, recipientUserIds: [], recipientEmails: [], filters: {} }
  assert.match(validateReportSchedule(monthly).join('; '), /dayOfMonth/)
  assert.match(validateReportSchedule({ ...monthly, dayOfMonth: 1, recipientEmails: ['not-an-email'] }).join('; '), /Invalid report recipient/)
  assert.match(validateReportSchedule({ ...monthly, dayOfMonth: 1, filters: JSON.parse('{"__proto__":null}') as Record<string, unknown> }).join('; '), /filters/i)
  assert.deepEqual(validateReportSchedule({ ...monthly, dayOfMonth: 31 }), [])
})

test('runReport uses the injected tenant-scoped executor', async () => {
  const definition: ReportDefinition = { schemaVersion: 1, id: 'r', slug: 'sales', name: 'Sales', query: { source: 'sales' }, layout: resolveReportLayout(), state: 'published' }
  const result = await runReport(definition, async (query) => ({ columns: [], rows: [], rowCount: query.source === 'sales' ? 0 : 1, truncated: false, durationMs: 1 }))
  assert.equal(result.groups[0]?.title, 'Sales')
})
