'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  advanceRecurrence, nextOccurrence, type RecurrenceSchedule,
} from '@braedonsaunders/appkit-jobs/recurrence'
import {
  Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, SubtabNav,
} from '@braedonsaunders/appkit-ui'

export function JobsDemoNav({ active }: { active: 'queues' | 'recurrence' }) {
  const router = useRouter()
  return <SubtabNav
    tabs={[{ key: 'queues', label: 'Queue plans' }, { key: 'recurrence', label: 'Recurring schedules' }]}
    active={active}
    onSelect={(key) => router.push(`/packages/jobs/demo?view=${key}`)}
    ariaLabel="Background work examples"
  />
}

type Scenario = {
  key: string
  label: string
  description: string
  schedule: RecurrenceSchedule
  after: string
  now?: string
}

const SCENARIOS: readonly Scenario[] = [
  {
    key: 'spring', label: 'New York · spring clock change',
    description: 'The missing 02:30 occurrence is skipped. The following date keeps its local time.',
    schedule: { kind: 'daily', timeZone: 'America/New_York', time: '02:30' }, after: '2026-03-07T07:30:00.000Z',
  },
  {
    key: 'fall', label: 'New York · repeated local time',
    description: '01:30 occurs twice on this date. The calendar selects the earlier instant once.',
    schedule: { kind: 'daily', timeZone: 'America/New_York', time: '01:30' }, after: '2026-11-01T00:00:00.000Z',
  },
  {
    key: 'half-hour', label: 'Lord Howe · half-hour clock change',
    description: 'The same gap policy handles a 30-minute change without assuming a one-hour transition.',
    schedule: { kind: 'daily', timeZone: 'Australia/Lord_Howe', time: '02:15' }, after: '2026-10-03T00:00:00.000Z',
  },
  {
    key: 'overnight', label: 'Weekly activity · overnight window',
    description: 'A Monday 22:00–02:00 window includes early Tuesday. Interval ticks retain their anchor.',
    schedule: { kind: 'interval', timeZone: 'UTC', everyMs: 300_000, anchor: '2026-01-01T00:00:00.000Z', active: { weekdays: [1], window: { start: '22:00', end: '02:00' } } },
    after: '2026-01-05T23:59:59.999Z',
  },
  {
    key: 'monthly', label: 'Monthly · day 31',
    description: 'February has no day 31. The next occurrence is March 31, with no month-end clamping.',
    schedule: { kind: 'monthly', timeZone: 'UTC', time: '09:00', dayOfMonth: 31 }, after: '2026-01-31T09:00:00.000Z',
  },
  {
    key: 'restart', label: 'Recovery · coalesce missed runs',
    description: 'After downtime, one run represents the oldest due occurrence. The cursor advances beyond the current time.',
    schedule: { kind: 'interval', timeZone: 'UTC', everyMs: 300_000, anchor: '2026-01-01T00:00:00.000Z' },
    after: '2025-12-31T23:59:59.999Z', now: '2026-01-01T01:13:00.000Z',
  },
  {
    key: 'once', label: 'Once · exact inclusive start',
    description: 'Initialize one millisecond before the chosen start to retain a one-time occurrence at that instant.',
    schedule: { kind: 'once', timeZone: 'UTC', at: '2026-01-01T09:00:00.000Z' }, after: '2026-01-01T08:59:59.999Z',
  },
]

export function RecurrenceDemo() {
  const [selected, setSelected] = useState('spring')
  const scenario = SCENARIOS.find((item) => item.key === selected) ?? SCENARIOS[0]!
  const first = nextOccurrence(scenario.schedule, scenario.after)
  const next = first === null ? null : nextOccurrence(scenario.schedule, first)
  const recovered = scenario.now ? advanceRecurrence(scenario.schedule, { nextAt: first }, scenario.now, 'coalesce') : null
  const fields = [
    ['Timezone', scenario.schedule.timeZone], ['After', scenario.after],
    ['First occurrence', first ?? 'Complete'], ['Following occurrence', next ?? 'Complete'],
    ...(recovered ? [['Current time', scenario.now!], ['Run due', recovered.dueAt ?? 'None'], ['Saved next occurrence', recovered.nextAt ?? 'Complete']] : []),
  ]

  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-3"><CardTitle>Recurring schedules</CardTitle><Badge variant="outline">Calculation only</Badge></div>
      <CardDescription>Explore calendar changes, active periods, and recovery after downtime.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <label className="grid max-w-xl gap-1.5 text-sm font-medium text-fg">
        Scenario
        <Select id="recurrence-scenario" value={selected} onChange={(event) => setSelected(event.currentTarget.value)} searchable>
          {SCENARIOS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </Select>
      </label>
      <p className="text-sm text-fg-muted">{scenario.description}</p>
      <dl aria-live="polite" className="grid gap-4 rounded-lg border border-border bg-bg-subtle p-4 sm:grid-cols-2">
        {fields.map(([label, value]) => <div key={label} className="min-w-0 space-y-1">
          <dt className="text-xs font-medium text-fg-muted">{label}</dt>
          <dd className="break-words font-mono text-sm text-fg">{value}</dd>
        </div>)}
      </dl>
      <details className="rounded-lg border border-border p-4 text-sm text-fg">
        <summary className="cursor-pointer font-medium">Schedule definition</summary>
        <pre className="mt-3 overflow-x-auto text-xs text-fg-muted">{JSON.stringify(scenario.schedule, null, 2)}</pre>
      </details>
    </CardContent>
  </Card>
}
