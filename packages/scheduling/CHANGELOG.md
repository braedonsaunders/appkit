# @braedonsaunders/appkit-scheduling

## 2.1.0

### Minor Changes

- 24e1d2c: `SchedulingProvider` accepts `components.DateInput`, a host-supplied date
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

## 2.0.0

### Patch Changes

- Updated dependencies [22722ea]
  - @braedonsaunders/appkit-ui@0.3.0

## 1.0.0

### Patch Changes

- Updated dependencies [22e968a]
- Updated dependencies [9f04661]
  - @braedonsaunders/appkit-ui@0.2.0

## 0.2.0

### Minor Changes

- a1d5d50: Add `@braedonsaunders/appkit-scheduling`: critical-path scheduling with working calendars,
  work-breakdown rollups, baselines, resource leveling, and the Gantt / list /
  board authoring surface under `@braedonsaunders/appkit-scheduling/react`.

  `@braedonsaunders/appkit-ui` gains a `calendar` navigation icon key.

### Patch Changes

- Updated dependencies [0c2dde7]
- Updated dependencies [0c2dde7]
- Updated dependencies [a1d5d50]
- Updated dependencies [8a17e9e]
  - @braedonsaunders/appkit-ui@0.1.10
