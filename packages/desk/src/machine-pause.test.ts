import assert from 'node:assert/strict'
import test from 'node:test'
import { Duplex } from 'node:stream'

function socket(): Duplex { return new Duplex({ read() {}, write(_chunk, _encoding, done) { done() } }) }
import { createGuestMachine } from './machine'

test('pause fences pending and new requests until resume succeeds', async () => {
  const stream = socket()
  const calls: string[] = []
  let failResume = true
  const machine = createGuestMachine({
    deskId: 'test', stream,
    exit: { done: false, promise: new Promise<void>(() => {}) },
    reconnect: async () => socket(), reconnectWindowMs: 1000,
    now: Date.now, idFactory: () => '1', requestTimeoutMs: 1000,
    stop: async () => {},
    pause: async () => { calls.push('pause') },
    resume: async () => { calls.push('resume'); if (failResume) throw new Error('failed') },
  })
  const pending = machine.request({ op: 'ping' })
  await machine.pause!()
  await assert.rejects(pending, /fate is unknown/)
  await assert.rejects(machine.request({ op: 'ping' }), /paused/)
  await assert.rejects(machine.resume!(), /failed/)
  await assert.rejects(machine.request({ op: 'ping' }), /paused/)
  failResume = false
  await machine.resume!()
  assert.deepEqual(calls, ['pause', 'resume', 'resume'])
  await machine.shutdown()
})


test('a dropped guest channel reconnects only after the VM resumes', async () => {
  const stream = socket()
  let reconnects = 0
  const machine = createGuestMachine({
    deskId: 'test', stream,
    exit: { done: false, promise: new Promise<void>(() => {}) },
    reconnect: async () => { reconnects++; return socket() }, reconnectWindowMs: 1000,
    now: Date.now, idFactory: () => '1', requestTimeoutMs: 1000,
    stop: async () => {}, pause: async () => {}, resume: async () => {},
  })
  await machine.pause!()
  stream.destroy()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(reconnects, 0)
  await machine.resume!()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(reconnects, 1)
  await machine.shutdown()
})
