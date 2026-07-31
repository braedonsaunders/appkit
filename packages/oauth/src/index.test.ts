import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  authorizationServerMetadataUrls,
  buildAuthorizationUrl,
  createPkce,
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
