import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planTemplateConfig } from './template-plan'

const input = () => ({ memory: { shared: false, hugepages: false }, disks: [{ path: '/source.raw', readonly: false }], net: [{ tap: 'tap0', mac: '02:00:00:00:00:01' }], vsock: { cid: 4, socket: '/old.sock' } })
const child = { diskPath: '/child.raw', tap: 'tap1', mac: '02:00:00:00:00:02', vsockCid: 5, vsockSocket: '/child.sock' }

test('plans independent device endpoints without altering the template', () => {
  const source = input()
  const result = planTemplateConfig(source, child)
  assert.equal(source.disks[0]?.path, '/source.raw')
  assert.equal((result.disks as { path: string }[])[0]?.path, child.diskPath)
  assert.equal((result.net as { tap: string }[])[0]?.tap, child.tap)
  assert.equal((result.vsock as { cid: number }).cid, child.vsockCid)
})

test('fails closed on shared memory, unsupported devices and reused identities', () => {
  assert.throws(() => planTemplateConfig({ ...input(), memory: { shared: true } }, child), /memory/)
  assert.throws(() => planTemplateConfig({ ...input(), fs: [{}] }, child), /device/)
  assert.throws(() => planTemplateConfig(input(), { ...child, diskPath: '/source.raw' }), /differ/)
  assert.throws(() => planTemplateConfig(input(), { ...child, mac: '01:00:00:00:00:02' }), /identity/)
})
