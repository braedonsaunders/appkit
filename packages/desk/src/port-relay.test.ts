import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnection } from 'node:net'
import { Duplex, PassThrough } from 'node:stream'
import { listenDeskPort } from './port-relay'

test('relays a loopback client to the requested guest port and closes it', async () => {
  let requested = 0
  const relay = await listenDeskPort({ async connect(port) {
    requested = port
    return new Duplex({ read() {}, write(chunk, _encoding, callback) { this.push(chunk); callback() } })
  } }, 14600)
  const socket = createConnection({ host: relay.host, port: relay.port })
  try {
    const response = new Promise<string>((resolve, reject) => { socket.once('data', (chunk) => resolve(String(chunk))); socket.once('error', reject) })
    socket.write('hello')
    assert.equal(await response, 'hello')
    assert.equal(requested, 14600)
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
    await Promise.all([relay.close(), relay.close()])
    await closed
  } finally { socket.destroy(); await relay.close() }
})

test('a guest connection completing after close is destroyed', async () => {
  let resolveGuest!: (stream: Duplex) => void
  let started!: () => void
  const begun = new Promise<void>((resolve) => { started = resolve })
  const relay = await listenDeskPort({ connect: () => { started(); return new Promise((resolve) => { resolveGuest = resolve }) } }, 80)
  const socket = createConnection({ host: relay.host, port: relay.port })
  socket.on('error', () => undefined)
  await begun
  await relay.close()
  const guest = new PassThrough()
  resolveGuest(guest)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(guest.destroyed, true)
  socket.destroy()
})

test('refuses invalid guest ports', async () => {
  await assert.rejects(() => listenDeskPort({ connect: async () => new PassThrough() }, 0), /between 1 and 65535/)
})
