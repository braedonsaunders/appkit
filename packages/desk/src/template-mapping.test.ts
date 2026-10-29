import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasPrivateMemoryMapping } from './template-mapping'

test('accepts only a private writable mapping of the expected device and inode', () => {
  const line = '7f000000-7f002000 rw-p 00000000 08:01 123 /path/memory-ranges\n'
  assert.equal(hasPrivateMemoryMapping(line, 0x801n, 123n), true)
  assert.equal(hasPrivateMemoryMapping(line.replace('rw-p', 'rw-s'), 0x801n, 123n), false)
  assert.equal(hasPrivateMemoryMapping(line, 0x802n, 123n), false)
  assert.equal(hasPrivateMemoryMapping(line, 0x801n, 124n), false)
  assert.equal(hasPrivateMemoryMapping('anonymous rw-p nonsense', 0x801n, 123n), false)
})
