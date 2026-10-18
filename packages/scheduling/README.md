# @braedonsaunders/appkit-scheduling

Project scheduling: critical-path scheduling with working calendars,
work-breakdown rollups, baselines and resource leveling, plus the Gantt, list
and board authoring surface.

```bash
pnpm add @braedonsaunders/appkit-scheduling @braedonsaunders/appkit-ui
```

Import `@braedonsaunders/appkit-scheduling/styles.css` beside the AppKit tokens
stylesheet; it defines the `--sched-*` colour channels the surface draws with.

## Entry points

- `@braedonsaunders/appkit-scheduling` — the engine. No React and no database:
  calendars with holidays, the four dependency types with lag, forward and
  backward CPM passes, total float and the critical set, violation and cycle
  detection, outline indent/outdent/reorder, duration-weighted rollups,
  timeline geometry, schedule insights and resource leveling. It runs in Node,
  a worker or the browser, so a server can validate the same plan the surface
  edits.
- `@braedonsaunders/appkit-scheduling/react` — client components:
  `ScheduleWorkspace` composes the toolbar, filters, Gantt / list / board views,
  task editor, management dialog and leveling panel. The host persists every
  edit through a `ScheduleAdapter`; each adapter method resolves `false` to
  roll the optimistic change back.

## Host integration

Wrap the surface in `SchedulingProvider` once. Everything it accepts is
optional; without it the surface renders English labels, formats dates in the
runtime locale and edits dates with the native date input.

```tsx
'use client'
import { ScheduleWorkspace, SchedulingProvider } from '@braedonsaunders/appkit-scheduling/react'

<SchedulingProvider
  labels={labels}              // partial overrides merged over the English defaults
  locale={locale}              // drives the default date formatters
  components={{ DateInput }}   // the host's own date control
>
  <ScheduleWorkspace data={data} adapter={adapter} />
</SchedulingProvider>
```

### Supplying your own date control

Every date the surface edits — task start, finish, constraint, deadline and
actual dates in the task editor, and the start/finish window in the filter
bar — renders through `ScheduleDateInput`. Pass a component as
`components.DateInput` and all of them use it; leave it out and they keep the
native `<input type="date">` (exported as `NativeScheduleDateInput`).

The component receives `ScheduleDateInputProps`:

| Prop | Contract |
| --- | --- |
| `value` | ISO calendar date `yyyy-mm-dd`, or `''` for no date. Never `null`. |
| `onChange(value)` | Report the settled date as ISO `yyyy-mm-dd`, or `''` when cleared. Report `''` rather than a guess for text that is not a date. |
| `min`, `max` | Optional ISO bounds. |
| `disabled`, `required` | Booleans; a summary task's derived dates arrive disabled. |
| `id`, `name` | The editor pairs each date with its visible label through `id`. |
| `aria-label`, `aria-labelledby` | Accessible name when there is no paired label (the filter bar). |
| `className` | Sizing utilities, such as the filter bar's compact height and width. |
| `data-testid` | Test hooks the surface sets on some dates. |

Any component that honours this contract fits, including one with typed entry
in the viewer's locale, keyboard shortcuts or a calendar popover:

```tsx
import type { ScheduleDateInputProps } from '@braedonsaunders/appkit-scheduling/react'

function DateInput(props: ScheduleDateInputProps) {
  return <MyDateField {...props} />
}
```

Keep the `components` object stable (define it at module scope or memoize it)
so the provider does not re-render the surface on every parent render.
