import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installRlsSql, rlsPolicySql } from './rls'

test('default policy forces RLS with a single-equality tenant filter', () => {
  const s = rlsPolicySql('incidents')
  assert.match(s, /ALTER TABLE incidents ENABLE ROW LEVEL SECURITY/)
  assert.match(s, /ALTER TABLE incidents FORCE ROW LEVEL SECURITY/)
  assert.match(s, /tenant_id = nullif\(current_setting\('app\.tenant_id', true\), ''\)::uuid/)
})

test('policy has NO bypass branch (would force Seq Scans)', () => {
  assert.doesNotMatch(rlsPolicySql('incidents'), /bypass/i)
  assert.doesNotMatch(rlsPolicySql('incidents'), /\bOR\b/)
})

test('policy is idempotent (drops before create)', () => {
  assert.match(rlsPolicySql('incidents'), /DROP POLICY IF EXISTS tenant_isolation ON incidents/)
})

test('globallyReadable allows NULL-tenant reads but guards writes', () => {
  const s = rlsPolicySql('templates', { globallyReadable: true })
  assert.match(s, /tenant_id IS NULL OR tenant_id =/)
  assert.match(s, /FOR INSERT\s+WITH CHECK \(tenant_id =/)
  assert.match(s, /FOR DELETE\s+USING \(tenant_id =/)
})

test('installRlsSql emits policy for every table', () => {
  const s = installRlsSql(['a', 'b', { table: 'c', globallyReadable: true }])
  assert.match(s, /ALTER TABLE a/)
  assert.match(s, /ALTER TABLE b/)
  assert.match(s, /tenant_id IS NULL OR tenant_id =/) // c is globallyReadable
})
