import { AccessToken } from 'livekit-server-sdk'

/**
 * LiveKit access tokens. Server credentials (API key/secret) are deployment
 * infrastructure — the app passes them in; identities and rooms are the
 * app's domain (e.g. room per call session, identity per person id).
 */
export type LiveKitCredentials = { apiKey: string; apiSecret: string }

export type MintTokenArgs = {
  identity: string
  name: string
  room: string
  /** Serialized app context (tenant/person ids) surfaced to room participants. */
  metadata?: string
  canPublish?: boolean
  canSubscribe?: boolean
  /** Token validity, seconds (default 1h). */
  ttlSeconds?: number
}

export async function mintLiveKitToken(credentials: LiveKitCredentials, args: MintTokenArgs): Promise<string> {
  const token = new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity: args.identity,
    name: args.name,
    ttl: args.ttlSeconds ?? 3600,
    ...(args.metadata ? { metadata: args.metadata } : {}),
  })
  token.addGrant({
    room: args.room,
    roomJoin: true,
    canPublish: args.canPublish ?? true,
    canSubscribe: args.canSubscribe ?? true,
  })
  return token.toJwt()
}
