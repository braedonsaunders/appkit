import assert from 'node:assert/strict'
import { constants, createHash, createVerify, generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import {
  authorizationServerMetadataUrls,
  buildAuthorizationUrl,
  createClientAssertion,
  createPkce,
  isClientAssertionAlgorithm,
  protectedResourceMetadataUrls,
} from './index'

test('protected-resource metadata candidates are path-aware, most specific first', () => {
  assert.deepEqual(protectedResourceMetadataUrls('https://mcp.example.com/v1/mcp'), [
    'https://mcp.example.com/.well-known/oauth-protected-resource/v1/mcp',
    'https://mcp.example.com/.well-known/oauth-protected-resource',
  ])
  assert.deepEqual(protectedResourceMetadataUrls('https://mcp.example.com/'), [
    'https://mcp.example.com/.well-known/oauth-protected-resource',
  ])
})

test('authorization-server metadata candidates cover RFC 8414 and OIDC placements', () => {
  assert.deepEqual(authorizationServerMetadataUrls('https://auth.example.com'), [
    'https://auth.example.com/.well-known/oauth-authorization-server',
    'https://auth.example.com/.well-known/openid-configuration',
  ])
  assert.deepEqual(authorizationServerMetadataUrls('https://auth.example.com/tenant'), [
    'https://auth.example.com/.well-known/oauth-authorization-server/tenant',
    'https://auth.example.com/.well-known/oauth-authorization-server',
    'https://auth.example.com/.well-known/openid-configuration/tenant',
    'https://auth.example.com/tenant/.well-known/openid-configuration',
  ])
})

test('createPkce produces a verifier whose S256 digest is the challenge', () => {
  const pkce = createPkce()
  assert.equal(pkce.method, 'S256')
  assert.ok(pkce.verifier.length >= 43, 'verifier meets the RFC 7636 minimum length')
  assert.equal(createHash('sha256').update(pkce.verifier).digest('base64url'), pkce.challenge)
  assert.notEqual(createPkce().verifier, pkce.verifier)
})

test('buildAuthorizationUrl carries the code challenge, state, and resource', () => {
  const url = new URL(
    buildAuthorizationUrl({
      authorization: {
        resource: 'https://mcp.example.com/mcp',
        issuer: 'https://auth.example.com',
        authorizationEndpoint: 'https://auth.example.com/authorize?audience=api',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      clientId: 'client-123',
      redirectUri: 'https://app.example.com/api/mcp-oauth/callback',
      codeChallenge: 'challenge-abc',
      state: 'state-xyz',
      scope: 'read write',
    }),
  )
  assert.equal(url.origin + url.pathname, 'https://auth.example.com/authorize')
  assert.equal(url.searchParams.get('audience'), 'api', 'endpoint query parameters survive')
  assert.equal(url.searchParams.get('client_id'), 'client-123')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example.com/api/mcp-oauth/callback')
  assert.equal(url.searchParams.get('state'), 'state-xyz')
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-abc')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('resource'), 'https://mcp.example.com/mcp')
  assert.equal(url.searchParams.get('scope'), 'read write')
})

test('a client assertion is a JWS the authorization server can verify', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const assertion = createClientAssertion({
    client: { clientId: 'client-123', privateKey, algorithm: 'PS256', keyId: 'cert-7' },
    audience: 'https://auth.example.com/token',
  })

  const [header, claims, signature] = assertion.split('.')
  assert.ok(header && claims && signature, 'assertion has three JWS parts')
  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  assert.deepEqual(decode(header), { alg: 'PS256', typ: 'JWT', kid: 'cert-7' })

  const payload = decode(claims)
  assert.equal(payload.iss, 'client-123', 'RFC 7523 issuer is the client')
  assert.equal(payload.sub, 'client-123', 'RFC 7523 subject is the client')
  assert.equal(payload.aud, 'https://auth.example.com/token', 'audience is the token endpoint')
  assert.ok(payload.exp > payload.iat, 'the assertion expires after it was issued')
  assert.ok(payload.exp - payload.iat <= 300, 'a single-use assertion is short-lived')

  // PS256 must be RSA-PSS: verifying with the default PKCS#1 padding fails,
  // which is exactly how a mis-padded assertion reads to the server.
  const verified = createVerify('sha256')
    .update(`${header}.${claims}`)
    .verify(
      { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
      Buffer.from(signature, 'base64url'),
    )
  assert.ok(verified, 'the signature verifies as RSA-PSS')
})

test('EC assertions are signed in the raw r||s encoding JWS requires', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const assertion = createClientAssertion({
    client: { clientId: 'client-123', privateKey, algorithm: 'ES256' },
    audience: 'https://auth.example.com/token',
  })
  const [header, claims, signature] = assertion.split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header!, 'base64url').toString('utf8')), { alg: 'ES256', typ: 'JWT' })
  const raw = Buffer.from(signature!, 'base64url')
  assert.equal(raw.length, 64, 'P-256 JOSE signatures are two 32-byte integers, not DER')
  assert.ok(
    createVerify('sha256')
      .update(`${header}.${claims}`)
      .verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, raw),
  )
})

test('assertions are single-use: each carries a distinct jti', () => {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const client = { clientId: 'c', privateKey, algorithm: 'ES256' as const }
  const jti = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')).jti
  assert.notEqual(
    jti(createClientAssertion({ client, audience: 'https://auth.example.com/token' })),
    jti(createClientAssertion({ client, audience: 'https://auth.example.com/token' })),
  )
})

test('only algorithms with a JWS signing rule are accepted', () => {
  assert.ok(isClientAssertionAlgorithm('PS256'))
  assert.ok(isClientAssertionAlgorithm('ES512'))
  assert.ok(!isClientAssertionAlgorithm('HS256'), 'a shared-secret MAC is not a private-key assertion')
  assert.ok(!isClientAssertionAlgorithm('none'))
})
