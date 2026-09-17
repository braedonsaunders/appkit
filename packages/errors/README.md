# @braedonsaunders/appkit-errors

The universal action-error layer: one vocabulary and one path for "the user
did something and the server said no". Every drawer, form and list row that
hand-rolls its own error handling eventually produces the same defect — the
button spins forever, a toast flashes and vanishes, or the reason lands only
in the console. This package is the shared path that makes that class
structurally impossible.

```bash
pnpm add @braedonsaunders/appkit-errors @braedonsaunders/appkit-ui
```

Import `@braedonsaunders/appkit-errors/styles.css` beside the AppKit UI
stylesheet so Tailwind scans the React entry.

## What it makes true

1. **One vocabulary.** `ErrorKind` — `validation` (400) · `denied`
   (401/403) · `not-found` (404/410) · `conflict` (409) · `refused` (422) ·
   `transport` (no response) · `unexpected` (everything else). Classified
   from the status by `kindForStatus`; the stable server `code` and 400
   `issues[]` ride along on the `ActionError`. Never parse a message string
   to learn what happened.
2. **A read path that cannot throw.** `readActionResult(response)` and
   `fetchAction(url, init)` return a discriminated `ActionResult` — never
   throw. Non-JSON bodies (proxy error pages, empty responses) become
   messageless refusals classified by status instead of escaping past the
   notification and wedging the button.
3. **Presentation that persists.** `useAction` pins the refusal until the
   next action; `ActionAlert` renders it as a house `Alert` (`role="alert"`,
   destructive). Notifications still fire through host wiring — the alert is
   what outlives them.
4. **Busy state that always releases.** `executeAction` runs `onSettled` in
   a `finally`. Call sites never write their own reset again.
5. **Localizable by construction.** The package authors no user-facing copy:
   every fallback and title is a host-supplied string, and server reasons
   surface verbatim. `toDisplayMessage` replaces SQL, stack frames, driver
   text and internal ids with the fallback.
6. **House style.** `ActionAlert` is `@braedonsaunders/appkit-ui` `Alert`
   primitives — no parallel design language.

## Use

```tsx
'use client'
import { fetchAction } from '@braedonsaunders/appkit-errors'
import { ActionAlert, useAction } from '@braedonsaunders/appkit-errors/react'

const { busy, refusal, execute } = useAction({
  notifyError: (message) => toast.error(message),
  notifySuccess: (message) => toast.success(message),
})

async function save() {
  await execute(
    () =>
      fetchAction('/api/records/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', recordId: id }),
      }),
    {
      fallbackMessage: t('actions.saveFailed'),
      successMessage: t('actions.saved'),
      onOk: () => router.refresh(),
      // onRefused is optional: the refusal is already pinned + notified.
      // Branch on error.kind / error.code here, never on message text.
    },
  )
}

return (
  <>
    <ActionAlert error={refusal} fallbackMessage={t('actions.saveFailed')} />
    <Button disabled={busy} onClick={save}>…</Button>
  </>
)
```

Branching guide: `conflict` → offer reload; `denied` → explain, never
retry; `not-found` → refresh; `transport` with `aborted` → timeout copy;
`validation` → render `error.issues` (the alert already lists them).

## Host-owned boundaries

- The endpoint contract: action routes return `{ error }` with an optional
  stable `code` and `issues[]`. Map domain failures (rule rejections,
  revision conflicts) to statuses; the package classifies from there.
- All user-facing copy: fallbacks, titles, notifications.
- The notification library: `useAction` takes `notifyError`/`notifySuccess`
  callbacks and never imports one, so the core also works in workers.
- Error reporting: `useAction` reports `unexpected` and `transport`
  failures to `console.error` by default; override `reportError` with real
  reporting (which may sample routine transport failures).
