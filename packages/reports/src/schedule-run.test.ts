import assert from 'node:assert/strict'
import test from 'node:test'
import { claimReportRun, type ReportRunStore } from './schedule-run'

function store(existing = new Map<string, { id: string; trigger: 'scheduled' | 'manual' }>()): ReportRunStore<{ id: string }> {
  return {
    async loadContext(scheduleId) { return { tenantId: 'tenant', scheduleId, scheduleName: 'Weekly report', definition: { id: 'report' }, filters: {}, recipientUserIds: [], recipientEmails: [] } },
    async insert(input) { const key = input.scheduledFor.toISOString(); if (existing.has(key)) return null; const row = { id: `run-${existing.size + 1}`, trigger: input.trigger }; existing.set(key, row); return { id: row.id } },
    async find(_scheduleId, scheduledFor) { return existing.get(scheduledFor.toISOString()) ?? null },
  }
}

test('scheduled run claims are idempotent while manual runs advance colliding timestamps', async () => {
  const rows = new Map<string, { id: string; trigger: 'scheduled' | 'manual' }>()
  const adapter = store(rows)
  const at = new Date('2026-07-20T12:00:00.000Z')
  const first = await claimReportRun(adapter, { scheduleId: 'schedule', scheduledFor: at, trigger: 'scheduled' })
  const duplicate = await claimReportRun(adapter, { scheduleId: 'schedule', scheduledFor: at, trigger: 'scheduled' })
  const manual = await claimReportRun(adapter, { scheduleId: 'schedule', scheduledFor: at, trigger: 'manual' })
  assert.equal(first.created, true)
  assert.deepEqual(duplicate, { id: first.id, scheduledFor: at, created: false })
  assert.equal(manual.scheduledFor.getTime(), at.getTime() + 1)
})
