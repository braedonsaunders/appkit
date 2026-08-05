import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import type { ChildProcess } from 'node:child_process'
import { ProcessSandboxSupervisor } from './supervisor'

type FakeChild = ChildProcess & {
  stdout: PassThrough
  stderr: PassThrough
  killedWith: NodeJS.Signals[]
}

function fakeChild(options: { exitOnKill?: boolean } = {}): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killedWith = []
  child.kill = ((signal: NodeJS.Signals = 'SIGTERM') => {
    child.killedWith.push(signal)
    if (options.exitOnKill) queueMicrotask(() => child.emit('exit', null, signal))
    return true
  }) as ChildProcess['kill']
  return child
}

const processOptions = {
  command: '/usr/bin/true',
  cwd: '/workspace',
  writablePaths: ['/workspace'],
} as const

test('starts idempotently, preserves stream order, and retains a reattachable result', async () => {
  const child = fakeChild()
  let launches = 0
  const supervisor = new ProcessSandboxSupervisor({
    launcher: () => {
      launches += 1
      return child
    },
  })

  const started = supervisor.start({ executionId: 'run:one', process: processOptions })
  const duplicate = supervisor.start({ executionId: 'run:one', process: processOptions })
  assert.equal(launches, 1)
  assert.equal(started.status, 'running')
  assert.equal(duplicate.executionId, 'run:one')

  child.stdout.write('hello ')
  child.stderr.write('world')
  child.emit('exit', 0, null)

  const result = await supervisor.result('run:one')
  assert.equal(result.status, 'completed')
  assert.equal(result.output, 'hello world')
  assert.equal(result.outputTruncated, false)

  const replay = supervisor.snapshot('run:one', 1)
  assert.deepEqual(replay?.events.map((event) => event.type), ['stdout', 'stderr', 'finished'])
  assert.equal(replay?.result?.output, 'hello world')
})

test('waitForUpdate supports long-poll reattachment without losing a boundary event', async () => {
  const child = fakeChild()
  const supervisor = new ProcessSandboxSupervisor({ launcher: () => child })
  const started = supervisor.start({ executionId: 'waitable', process: processOptions })

  const waiting = supervisor.waitForUpdate('waitable', started.latestSequence, { timeoutMs: 1_000 })
  child.stdout.write('new output')
  const update = await waiting

  assert.equal(update?.events.length, 1)
  assert.equal(update?.events[0]?.type, 'stdout')
  child.emit('exit', 0, null)
  await supervisor.result('waitable')
})

test('bounds output and replay independently while retaining terminal evidence', async () => {
  const child = fakeChild()
  const supervisor = new ProcessSandboxSupervisor({
    launcher: () => child,
  })
  supervisor.start({
    executionId: 'bounded',
    process: processOptions,
    maxOutputBytes: 5,
    maxReplayEvents: 2,
  })
  child.stdout.write('abc')
  child.stderr.write('def')
  child.emit('exit', 7, null)

  const result = await supervisor.result('bounded')
  assert.equal(result.status, 'failed')
  assert.equal(result.output, 'abcde\n[output truncated]')
  assert.equal(result.outputTruncated, true)
  const snapshot = supervisor.snapshot('bounded', 0)
  assert.equal(snapshot?.replayTruncated, true)
  assert.deepEqual(snapshot?.events.map((event) => event.type), ['stderr', 'finished'])
})

test('distinguishes cancellation and timeout from an ordinary failure', async () => {
  const cancelledChild = fakeChild({ exitOnKill: true })
  const timedOutChild = fakeChild({ exitOnKill: true })
  const children = [cancelledChild, timedOutChild]
  const supervisor = new ProcessSandboxSupervisor({
    launcher: () => children.shift()!,
    defaultTimeoutMs: 10,
    killGraceMs: 0,
  })

  supervisor.start({ executionId: 'cancelled', process: processOptions, timeoutMs: 1_000 })
  assert.equal(supervisor.cancel('cancelled'), true)
  assert.equal((await supervisor.result('cancelled')).status, 'cancelled')
  assert.deepEqual(cancelledChild.killedWith, ['SIGTERM'])

  supervisor.start({ executionId: 'timed-out', process: processOptions })
  assert.equal((await supervisor.result('timed-out')).status, 'timed_out')
  assert.deepEqual(timedOutChild.killedWith, ['SIGTERM'])
})

test('expires settled executions and evicts only settled work at capacity', async () => {
  const first = fakeChild()
  const second = fakeChild()
  const third = fakeChild()
  const children = [first, second, third]
  const supervisor = new ProcessSandboxSupervisor({
    launcher: () => children.shift()!,
    maxExecutions: 2,
  })

  supervisor.start({ executionId: 'old', process: processOptions })
  first.emit('exit', 0, null)
  await supervisor.result('old')
  supervisor.start({ executionId: 'live', process: processOptions })
  supervisor.start({ executionId: 'newest', process: processOptions })

  assert.equal(supervisor.snapshot('old'), null)
  assert.equal(supervisor.snapshot('live')?.status, 'running')
  assert.equal(supervisor.snapshot('newest')?.status, 'running')
})

test('forgets a settled execution after its retention period', async () => {
  let now = 1_000
  const child = fakeChild()
  const supervisor = new ProcessSandboxSupervisor({
    launcher: () => child,
    now: () => now,
    defaultRetentionMs: 50,
  })
  supervisor.start({ executionId: 'expiring', process: processOptions })
  child.emit('exit', 0, null)
  await supervisor.result('expiring')
  now += 51
  assert.equal(supervisor.snapshot('expiring'), null)
})
