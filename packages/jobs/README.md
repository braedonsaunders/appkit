# `@appkit/jobs`

Production BullMQ infrastructure and reusable queue contracts for application work that must survive request boundaries.

The package is lazy by construction. Importing its root or any queue module does not open Redis, create a queue, or start a worker. Applications create one `Jobs` runtime, bind only the queue families they use, and inject their domain processors.

## Queue families

| Entry | Production behavior |
| --- | --- |
| `/email` | Validated email payloads, case-insensitive recipient de-duplication, one private job per recipient, deterministic fan-out IDs, five-attempt exponential delivery, and bounded retention. |
| `/notifications` | Bounded 250-recipient notification batches, 40-job bulk writes, push jobs, deterministic IDs, and the production dispatcher/push worker profiles. |
| `/pdf` | Record summaries, tenant templates, document versions, working-master previews, books, multi-part bundles, durable artifact targets, email delivery, on-demand waits, payload ceilings, and deterministic in-flight de-duplication. |
| `/reports` | Both production report contracts: durable schedule/run claims and definition-driven render-and-deliver jobs. Each keeps its original retry and worker profile. |
| `/scheduled` | The complete eleven-job schedule registry, exact cron/repeat identities, stale-repeat reconciliation, sync-run exclusion, and maintenance de-duplication. |
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
import { createJobs } from '@appkit/jobs'
import { createEmailQueue } from '@appkit/jobs/email'
import { createPdfQueue } from '@appkit/jobs/pdf'
import { createScheduledQueue } from '@appkit/jobs/scheduled'

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

## Compatibility boundaries

- Tenant-scoped job types accept `tenantId`; source-compatible organization-scoped contracts also accept `orgId` where that production contract used it.
- The two report queue modes share the established `reports` queue name but are separate factories because their payloads and retry delays are intentionally different.
- Capture queue naming and deterministic ID prefixes are injected so a consuming application can preserve an existing queue without placing domain-specific names in AppKit.
- Worker factories preserve the source concurrency defaults and accept explicit overrides for deployments that already tuned them.
