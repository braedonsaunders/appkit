import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EgressHostPolicyError,
  isPublicHostname,
  isPublicIpAddress,
  normalizeOutboundHostname,
  resolvePublicUpstream,
  splitHostPort,
} from './index'

test('normalization lower-cases and strips the trailing dot', () => {
  assert.equal(normalizeOutboundHostname(' API.Example.COM. '), 'api.example.com')
})

test('normalization applies idna to internationalized names', () => {
  assert.equal(normalizeOutboundHostname('münchen.example'), 'xn--mnchen-3ya.example')
})

test('normalization strips brackets from ipv6 literals', () => {
  assert.equal(normalizeOutboundHostname('[2001:4860:4860::8888]'), '2001:4860:4860::8888')
})

test('normalization rejects hosts with forbidden characters', () => {
  for (const raw of ['', 'a b.example.com', 'host/path', 'user@host', 'a'.repeat(260)]) {
    assert.throws(() => normalizeOutboundHostname(raw), EgressHostPolicyError)
  }
})

test('public ip classification blocks private, loopback, and special ranges', () => {
  assert.equal(isPublicIpAddress('8.8.8.8'), true)
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true)
  assert.equal(isPublicIpAddress('10.1.2.3'), false)
  assert.equal(isPublicIpAddress('127.0.0.1'), false)
  assert.equal(isPublicIpAddress('169.254.1.1'), false)
  assert.equal(isPublicIpAddress('192.168.0.10'), false)
  assert.equal(isPublicIpAddress('::1'), false)
  assert.equal(isPublicIpAddress('fe80::1'), false)
  assert.equal(isPublicIpAddress('::ffff:127.0.0.1'), false)
  assert.equal(isPublicIpAddress('not-an-ip'), false)
})

test('ipv4 addresses stay public despite the mapped-ipv6 block', () => {
  // A combined block list would treat every IPv4 input as v4-mapped IPv6 and
  // reject it; the split lists must keep genuinely public IPv4 working.
  assert.equal(isPublicIpAddress('1.1.1.1'), true)
})

test('reserved hostnames are not public', () => {
  assert.equal(isPublicHostname('example.com'), true)
  assert.equal(isPublicHostname('localhost'), false)
  assert.equal(isPublicHostname('registry.internal'), false)
  assert.equal(isPublicHostname('printer.local'), false)
  assert.equal(isPublicHostname('hidden.onion'), false)
  assert.equal(isPublicHostname('sandbox.test'), false)
})

test('the default upstream resolver passes a public ip literal through', async () => {
  assert.deepEqual(await resolvePublicUpstream('8.8.8.8', 443), {
    host: '8.8.8.8',
    port: 443,
  })
})

test('the default upstream resolver refuses non-public ip literals', async () => {
  await assert.rejects(resolvePublicUpstream('127.0.0.1', 80), EgressHostPolicyError)
  await assert.rejects(resolvePublicUpstream('10.0.0.5', 80), EgressHostPolicyError)
})

test('the default upstream resolver refuses reserved names before any dns lookup', async () => {
  await assert.rejects(resolvePublicUpstream('localhost', 80), EgressHostPolicyError)
  await assert.rejects(resolvePublicUpstream('vault.internal', 80), EgressHostPolicyError)
})

test('authorities split into host and optional port', () => {
  assert.deepEqual(splitHostPort('example.com'), { host: 'example.com', port: null })
  assert.deepEqual(splitHostPort('example.com:8443'), { host: 'example.com', port: 8443 })
  assert.deepEqual(splitHostPort('[::1]:443'), { host: '[::1]', port: 443 })
  assert.deepEqual(splitHostPort('[2001:db8::1]'), { host: '[2001:db8::1]', port: null })
})

test('unparseable authorities are rejected rather than guessed', () => {
  assert.equal(splitHostPort(''), null)
  assert.equal(splitHostPort('example.com:'), null)
  assert.equal(splitHostPort('example.com:0'), null)
  assert.equal(splitHostPort('example.com:99999'), null)
  assert.equal(splitHostPort('example.com:80:90'), null)
  assert.equal(splitHostPort('2001:db8::1'), null)
  assert.equal(splitHostPort('[::1'), null)
  assert.equal(splitHostPort(':443'), null)
})
