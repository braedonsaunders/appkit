---
'@braedonsaunders/appkit-jobs': minor
---

Add the pure `/recurrence` entry for anchored intervals, one-time instants,
IANA-zone daily/weekly/monthly calendars, active weekdays and overnight windows,
explicit DST handling, strict validation, and skip/coalesce cursor advancement.
Timezone calculations use Temporal without importing the Redis or BullMQ runtime.
