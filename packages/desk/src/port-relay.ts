import { createServer, type Server, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { DeskError } from './plan'

/** A local endpoint backed by a running desk's TCP connection. */
export interface DeskPortListener {
  host: '127.0.0.1'
  port: number
  /** Close the listener and every active connection. Safe to call repeatedly. */
  close(): Promise<void>
}

/** Expose one guest TCP port to local HTTP, WebSocket or other TCP clients. */
export async function listenDeskPort(
  desk: { connect(port: number): Promise<Duplex> },
  port: number,
): Promise<DeskPortListener> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DeskError('Guest TCP port must be between 1 and 65535.')
  const clients = new Set<Socket>()
  const guests = new Set<Duplex>()
  let closed = false
  let closing: Promise<void> | undefined
  const server: Server = createServer((client) => {
    if (closed) { client.destroy(); return }
    clients.add(client)
    client.once('close', () => clients.delete(client))
    client.on('error', () => client.destroy())
    void Promise.resolve().then(() => desk.connect(port)).then((guest) => {
      if (closed || client.destroyed) { guest.destroy(); return }
      guests.add(guest)
      guest.once('close', () => { guests.delete(guest); client.destroy() })
      guest.on('error', () => { guest.destroy(); client.destroy() })
      client.once('close', () => guest.destroy())
      client.pipe(guest).pipe(client)
    }, () => client.destroy())
  })
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => { server.off('error', onError); resolve() })
  })
  // Errors after listen must not become unhandled process errors.
  server.on('error', () => { void close() })
  const address = server.address()
  if (!address || typeof address === 'string') { server.close(); throw new DeskError('Could not determine desk relay address.') }
  function close(): Promise<void> {
    if (closing) return closing
    closed = true
    for (const client of clients) client.destroy()
    for (const guest of guests) guest.destroy()
    closing = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    return closing
  }
  return { host: '127.0.0.1', port: address.port, close }
}
