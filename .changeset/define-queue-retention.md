---
'@braedonsaunders/appkit-jobs': minor
---

`defineQueue` now bounds finished-job history by default (`DEFAULT_QUEUE_RETENTION`: completed jobs kept 7 days / 10 000, failed jobs 30 days) and accepts an optional second argument of default job options. BullMQ otherwise keeps every finished job forever, which let a repeating heartbeat grow Redis without bound. Queues that dedupe on `jobId` for longer than a week, or that want to keep everything, can pass `{ removeOnComplete: false, removeOnFail: false }`.
