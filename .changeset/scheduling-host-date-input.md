---
'@braedonsaunders/appkit-scheduling': minor
---

`SchedulingProvider` accepts `components.DateInput`, a host-supplied date
control. Every date the surface edits — the task editor's start, finish,
constraint, deadline and actual dates, and the filter bar's date window —
renders through the new `ScheduleDateInput`, which uses the host control when
one is supplied and the native date input otherwise, so existing hosts are
unaffected.

The control receives `ScheduleDateInputProps`: an ISO `yyyy-mm-dd` value or
`''`, an `onChange` that reports the same shape, and `min`, `max`, `disabled`,
`required`, `id`, `name`, `aria-label`, `aria-labelledby` and `className`. The
task editor now pairs each date with its visible label. `useScheduleComponents`
and `NativeScheduleDateInput` are exported alongside.
