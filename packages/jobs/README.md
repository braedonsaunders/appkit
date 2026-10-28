# `@braedonsaunders/appkit-jobs`

Pure timezone-aware recurrence, production BullMQ infrastructure, and reusable queue contracts for application work that must survive request boundaries.

The package is lazy by construction. Importing its root or any queue module does not open Redis, create a queue, or start a worker. Applications create one `Jobs` runtime, bind only the queue families they use, and inject their domain processors.

## Queue families

| Entry | Production behavior |
| --- | --- |
| `/email` | Validated email payloads, case-insensitive recipient de-duplication, one private job per recipient, deterministic fan-out IDs, five-attempt exponential delivery, and bounded retention. |
| `/notifications` | Bounded 250-recipient notification batches, 40-job bulk writes, push jobs, deterministic IDs, and the production dispatcher/push worker profiles. |
| `/pdf` | Record summaries, tenant templates, document versions, working-master previews, books, multi-part bundles, durable artifact targets, email delivery, on-demand waits, payload ceilings, and deterministic in-flight de-duplication. |
| `/reports` | Both production report contracts: durable schedule/run claims and definition-driven render-and-deliver jobs. Each keeps its original retry and worker profile. |
| `/scheduled` | The complete eleven-job schedule registry, exact cron/repeat identities, stale-repeat reconciliation, sync-run exclusion, and maintenance de-duplication. |
| `/recurrence` | Pure interval, once, and timezone-aware calendar calculation, active periods, and persisted-cursor advancement. Imports no BullMQ, Redis, or host runtime. |
| `/outbound` | One isolated automation/event dispatch per job, tenant identity binding, flat scalar event records, and serialized payload limits. |
| `/scripts` | Scheduled and bulk authored-script runs with no automatic retry for non-idempotent code. |
| `/sandbox` | Create, refresh, reset, and delete lifecycle jobs with single-attempt safety for partially applied clones. |
| `/migration` | Full migration, incremental mirror, and attachment passes with long-job retry/retention policy. |
| `/capture` | Deterministic asynchronous document capture with application-owned queue naming and ID prefix. |
| `/web-push` | Hardened subscription validation and Web Push delivery. |
| `/health`, `/rate-limit` | Bounded Redis readiness and atomic fixed-window rate limiting. |

Every queue module exports its payload types, validation functions, exact queue profile, lazy factory, enqueue methods, and worker binding. Queue names and worker concurrency can be overridden when an existing application must retain an established deployment contract.

## Usage

```ts
import { createJobs } from '@braedonsaunders/appkit-jobs'
import { createEmailQueue } from '@braedonsaunders/appkit-jobs/email'
import { createPdfQueue } from '@braedonsaunders/appkit-jobs/pdf'
import { createScheduledQueue } from '@braedonsaunders/appkit-jobs/scheduled'

const jobs = createJobs({ redisUrl: process.env.REDIS_URL! })

const email = createEmailQueue(jobs)
const pdf = createPdfQueue(jobs)
const scheduled = createScheduledQueue(jobs)

await email.enqueueEmail({
  to: ['owner@example.com', 'reviewer@example.com'],
  subject: 'Report ready',
  html: '<p>Your report is ready.</p>',
  text: 'Your report is ready.',
}, { jobId: 'report-ready|run-42' })

const workers = [
  email.createWorker(async (job) => deliverEmail(job.data)),
  pdf.createWorker(async (job) => renderPdf(job.data)),
  scheduled.createWorker(async (job) => runScheduledTick(job.data)),
]
```

The package owns transport mechanics and safe queue boundaries. Applications still own Redis credentials, provider credentials, data access, authorization, and the processors that execute domain work.

## Transport-independent recurrence

Import `@braedonsaunders/appkit-jobs/recurrence` directly for embedded, browser,
or database-backed scheduling without Redis. This entry loads only the pure
`@js-temporal/polyfill` timezone library and its arithmetic dependency; it never
imports the jobs root, opens connections, creates timers, or modifies global
Temporal. Every calculation is synchronous and receives its clock as an explicit
ISO instant. The host owns dispatch, storage, authorization, and run claims.

```ts
import {
  parseRecurrenceSchedule, nextOccurrence, advanceRecurrence,
  resolveLocalDateTime,
  type RecurrenceCursor,
} from '@braedonsaunders/appkit-jobs/recurrence'

const schedule = parseRecurrenceSchedule({
  kind: 'interval',
  everyMs: 300_000,
  anchor: '2026-01-05T09:00:00.000Z',
  timeZone: 'America/New_York',
  active: { weekdays: [1, 2, 3, 4, 5], window: { start: '09:00', end: '17:00' } },
})

// nextOccurrence is strictly AFTER the argument. Subtract 1ms when a start
// boundary is inclusive, especially for a once schedule at the creation instant.
const startsAt = '2026-01-05T00:00:00.000Z'
const beforeStart = new Date(Date.parse(startsAt) - 1).toISOString()
let cursor: RecurrenceCursor = { nextAt: nextOccurrence(schedule, beforeStart) }

const decision = advanceRecurrence(schedule, cursor, '2026-01-05T14:13:00.000Z', 'coalesce')
// decision = { dueAt: '2026-01-05T14:00:00.000Z', nextAt: '2026-01-05T14:15:00.000Z' }
cursor = { nextAt: decision.nextAt }
// Persist cursor WITH a durable reservation for decision.dueAt in one host
// transaction. A pure calculation alone cannot guarantee exactly-once execution.

const onceAt = resolveLocalDateTime({
  localDateTime: '2026-11-01T01:30',
  timeZone: 'America/New_York',
  disambiguation: 'later',
}) // '2026-11-01T06:30:00.000Z'
const once = parseRecurrenceSchedule({ kind: 'once', timeZone: 'America/New_York', at: onceAt })
```

### Schedule contract

All five kinds require `timeZone`: a named IANA identifier (including `UTC`),
never an offset such as `-05:00`. ISO weekdays use Monday = 1 through Sunday = 7.
Types are exported from `/recurrence`; their source is `src/recurrence-types.ts`.

| Kind | Required fields | Occurrences |
| --- | --- | --- |
| `interval` | `everyMs`, `anchor` | `anchor + n × everyMs`, integer n ≥ 0. EveryMs is a safe integer ≥ 60,000. Exact elapsed milliseconds; filters and DST never re-anchor it. |
| `once` | `at` | Exactly that instant if permitted by active filters; null after it is consumed or if it is excluded. |
| `daily` | `time` | Every local date at strict `HH:mm`. |
| `weekly` | `time`, `weekdays` | Each selected ISO weekday at `HH:mm`; nonempty unique weekday array required. |
| `monthly` | `time`, `dayOfMonth` | Day 1–31; absent dates are skipped, never clamped. Use explicit `'last'` for the last day of each month. |

`anchor`, `at`, `after`, `now`, and cursor timestamps accept strict ISO instants
with seconds, `Z` or `±HH:mm`, and at most three fractional digits. Invalid
dates, leap seconds, annotations, offset-free inputs, and finer precision are
rejected. Output is always UTC with exactly three fractional digits. Temporal's
supported instant/date range applies; range overflow throws rather than
returning false exhaustion.

Optional `active` contains `weekdays`, `window: { start, end }`, or both.
Weekday arrays cannot be empty or contain duplicates. Windows use local `HH:mm`,
include the start, exclude the end, and cross midnight when end < start. Equal
endpoints are invalid; omit the window for all day. An overnight window's
weekday is its **opening date**: Monday 22:00–02:00 permits early Tuesday.
Weekly schedule weekdays still describe the occurrence's actual local date.
Filters exclude occurrences; they never delay or move them to an opening time.
Calendar filters that exclude all possible occurrence times/weekdays reject
at parsing. A once instant outside its active period has no occurrence.

### DST and local UI input

Calendar dates that contain a nonexistent scheduled wall time are **skipped**.
A repeated wall time runs **once, at its earlier instant**. This applies to
non-hour changes as well, including Lord Howe's half-hour transitions. Monthly
gaps skip that month's occurrence. Elapsed interval ticks retain both instants
of a repeated wall-clock window when their anchor places ticks there.

`resolveLocalDateTime` explicitly converts a `YYYY-MM-DDTHH:mm` UI value in the
selected IANA zone to an instant for `once`. The caller must provide
`disambiguation: 'earlier' | 'later' | 'reject'`; nonexistent local times always
throw. Persist the returned instant and the selected display timezone. Do not
pass a local datetime to `Date.parse` or infer the host timezone.

Timezone resolution uses [Temporal's documented disambiguation rules](https://tc39.es/proposal-temporal/docs/timezone.html)
through the [maintained polyfill](https://github.com/js-temporal/temporal-polyfill),
with a local-time round trip to identify gaps. The polyfill uses the runtime's
IANA/ICU timezone data; keep it current. Future calendar calculations reflect
that data, while an already persisted instant remains an exact instant. After
schedule edits or deliberate timezone-rule changes, the host must explicitly
reinitialize its cursor; advancement rejects a cursor that is no longer an
occurrence of that schedule.

### Persisted cursor and missed runs

`nextOccurrence(schedule, after)` is strictly exclusive and never reads the
system clock. It calculates directly from that instant, including across
restarts. `RecurrenceCursor = { nextAt: string | null }` is the next unconsumed
occurrence; null means terminal/disabled and never initializes automatically.

`advanceRecurrence(schedule, cursor, now, policy)` returns `{ dueAt, nextAt }`:

- Future cursor: no run; preserve its instant.
- `skip`: discard all strictly overdue occurrences; retain an occurrence exactly
  equal to `now`. Hosts choosing this strict policy must account for polling
  latency; it intentionally provides no lateness grace period.
- `coalesce`: produce at most one run for the **oldest persisted due instant**,
  including a tick exactly at `now`. All other elapsed occurrences are consumed.
- Next cursor: first eligible occurrence strictly after `now`; null for an
  exhausted once schedule. A repeated call with the returned cursor and same
  `now` produces no additional run.

Advancement jumps directly beyond `now`, without enumerating downtime, generating
a catch-up array, or moving interval anchors. Host transactions must reserve the
run and persist the next cursor atomically, with an idempotency key based on
schedule identity and `dueAt`. The host also decides whether execution of
coalesced work is allowed outside an active period; filters govern scheduled
instants, not delayed execution time. Store the schedule with the cursor;
validation checks occurrence membership but cannot detect an edit whose new
schedule happens to share the same occurrence.

`RecurrenceValidationError` carries `field` for form errors. Search has a default
10,000-candidate **work budget**, configurable with the optional final argument
`{ maxCandidates }` (1–1,000,000). This is not a date horizon: distant once work
is direct, unfiltered intervals use arithmetic, and monthly work advances by
month. An interval phase that never intersects its active period can exhaust
the budget; `RecurrenceSearchLimitError` is an explicit configuration/calculation
failure, never null or permission to disable a schedule. Hosts should surface
it and retain the existing cursor. Calendar next-occurrence searches likewise
throw on budget exhaustion, never silently drop valid future work.

The playground's `/packages/jobs/demo?view=recurrence` shows deterministic
calculations from these exports without dispatching work.

## Compatibility boundaries

- Tenant-scoped job types accept `tenantId`; source-compatible organization-scoped contracts also accept `orgId` where that production contract used it.
- The two report queue modes share the established `reports` queue name but are separate factories because their payloads and retry delays are intentionally different.
- Capture queue naming and deterministic ID prefixes are injected so a consuming application can preserve an existing queue without placing domain-specific names in AppKit.
- Worker factories preserve the source concurrency defaults and accept explicit overrides for deployments that already tuned them.
