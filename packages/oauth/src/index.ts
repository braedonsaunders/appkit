import { createHash, randomBytes } from 'node:crypto'
import { getJson, postForm, postJson } from './egress'

/**
 * The OAuth 2.1 client half of connecting to a protected API server — built
 * for MCP servers, whose specification composes RFC 9728 (protected-resource
 * metadata), RFC 8414 (authorization-server metadata), RFC 7591 (dynamic
 * client registration), PKCE, and RFC 8707 (resource indicators).
 *
 * The package is deliberately storage-free: it discovers, registers,
 * exchanges, and refreshes, and the application decides how client
 * registrations and tokens are persisted (sealed, in AppKit applications).
 * Browser-facing state (the `state` parameter, session binding) is likewise
 * the application's responsibility.
 */

export type OAuthAuthorization = {
  /** The RFC 8707 resource indicator tokens are requested for — the server URL. */
  resource: string
  /** The authorization server's issuer identifier. */
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  /** Present when the server offers RFC 7591 dynamic client registration. */
  registrationEndpoint?: string
  scopesSupported?: string[]
}

export type OAuthClient = {
  clientId: string
  /** Confidential clients only; omitted for public (PKCE-only) registrations. */
  clientSecret?: string
}

export type OAuthTokens = {
  accessToken: string
  tokenType: string
  refreshToken?: string
  /** Epoch milliseconds the access token expires at, when a lifetime was reported. */
  expiresAt?: number
  scope?: string
}

// --- Discovery ---------------------------------------------------------------

/** RFC 9728 well-known candidates for a protected resource, most specific first. */
export function protectedResourceMetadataUrls(serverUrl: string): string[] {
  const url = new URL(serverUrl)
  const path = url.pathname.replace(/\/+$/, '')
  const candidates = [`${url.origin}/.well-known/oauth-protected-resource${path}`]
  if (path) candidates.push(`${url.origin}/.well-known/oauth-protected-resource`)
  return candidates
}

/** RFC 8414 / OpenID Connect well-known candidates for an issuer, in order. */
export function authorizationServerMetadataUrls(issuer: string): string[] {
  const url = new URL(issuer)
  const path = url.pathname.replace(/\/+$/, '')
  const candidates = [`${url.origin}/.well-known/oauth-authorization-server${path}`]
  if (path) candidates.push(`${url.origin}/.well-known/oauth-authorization-server`)
  candidates.push(`${url.origin}/.well-known/openid-configuration${path}`)
  if (path) candidates.push(`${url.origin}${path}/.well-known/openid-configuration`)
  return [...new Set(candidates)]
}

function readAuthorizationServerMetadata(
  issuer: string,
  resource: string,
  document: Record<string, unknown>,
): OAuthAuthorization | null {
  const authorizationEndpoint = document.authorization_endpoint
  const tokenEndpoint = document.token_endpoint
  if (typeof authorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') return null
  const registrationEndpoint = document.registration_endpoint
  const scopesSupported = document.scopes_supported
  return {
    resource,
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...(typeof registrationEndpoint === 'string' ? { registrationEndpoint } : {}),
    ...(Array.isArray(scopesSupported) && scopesSupported.every((scope) => typeof scope === 'string')
      ? { scopesSupported: scopesSupported as string[] }
      : {}),
  }
}

/**
 * Work out how to sign in to a protected server: read its protected-resource
 * metadata to find the authorization server (falling back to the server's own
 * origin when it publishes none), then read that server's metadata for the
 * endpoints. Throws a readable explanation when the server does not offer
 * OAuth at all.
 */
export async function discoverAuthorization(serverUrl: string): Promise<OAuthAuthorization> {
  const server = new URL(serverUrl)

  let issuer = server.origin
  let resource = server.toString()
  let resourceScopes: string[] | undefined
  for (const candidate of protectedResourceMetadataUrls(serverUrl)) {
    const document = await getJson(candidate)
    if (!document) continue
    const servers = document.authorization_servers
    if (Array.isArray(servers) && typeof servers[0] === 'string') issuer = servers[0]
    if (typeof document.resource === 'string') resource = document.resource
    const scopes = document.scopes_supported
    if (Array.isArray(scopes) && scopes.length > 0 && scopes.every((scope) => typeof scope === 'string')) {
      resourceScopes = scopes as string[]
    }
    break
  }

  for (const candidate of authorizationServerMetadataUrls(issuer)) {
    const document = await getJson(candidate)
    if (!document) continue
    const authorization = readAuthorizationServerMetadata(issuer, resource, document)
    // The resource's own scope list (RFC 9728) names what THIS server needs;
    // the authorization server's list spans every resource it protects.
    if (authorization) return resourceScopes ? { ...authorization, scopesSupported: resourceScopes } : authorization
  }

  throw new Error(
    `${server.hostname} does not advertise OAuth sign-in (no authorization-server metadata was found). Connect with an API key or token header instead.`,
  )
}

// --- Dynamic client registration ----------------------------------------------

/**
 * Register this application with the authorization server (RFC 7591) as a
 * public client — PKCE carries the proof, so no client secret exists to store.
 * Servers that require pre-registered clients simply omit the registration
 * endpoint; the caller should then ask the operator for a client ID.
 */
export async function registerClient(input: {
  authorization: OAuthAuthorization
  redirectUri: string
  clientName: string
  scope?: string
}): Promise<OAuthClient> {
  const endpoint = input.authorization.registrationEndpoint
  if (!endpoint) {
    throw new Error(
      `${new URL(input.authorization.issuer).hostname} does not offer automatic client registration — enter a client ID from the provider's developer settings.`,
    )
  }
  const registered = await postJson(endpoint, {
    client_name: input.clientName,
    redirect_uris: [input.redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    ...(input.scope ? { scope: input.scope } : {}),
  })
  const clientId = registered.client_id
  if (typeof clientId !== 'string' || !clientId) {
    throw new Error(`${new URL(endpoint).hostname} registered the client but returned no client ID.`)
  }
  const clientSecret = registered.client_secret
  return {
    clientId,
    ...(typeof clientSecret === 'string' && clientSecret ? { clientSecret } : {}),
  }
}

// --- Authorization ------------------------------------------------------------

/** A fresh PKCE pair (S256). The verifier stays server-side until the exchange. */
export function createPkce(): { verifier: string; challenge: string; method: 'S256' } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), method: 'S256' }
}

/** The consent URL the operator's browser is sent to. */
export function buildAuthorizationUrl(input: {
  authorization: OAuthAuthorization
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
  scope?: string
}): string {
  const url = new URL(input.authorization.authorizationEndpoint)
  for (const [key, value] of Object.entries({
    client_id: input.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    resource: input.authorization.resource,
    ...(input.scope ? { scope: input.scope } : {}),
  })) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

// --- Tokens -------------------------------------------------------------------

function readTokens(payload: { access_token?: string; token_type?: string; refresh_token?: string; expires_in?: number; scope?: string }, hostname: string): OAuthTokens {
  if (!payload.access_token) {
    throw new Error(`${hostname} did not return an access token.`)
  }
  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? 'Bearer',
    ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? { expiresAt: Date.now() + payload.expires_in * 1000 }
      : {}),
    ...(payload.scope ? { scope: payload.scope } : {}),
  }
}

/** Trade the authorization code for tokens (PKCE verifier proves possession). */
export async function exchangeAuthorizationCode(input: {
  authorization: Pick<OAuthAuthorization, 'tokenEndpoint' | 'resource'>
  client: OAuthClient
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<OAuthTokens> {
  const payload = await postForm(
    input.authorization.tokenEndpoint,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.client.clientId,
      code_verifier: input.codeVerifier,
      resource: input.authorization.resource,
      ...(input.client.clientSecret ? { client_secret: input.client.clientSecret } : {}),
    }),
  )
  return readTokens(payload, new URL(input.authorization.tokenEndpoint).hostname)
}

/**
 * Mint a fresh access token from the stored refresh token. Servers may rotate
 * the refresh token; when the result carries one, the caller must persist it
 * before the new access token is used for anything.
 */
export async function refreshTokens(input: {
  authorization: Pick<OAuthAuthorization, 'tokenEndpoint' | 'resource'>
  client: OAuthClient
  refreshToken: string
  scope?: string
}): Promise<OAuthTokens> {
  const payload = await postForm(
    input.authorization.tokenEndpoint,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: input.client.clientId,
      resource: input.authorization.resource,
      ...(input.client.clientSecret ? { client_secret: input.client.clientSecret } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    }),
  )
  const tokens = readTokens(payload, new URL(input.authorization.tokenEndpoint).hostname)
  return tokens.refreshToken ? tokens : { ...tokens, refreshToken: input.refreshToken }
}

export { assertPublicHttpsEndpoint } from './egress'
