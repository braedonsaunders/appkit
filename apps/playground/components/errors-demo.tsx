'use client'

import * as React from 'react'
import { fetchAction, readActionResult, type ActionResult, type ErrorKind } from '@braedonsaunders/appkit-errors'
import { ActionAlert, useAction } from '@braedonsaunders/appkit-errors/react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@braedonsaunders/appkit-ui'

const SIMULATED: { kind: Exclude<ErrorKind, 'transport'>; status: number; label: string; body: unknown }[] = [
  { kind: 'validation', status: 400, label: 'Validation (400)', body: { error: 'startDate must be a valid date', code: 'invalid', issues: [{ path: 'startDate', message: 'must be a valid date' }] } },
  { kind: 'denied', status: 403, label: 'Denied (403)', body: { error: 'Only workspace admins can publish' } },
  { kind: 'not-found', status: 404, label: 'Not found (404)', body: { error: 'not found' } },
  { kind: 'conflict', status: 409, label: 'Conflict (409)', body: { error: 'Someone else saved this record first — reload and merge', code: 'revision_conflict' } },
  { kind: 'refused', status: 422, label: 'Refused (422)', body: { error: 'The current phase must be closed before finalizing the summary' } },
  { kind: 'unexpected', status: 500, label: 'Unexpected (500)', body: { code: 'internal_error' } },
]

function stubTask(entry: (typeof SIMULATED)[number]): () => Promise<ActionResult<{ saved: boolean }>> {
  // The real classifier reads a canned body — the refusal below is produced
  // by readActionResult, not hand-built, so the demo exercises the actual
  // kind/code/issues path.
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    return readActionResult({ ok: false, status: entry.status, json: async () => entry.body })
  }
}

export function ErrorsPackageDemo() {
  const events = React.useRef<string[]>([])
  const [, force] = React.useReducer((count: number) => count + 1, 0)
  const { busy, refusal, execute } = useAction({
    notifyError: (message) => {
      events.current = [`toast.error(${JSON.stringify(message)})`, ...events.current].slice(0, 5)
      force()
    },
    notifySuccess: (message) => {
      events.current = [`toast.success(${JSON.stringify(message)})`, ...events.current].slice(0, 5)
      force()
    },
  })

  async function simulate(entry: (typeof SIMULATED)[number]) {
    await execute(stubTask(entry), {
      fallbackMessage: 'Could not complete the action',
      successMessage: 'Saved',
    })
  }

  async function simulateTransport() {
    await execute(() => fetchAction('https://errors-demo.invalid/api/records/actions'), {
      fallbackMessage: 'Could not reach the server',
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Refuse an action, watch it persist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm opacity-70">
            Each button runs a refused action through <code>execute</code>. The refusal pins below as a{' '}
            <code>role=&quot;alert&quot;</code> until the next action — the toast alone would dismiss, the alert does not.
            Simulated bodies are labeled; the transport button performs a real unreachable fetch against a
            guaranteed-unresolvable name. A captive portal or intercepting proxy can answer instead of failing, so a
            different kind there means the network answered with a page, not that the package misclassified.
          </p>
          <div className="flex flex-wrap gap-2">
            {SIMULATED.map((entry) => (
              <Button key={entry.kind} variant="outline" disabled={busy} onClick={() => simulate(entry)}>
                {busy ? 'Working…' : entry.label}
              </Button>
            ))}
            <Button variant="outline" disabled={busy} onClick={simulateTransport}>
              {busy ? 'Working…' : 'Transport (no response)'}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Busy:</span>
            <Badge variant={busy ? 'warning' : 'success'}>{busy ? 'locked' : 'released'}</Badge>
            {refusal ? (
              <>
                <span className="opacity-70">Kind:</span>
                <Badge variant="info">{refusal.kind}</Badge>
                {refusal.code ? (
                  <>
                    <span className="opacity-70">Code:</span>
                    <Badge>{refusal.code}</Badge>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <ActionAlert error={refusal} fallbackMessage="Could not complete the action" />
          {events.current.length > 0 ? (
            <ul className="space-y-1 text-sm opacity-70">
              {events.current.map((event, index) => (
                <li key={`${index}-${event}`}>
                  <code>{event}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
