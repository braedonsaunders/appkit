# @appkit/notifications

Production notification infrastructure and user interfaces that applications
can adopt independently: multi-channel policy and dispatch at the root, the
complete inbox and administration surfaces under `/react`, tenant-safe Drizzle
persistence under `/drizzle`, digest scanning under `/digest`, and Web Push
lifecycle under `/push`.

## Install

```bash
pnpm add @appkit/notifications
```

The root has no runtime dependencies. Add React/UI, Drizzle/database, jobs, or
Web Push dependencies only when the corresponding entry point is used.

## Production surfaces

- `NotificationInbox` — the responsive three-pane inbox with smart folders,
  category folders, search, to-dos, cursor paging, optimistic actions, reading
  pane, mobile drawers, retry states, and loading skeleton.
- `ProductionNotificationPreferences` — the complete category/channel matrix;
  absent cells default enabled exactly like the production dispatcher and the
  save adapter receives the complete bounded matrix.
- `PushDeviceNotifications` — browser/OS capability detection, iOS Home Screen
  guidance, permission, subscription persistence, test delivery, expiry-safe
  disable behavior, and all production states.
- `NotificationSettings` — tenant routing policy, transport readiness, digest
  delivery, quiet hours, automatic scan cron/timezone, per-category enablement,
  roles, people, groups, channels, escalation ladders, dirty state, and atomic
  save boundary.

Applications supply their real category catalogue, recipient catalogue,
authorized persistence adapters, transport configuration routes, credentials,
and delivery providers. No application category or role vocabulary is bundled.

## Persistence and jobs

`@appkit/notifications/schema` owns notifications, preferences, subscriptions,
tenant policy, and per-category settings. `@appkit/notifications/drizzle`
provides inbox, preferences, configuration, dispatch, and subscription stores
bound to an application-owned RLS database handle.

The source-compatible BullMQ `NotifyJobData` and `PushJobData` contracts,
validation, deterministic recipient batching, queue names, retry schedules, and
retention settings live at `@appkit/jobs/notifications`.

```ts
import { createJobs } from '@appkit/jobs'
import { createNotificationQueues } from '@appkit/jobs/notifications'

const queues = createNotificationQueues(createJobs({ redisUrl: process.env.REDIS_URL! }))

await queues.enqueueNotification({
  tenantId,
  userIds,
  category: 'records',
  type: 'record.updated',
  title: 'Record updated',
  linkPath: `/records/${recordId}`,
})
```

## Source provenance

The inbox, preference matrix, push enrollment, routing cockpit, schedule
grammar, policy schema, notify/push queue profiles, digest behavior, and Web
Push handling are faithful generalized extractions from the pinned production
reference listed in `docs/for-agents/provenance.md`. Framework routing,
application categories, domain recipient queries, credentials, and provider
delivery remain typed host boundaries.
