import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abort, forbidden, runSandbox } from './index'

test('isolates authored code and deeply freezes its input', async () => {
  const result = await runSandbox({
    source: 'function main(ctx) { try { ctx.value = 2 } catch {} return { value: ctx.value, process: typeof process, require: typeof require } }',
    input: { value: 1 },
  })
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.value, { value: 1, process: 'undefined', require: 'undefined' })
})

test('exposes nested async host capabilities and charges units', async () => {
  const result = await runSandbox({
    source: 'function main(ctx) { app.log("running", ctx.n); return app.math.double(ctx.n) }',
    input: { n: 4 },
    functions: { 'math.double': { cost: 7, handler: ([value]) => Number(value) * 2 } },
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.value, 8)
  assert.deepEqual(result.logs, ['running 4'])
  assert.equal(result.units, 8)
})

test('classifies host faults without leaking host errors', async () => {
  const denied = await runSandbox({
    source: 'function main() { return app.records.get("1") }',
    input: null,
    functions: { 'records.get': { cost: 2, handler: () => forbidden('records.read is required') } },
  })
  assert.equal(denied.status, 'forbidden')
  assert.equal(denied.error, 'records.read is required')

  const stopped = await runSandbox({
    source: 'function main() { app.abort("stop") }',
    input: null,
    functions: { abort: { cost: 0, handler: ([reason]) => abort(String(reason)) } },
  })
  assert.equal(stopped.status, 'aborted')
  assert.equal(stopped.error, 'stop')
})

test('stops scripts that exceed governance or wall-clock limits', async () => {
  const governed = await runSandbox({
    source: 'function main() { for (let i = 0; i < 4; i++) app.write(i) }',
    input: null,
    unitBudget: 5,
    functions: { write: { cost: 2, handler: () => null } },
  })
  assert.equal(governed.status, 'governance')

  const timed = await runSandbox({
    source: 'function main() { while (true) {} }',
    input: null,
    timeoutMs: 10,
  })
  assert.equal(timed.status, 'timeout')
})
