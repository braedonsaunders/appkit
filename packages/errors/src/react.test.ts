import assert from 'node:assert/strict'
import test from 'node:test'

// jsdom first: react-dom reads browser globals at render.
const { JSDOM } = await import('jsdom')

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000/records',
})
const globals = globalThis as Record<string, unknown>
const domWindow = dom.window as unknown as Record<string, unknown>
for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'self']) {
  if (globals[key] === undefined) globals[key] = domWindow[key]
}
globals['IS_REACT_ACT_ENVIRONMENT'] = true

const React = await import('react')
// tsx compiles imported JSX in classic mode from the repo root (no root
// tsconfig), so React must be global — the same convention as the ui tests.
Object.assign(globalThis, { React })
const { act } = React
const { createRoot } = await import('react-dom/client')
const { ActionError } = await import('./action-error')
const { ActionAlert } = await import('./action-alert')
const { useAction } = await import('./use-action')
const { fetchAction } = await import('./fetch')
import type { ActionResult } from './read'

function render(node: React.ReactElement): { container: HTMLElement; dispose: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    dispose: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

const refused = (message: string): ActionResult<never> => ({
  ok: false,
  error: new ActionError({ kind: 'refused', status: 422, serverMessage: message }),
})

test('ActionAlert renders nothing without a refusal', () => {
  const { container, dispose } = render(
    React.createElement(ActionAlert, { error: null, fallbackMessage: 'fallback' }),
  )
  try {
    assert.equal(container.querySelector('[role="alert"]'), null)
    assert.equal(container.textContent, '')
  } finally {
    dispose()
  }
})

test('ActionAlert pins the server reason in a role=alert', () => {
  const error = new ActionError({ kind: 'refused', status: 422, serverMessage: 'This record is locked for editing' })
  const { container, dispose } = render(
    React.createElement(ActionAlert, { error, fallbackMessage: 'fallback' }),
  )
  try {
    const alert = container.querySelector('[role="alert"]')
    assert.ok(alert, 'the refusal must persist as a role=alert, not a transient notification')
    assert.match(alert.textContent ?? '', /This record is locked for editing/)
  } finally {
    dispose()
  }
})

test('ActionAlert falls back when the server sent nothing usable', () => {
  const error = new ActionError({ kind: 'unexpected', status: 500 })
  const { container, dispose } = render(
    React.createElement(ActionAlert, { error, fallbackMessage: 'Something went wrong' }),
  )
  try {
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /Something went wrong/)
  } finally {
    dispose()
  }
})

test('ActionAlert lists field issues under the message', () => {
  const error = new ActionError({
    kind: 'validation',
    status: 400,
    serverMessage: 'fix the highlighted fields',
    issues: [
      { path: 'startDate', message: 'must be a valid date' },
      { path: 'name', message: 'is required' },
    ],
  })
  const { container, dispose } = render(
    React.createElement(ActionAlert, { error, fallbackMessage: 'fallback' }),
  )
  try {
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    assert.deepEqual(items, ['must be a valid date', 'is required'])
  } finally {
    dispose()
  }
})

test('ActionAlert dismiss needs both label and handler, or renders no button', () => {
  const error = new ActionError({ kind: 'refused', status: 422, serverMessage: 'nope' })
  const labeled = render(
    React.createElement(ActionAlert, {
      error,
      fallbackMessage: 'fallback',
      dismissLabel: 'Dismiss error',
      onDismiss: () => undefined,
    }),
  )
  try {
    const button = labeled.container.querySelector('button[aria-label="Dismiss error"]')
    assert.ok(button, 'a labeled dismiss must render an accessible button')
  } finally {
    labeled.dispose()
  }
  const unlabeled = render(React.createElement(ActionAlert, { error, fallbackMessage: 'fallback' }))
  try {
    assert.equal(unlabeled.container.querySelector('button'), null)
  } finally {
    unlabeled.dispose()
  }
})

test('useAction releases busy, pins the refusal, and notifies on refusal', async () => {
  const notifications: [string, string][] = []
  let latest: ReturnType<typeof useAction> | null = null
  function Harness() {
    const hook = useAction({
      notifyError: (message) => notifications.push(['error', message]),
      notifySuccess: (message) => notifications.push(['success', message]),
    })
    latest = hook
    return React.createElement('div', {
      'data-busy': String(hook.busy),
      'data-refusal': hook.refusal ? hook.refusal.displayMessage('fallback') : '',
    })
  }
  const { container, dispose } = render(React.createElement(Harness))
  try {
    assert.equal(container.querySelector('div')?.getAttribute('data-busy'), 'false')
    let succeeded = true
    await act(async () => {
      succeeded = (await latest?.execute(async () => refused('This record is locked for editing'), {
        fallbackMessage: 'fallback',
      })) ?? true
    })
    assert.equal(succeeded, false)
    // Busy released even though the action was refused — the stuck-button
    // path this hook exists to close.
    assert.equal(container.querySelector('div')?.getAttribute('data-busy'), 'false')
    assert.equal(container.querySelector('div')?.getAttribute('data-refusal'), 'This record is locked for editing')
    assert.deepEqual(notifications, [['error', 'This record is locked for editing']])
  } finally {
    dispose()
  }
})

test('useAction clears the previous refusal on the next action and reports success', async () => {
  const notifications: [string, string][] = []
  let latest: ReturnType<typeof useAction> | null = null
  function Harness() {
    const hook = useAction({ notifySuccess: (message) => notifications.push(['success', message]) })
    latest = hook
    return React.createElement('div', {
      'data-refusal': hook.refusal ? hook.refusal.displayMessage('fallback') : '',
    })
  }
  const { container, dispose } = render(React.createElement(Harness))
  try {
    await act(async () => {
      await latest?.execute(async () => refused('first refusal'), { fallbackMessage: 'fallback' })
    })
    assert.equal(container.querySelector('div')?.getAttribute('data-refusal'), 'first refusal')
    let succeeded = false
    await act(async () => {
      succeeded =
        (await latest?.execute(async () => ({ ok: true, status: 200, data: 'saved' }) as const, {
          fallbackMessage: 'fallback',
          successMessage: 'Saved',
        })) ?? false
    })
    assert.equal(succeeded, true)
    assert.equal(container.querySelector('div')?.getAttribute('data-refusal'), '')
    assert.deepEqual(notifications, [['success', 'Saved']])
  } finally {
    dispose()
  }
})

test('useAction turns a throwing task into an unexpected refusal: busy releases, fallback notifies', async () => {
  const notifications: string[] = []
  let latest: ReturnType<typeof useAction> | null = null
  function Harness() {
    const hook = useAction({ notifyError: (message) => notifications.push(message) })
    latest = hook
    return React.createElement('div', {
      'data-busy': String(hook.busy),
      'data-kind': hook.refusal?.kind ?? '',
    })
  }
  const { container, dispose } = render(React.createElement(Harness))
  try {
    let succeeded = true
    await act(async () => {
      succeeded =
        (await latest?.execute(
          async (): Promise<ActionResult<string>> => {
            throw new Error('host bug')
          },
          { fallbackMessage: 'fallback' },
        )) ?? true
    })
    assert.equal(succeeded, false)
    assert.equal(container.querySelector('div')?.getAttribute('data-busy'), 'false')
    assert.equal(container.querySelector('div')?.getAttribute('data-kind'), 'unexpected')
    assert.deepEqual(notifications, ['fallback'])
  } finally {
    dispose()
  }
})

test('the full path — fetchAction refusal through useAction — pins and notifies', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: false,
    status: 422,
    json: async () => ({ error: 'The current phase must be closed before finalizing the summary' }),
  })) as unknown as typeof fetch
  const notifications: string[] = []
  let latest: ReturnType<typeof useAction> | null = null
  function Harness() {
    const hook = useAction({ notifyError: (message) => notifications.push(message) })
    latest = hook
    return React.createElement('div', {
      'data-refusal': hook.refusal ? hook.refusal.displayMessage('fallback') : '',
    })
  }
  const { container, dispose } = render(React.createElement(Harness))
  try {
    await act(async () => {
      await latest?.execute(() => fetchAction('/api/records/actions'), { fallbackMessage: 'fallback' })
    })
    assert.equal(
      container.querySelector('div')?.getAttribute('data-refusal'),
      'The current phase must be closed before finalizing the summary',
    )
    assert.deepEqual(notifications, ['The current phase must be closed before finalizing the summary'])
  } finally {
    globalThis.fetch = realFetch
    dispose()
  }
})
