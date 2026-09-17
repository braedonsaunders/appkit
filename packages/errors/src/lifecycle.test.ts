import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionError } from './action-error'
import { executeAction } from './lifecycle'
import type { ActionResult } from './read'

const refused = <T = never>(kind: 'refused' = 'refused'): ActionResult<T> => ({
  ok: false,
  error: new ActionError({ kind, status: 422, serverMessage: 'This record is locked for editing' }),
})

test('the settled handler runs on success, refusal, and rejection alike', async () => {
  for (const task of [
    async () => ({ ok: true, status: 200, data: 'done' }) as const,
    async () => refused<string>(),
    async (): Promise<ActionResult<string>> => {
      throw new Error('host bug')
    },
  ]) {
    let settled = 0
    await executeAction(task, {
      onSettled: () => {
        settled += 1
      },
      onRefused: () => undefined,
    })
    assert.equal(settled, 1, 'busy must release on every path')
  }
})

test('a refusal routes to onRefused with the classified error', async () => {
  // unknown (not a union): assignments inside the handler closure must not
  // collapse what instanceof can narrow at the read site.
  let presented: unknown = null
  let okData: unknown = null
  await executeAction(async () => refused<string>(), {
    onOk: (data) => {
      okData = data
    },
    onRefused: (error) => {
      presented = error
    },
  })
  assert.equal(okData, null)
  if (!(presented instanceof ActionError)) throw new Error('expected the refusal to reach onRefused')
  assert.equal(presented.kind, 'refused')
})

test('a throwing task becomes an unexpected refusal when someone is listening', async () => {
  let presented: unknown = null
  await executeAction(
    async (): Promise<ActionResult<string>> => {
      throw new Error('host bug')
    },
    {
      onRefused: (error) => {
        presented = error
      },
    },
  )
  if (!(presented instanceof ActionError)) throw new Error('expected the throw to reach onRefused as unexpected')
  assert.equal(presented.kind, 'unexpected')
  assert.match(presented.detail ?? '', /host bug/)
})

test('without onRefused nothing is swallowed: refusals and throws propagate', async () => {
  await assert.rejects(
    executeAction(async () => refused<string>(), { onSettled: () => undefined }),
    (thrown: unknown) => thrown instanceof ActionError && thrown.kind === 'refused',
  )
  await assert.rejects(
    executeAction(async (): Promise<ActionResult<string>> => {
      throw new Error('host bug')
    }),
    /host bug/,
  )
})

test('a throw from inside onRefused propagates untouched, never re-presents', async () => {
  let presentations = 0
  await assert.rejects(
    executeAction(async () => refused<string>(), {
      onRefused: () => {
        presentations += 1
        throw new Error('presenter bug')
      },
    }),
    /presenter bug/,
  )
  assert.equal(presentations, 1)
})

test('onStart runs before the task', async () => {
  const order: string[] = []
  await executeAction(
    async () => {
      order.push('task')
      return { ok: true, status: 200, data: null }
    },
    {
      onStart: () => order.push('start'),
      onSettled: () => order.push('settled'),
    },
  )
  assert.deepEqual(order, ['start', 'task', 'settled'])
})
