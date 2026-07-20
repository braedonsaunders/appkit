import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentDisabledError, normalizeAgentMaxSteps, runAgentTurn } from './agent'

test('agent step limits are bounded for tenant-controlled configuration', () => {
  assert.equal(normalizeAgentMaxSteps(), 12)
  assert.equal(normalizeAgentMaxSteps(1), 2)
  assert.equal(normalizeAgentMaxSteps(100), 32)
  assert.equal(normalizeAgentMaxSteps(7.8), 7)
  assert.equal(normalizeAgentMaxSteps(Number.NaN), 12)
})

test('an unconfigured agent fails before starting a provider request', () => {
  assert.throws(
    () => runAgentTurn({ model: null, messages: [], system: 'test', tools: {} }),
    AgentDisabledError,
  )
})
