import { constants, createHash, createSign, randomBytes } from 'node:crypto'
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
  /** RFC 8414 `grant_types_supported` — which flows this server will run. */
  grantTypesSupported?: string[]
  /** RFC 8414 `token_endpoint_auth_methods_supported`. */
  tokenEndpointAuthMethodsSupported?: string[]
  /**
   * RFC 8414 `token_endpoint_auth_signing_alg_values_supported` — the algorithms
   * a `private_key_jwt` client assertion may be signed with. Worth reading
   * rather than assuming: servers that mandate RSA-PSS (NetSuite) reject an
   * RS256 assertion as `invalid_grant`, which is indistinguishable from a wrong
   * key unless the caller was told the algorithm up front.
   */
  tokenEndpointAuthSigningAlgValuesSupported?: string[]
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
  const stringList = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
      ? (value as string[])
      : undefined
  const scopesSupported = stringList(document.scopes_supported)
  const grantTypesSupported = stringList(document.grant_types_supported)
  const authMethods = stringList(document.token_endpoint_auth_methods_supported)
  const authSigningAlgs = stringList(document.token_endpoint_auth_signing_alg_values_supported)
  return {
    resource,
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...(typeof registrationEndpoint === 'string' ? { registrationEndpoint } : {}),
    ...(scopesSupported ? { scopesSupported } : {}),
    ...(grantTypesSupported ? { grantTypesSupported } : {}),
    ...(authMethods ? { tokenEndpointAuthMethodsSupported: authMethods } : {}),
    ...(authSigningAlgs ? { tokenEndpointAuthSigningAlgValuesSupported: authSigningAlgs } : {}),
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

// --- Client credentials (machine to machine) ----------------------------------

/**
 * The JWS algorithms a client assertion may be signed with. Servers advertise
 * what they accept in `token_endpoint_auth_signing_alg_values_supported`; RSA
 * keys sign PS256 or RS256, EC keys sign the ES family.
 */
export const CLIENT_ASSERTION_ALGORITHMS = ['PS256', 'RS256', 'ES256', 'ES384', 'ES512'] as const

export type ClientAssertionAlgorithm = (typeof CLIENT_ASSERTION_ALGORITHMS)[number]

export function isClientAssertionAlgorithm(value: string): value is ClientAssertionAlgorithm {
  return (CLIENT_ASSERTION_ALGORITHMS as readonly string[]).includes(value)
}

/**
 * A confidential client that proves itself with a signed assertion instead of
 * a shared secret (RFC 7523 `private_key_jwt`). The private key never leaves
 * this process; the authorization server holds only the matching certificate.
 */
export type PrivateKeyJwtClient = {
  clientId: string
  /** PEM-encoded private key (PKCS#8 or PKCS#1). */
  privateKey: string
  algorithm: ClientAssertionAlgorithm
  /**
   * The assertion's `kid` header, when the server identifies the certificate
   * by one — NetSuite's Certificate ID, issued when the public certificate is
   * mapped to an entity and role.
   */
  keyId?: string
}

const b64url = (value: string | Buffer): string =>
  (typeof value === 'string' ? Buffer.from(value, 'utf8') : value).toString('base64url')

/** How long a client assertion is valid. Short: it is used once, immediately. */
const ASSERTION_LIFETIME_S = 60

function signAssertion(signingInput: string, client: PrivateKeyJwtClient): Buffer {
  const { algorithm, privateKey } = client
  // Node names the digest, not the JWS algorithm, and needs to be told the
  // padding and the signature encoding separately — the defaults are PKCS#1
  // and DER, neither of which is what JWS specifies for PS* or ES*.
  if (algorithm === 'PS256') {
    return createSign('sha256').update(signingInput).sign({
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    })
  }
  if (algorithm === 'RS256') {
    return createSign('sha256').update(signingInput).sign({ key: privateKey })
  }
  const digest = algorithm === 'ES256' ? 'sha256' : algorithm === 'ES384' ? 'sha384' : 'sha512'
  // 'ieee-p1363' is the raw r||s pair JWS wants; Node's default DER encoding
  // is silently accepted by the signer and rejected by every verifier.
  return createSign(digest).update(signingInput).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
}

/**
 * Build the RFC 7523 client assertion proving control of the client's key.
 * Exported so a caller can verify a key parses and signs before storing it,
 * without spending a token request to find out.
 */
export function createClientAssertion(input: {
  client: PrivateKeyJwtClient
  /** The assertion's audience — the token endpoint it will be presented to. */
  audience: string
}): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(
    JSON.stringify({
      alg: input.client.algorithm,
      typ: 'JWT',
      ...(input.client.keyId ? { kid: input.client.keyId } : {}),
    }),
  )
  const claims = b64url(
    JSON.stringify({
      iss: input.client.clientId,
      sub: input.client.clientId,
      aud: input.audience,
      iat: now,
      exp: now + ASSERTION_LIFETIME_S,
      jti: randomBytes(16).toString('hex'),
    }),
  )
  const signingInput = `${header}.${claims}`
  return `${signingInput}.${b64url(signAssertion(signingInput, input.client))}`
}

/**
 * Mint an access token with the client-credentials grant, authenticating with
 * a `private_key_jwt` assertion.
 *
 * This flow issues no refresh token, and that is the point of reaching for it:
 * there is no rotating credential to persist, race, or let lapse. The standing
 * secret is the key pair, whose certificate the operator rotates on their own
 * schedule. Every call mints from scratch, so a failure is transient rather
 * than terminal — unlike a refresh token, which is destroyed by its own use.
 */
export async function mintClientCredentialsToken(input: {
  authorization: Pick<OAuthAuthorization, 'tokenEndpoint' | 'resource'>
  client: PrivateKeyJwtClient
  scope?: string
}): Promise<OAuthTokens> {
  const assertion = createClientAssertion({
    client: input.client,
    audience: input.authorization.tokenEndpoint,
  })
  const payload = await postForm(
    input.authorization.tokenEndpoint,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      ...(input.authorization.resource ? { resource: input.authorization.resource } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    }),
  )
  return readTokens(payload, new URL(input.authorization.tokenEndpoint).hostname)
}

export { assertPublicHttpsEndpoint } from './egress'
