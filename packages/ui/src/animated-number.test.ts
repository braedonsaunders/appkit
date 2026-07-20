import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNumber } from './animated-number'

test('animated number formatting keeps sibling grouping and decimal behavior', () => {
  assert.equal(formatNumber(1234.4), '1,234')
  assert.equal(formatNumber(1234.567, undefined, 2), '1,234.57')
  assert.equal(formatNumber(-9876.5, (value) => `$${value.toFixed(1)}`), '$-9876.5')
})
