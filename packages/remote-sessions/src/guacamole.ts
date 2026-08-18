import { createCipheriv, randomBytes } from 'node:crypto'
import type { RemoteControlScope } from './types'

export type GuacamoleDesktopProtocol = 'rdp' | 'vnc'

export type GuacamoleConnection = {
  protocol: GuacamoleDesktopProtocol
  host: string
  port: number
  username?: string | null
  password?: string | null
  domain?: string | null
  width?: number
  height?: number
  dpi?: number
  scope: RemoteControlScope
}

export type GuacamoleBridge = {
  close(): void
  on(event: 'open' | 'close', listener: (...args: unknown[]) => void): void
}

function keyBytes(value: Buffer | string): Buffer {
  const key = Buffer.isBuffer(value) ? value : Buffer.from(value, 'base64')
  if (key.byteLength !== 32) throw new Error('The Guacamole bridge cipher key must be exactly 32 bytes.')
  return key
}

export function encryptGuacamoleConnection(connection: GuacamoleConnection, cipherKey: Buffer | string): string {
  const readOnly = connection.scope === 'observe'
  const settings = {
    hostname: connection.host,
    port: String(connection.port),
    width: connection.width ?? 1440,
    height: connection.height ?? 900,
    dpi: connection.dpi ?? 96,
    'read-only': readOnly,
    ...(connection.username ? { username: connection.username } : {}),
    ...(connection.password ? { password: connection.password } : {}),
    ...(connection.protocol === 'rdp' && connection.domain ? { domain: connection.domain } : {}),
    ...(connection.protocol === 'rdp'
      ? {
          security: 'any',
          'ignore-cert': true,
          'enable-wallpaper': false,
          'enable-font-smoothing': true,
          'resize-method': 'display-update',
          'color-depth': '24',
        }
      : { cursor: true, 'color-depth': '24' }),
  }
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', keyBytes(cipherKey), iv)
  let encrypted = cipher.update(JSON.stringify({ connection: { type: connection.protocol, settings } }), 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), value: encrypted }), 'utf8').toString('base64')
}

export function guacamoleConnectQuery(input: {
  connection: GuacamoleConnection
  cipherKey: Buffer | string
  sessionId: string
  leaseId: string
}): string {
  return new URLSearchParams({
    token: encryptGuacamoleConnection(input.connection, input.cipherKey),
    sessionId: input.sessionId,
    leaseId: input.leaseId,
    scope: input.connection.scope,
  }).toString()
}

export async function createGuacamoleBridge(input: {
  host?: string
  port: number
  guacdHost: string
  guacdPort?: number
  cipherKey: Buffer | string
  onOpen?: (...args: unknown[]) => void
  onClose?: (...args: unknown[]) => void
}): Promise<GuacamoleBridge> {
  // Keep the server-only bridge optional for browser-only consumers. The
  // package does not publish declarations, so the non-literal specifier also
  // keeps application typechecks from inheriting an ambient-module shim.
  const bridgeModule = 'guacamole-lite'
  const module = await import(bridgeModule)
  const GuacamoleLite = (module.default ?? module) as unknown as new (
    websocket: Record<string, unknown>,
    guacd: Record<string, unknown>,
    client: Record<string, unknown>,
  ) => GuacamoleBridge
  const bridge = new GuacamoleLite(
    { host: input.host ?? '0.0.0.0', port: input.port },
    { host: input.guacdHost, port: input.guacdPort ?? 4822 },
    {
      maxInactivityTime: 0,
      crypt: { cypher: 'AES-256-CBC', key: keyBytes(input.cipherKey) },
      log: { level: 'ERRORS', stdLog: () => {}, errorLog: (...args: unknown[]) => console.error('[guacamole]', ...args) },
    },
  )
  if (input.onOpen) bridge.on('open', input.onOpen)
  if (input.onClose) bridge.on('close', input.onClose)
  return bridge
}
