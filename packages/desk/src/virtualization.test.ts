import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeskLaunchPlan, isDeskSupported } from './plan'
import { createVirtualizationBackend } from './virtualization'

const base = {
  hypervisor: 'virtualization' as const,
  deskId: 'agent-a', kernelPath: '/images/kernel', baseImagePath: '/images/base.raw',
  overlayPath: '/images/agent.raw', vsockCid: 123, runtimeDir: '/tmp/desk',
}
const exists = { pathExists: () => true, deviceExists: () => false }

test('virtualization plan gives each desk a stable NIC and fenced network', () => {
  const first = buildDeskLaunchPlan(base, exists)
  const again = buildDeskLaunchPlan(base, exists)
  const other = buildDeskLaunchPlan({ ...base, deskId: 'agent-b' }, exists)
  assert.equal(first.vsock.cid, 3)
  assert.equal(first.network.allowLan, false)
  assert.equal(first.network.guestAddress, '10.0.2.15')
  assert.equal(first.network.mac, again.network.mac)
  assert.notEqual(first.network.mac, other.network.mac)
  assert.equal(first.snapshot.restoring, false)
  assert.equal(buildDeskLaunchPlan({ ...base, restore: true }, exists).snapshot.restoring, true)
})

test('virtualization refuses invalid network, paths, and Linux TAP settings', () => {
  assert.throws(() => buildDeskLaunchPlan({ ...base, tapDevice: 'tap0' }, exists), /TAP/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, guestNetwork: { guestAddress: '10.1.0.2' } }, exists), /subnet/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, guestNetwork: { dns: [] } }, exists), /one to three/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, runtimeDir: `/tmp/${'x'.repeat(100)}` }, exists), /longer/)
  assert.throws(() => createVirtualizationBackend({ helperPath: 'relative' }), /absolute/)
})

test('macOS support requires Apple silicon, macOS 14 and an absolute existing helper', () => {
  const options = { platform: 'darwin' as const, arch: 'arm64', osRelease: '23.0.0', helperPath: '/bin/helper', pathExists: () => true }
  assert.equal(isDeskSupported(options), true)
  assert.equal(isDeskSupported({ ...options, arch: 'x64' }), false)
  assert.equal(isDeskSupported({ ...options, osRelease: '22.0.0' }), false)
  assert.equal(isDeskSupported({ ...options, helperPath: 'relative' }), false)
  assert.equal(isDeskSupported({ ...options, pathExists: () => false }), false)
})

test('backend drives helper, guest channel and snapshot lifecycle', async () => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough, Writable, Duplex } = await import('node:stream')
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { encodeFrame, FrameDecoder } = await import('./protocol')
  const directory = await mkdtemp(join(tmpdir(), 'desk-vz-test-'))
  const calls: string[] = []
  try {
    const launcher: NonNullable<import('./virtualization').VirtualizationBackendOptions['launcher']> = () => {
      const child = new EventEmitter() as import('node:child_process').ChildProcess
      const stdout = new PassThrough()
      Object.defineProperty(child, 'stdout', { value: stdout })
      Object.defineProperty(child, 'stderr', { value: new PassThrough() })
      Object.defineProperty(child, 'stdin', { value: new Writable({
        write(chunk, _encoding, callback) {
          const message = JSON.parse(String(chunk)) as { id: string; op: string }
          calls.push(message.op)
          stdout.write(`${JSON.stringify({ id: message.id, ok: true, result: message.op === 'boot' ? { machineIdentifier: 'test-id', saveRestore: true } : {} })}\n`)
          callback()
          if (message.op === 'stop') setImmediate(() => child.emit('exit', 0, null))
        },
      }) })
      child.kill = (() => { setImmediate(() => child.emit('exit', 0, null)); return true }) as typeof child.kill
      return child
    }
    const connect = () => {
      let connected = false
      const decoder = new FrameDecoder()
      const stream = new Duplex({
        read() {},
        write(chunk: Buffer, _encoding, callback) {
          if (!connected) { connected = true; stream.push('OK 1\n') }
          else for (const frame of decoder.push(chunk)) {
            const request = frame as { id: string }
            stream.push(encodeFrame({ id: request.id, ok: true, result: 'pong' }))
          }
          callback()
        },
      })
      return stream
    }
    const backend = createVirtualizationBackend({ helperPath: '/helper', platform: 'darwin', launcher, connect })
    const plan = buildDeskLaunchPlan({ ...base, runtimeDir: directory, snapshotDir: directory }, exists)
    const machine = await backend.boot(plan)
    assert.equal(await machine.request({ op: 'ping' }), 'pong')
    await machine.park!(directory)
    assert.equal(await readFile(join(directory, 'machine-id'), 'utf8'), 'test-id')
    assert.deepEqual(calls, ['boot', 'save', 'stop'])
    calls.length = 0
    const restored = await backend.boot({ ...plan, snapshot: { dir: directory, restoring: true } }, {
      onRestored: async () => { calls.push('invalidate') },
    })
    assert.deepEqual(calls, ['boot', 'invalidate', 'resume'])
    await restored.shutdown()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('virtualization shares are validated, carried in the plan, and refuse virtiofsd settings', () => {
  const withDirectories = { ...exists, isDirectory: (path: string) => path.startsWith('/srv/') }
  const shares = [{ tag: 'depot', path: '/srv/depot', readOnly: false }]
  assert.deepEqual(buildDeskLaunchPlan({ ...base, shares }, withDirectories).shares, shares)
  assert.deepEqual(buildDeskLaunchPlan(base, withDirectories).shares, [])
  assert.throws(() => buildDeskLaunchPlan({ ...base, shares: [{ ...shares[0]!, path: '/missing' }] }, withDirectories), /not an existing directory/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, shares: [{ ...shares[0]!, tag: 'Depot' }] }, withDirectories), /tag must be/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, virtiofsdPath: '/usr/libexec/virtiofsd' }, withDirectories), /virtiofsdPath/)
  assert.throws(() => buildDeskLaunchPlan({ ...base, virtiofsdSandbox: 'chroot' }, withDirectories), /virtiofsdSandbox/)
})

test('backend sends shares to the helper, records them on park, and refuses a restore with others', async () => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough, Writable, Duplex } = await import('node:stream')
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const directory = await mkdtemp(join(tmpdir(), 'desk-vz-shares-'))
  const boots: Record<string, unknown>[] = []
  let spawned = 0
  try {
    const launcher: NonNullable<import('./virtualization').VirtualizationBackendOptions['launcher']> = () => {
      spawned += 1
      const child = new EventEmitter() as import('node:child_process').ChildProcess
      const stdout = new PassThrough()
      Object.defineProperty(child, 'stdout', { value: stdout })
      Object.defineProperty(child, 'stderr', { value: new PassThrough() })
      Object.defineProperty(child, 'stdin', { value: new Writable({
        write(chunk, _encoding, callback) {
          const message = JSON.parse(String(chunk)) as { id: string; op: string }
          if (message.op === 'boot') boots.push(message)
          stdout.write(`${JSON.stringify({ id: message.id, ok: true, result: message.op === 'boot' ? { machineIdentifier: 'test-id', saveRestore: true } : {} })}\n`)
          callback()
          if (message.op === 'stop') setImmediate(() => child.emit('exit', 0, null))
        },
      }) })
      child.kill = (() => { setImmediate(() => child.emit('exit', 0, null)); return true }) as typeof child.kill
      return child
    }
    const { encodeFrame, FrameDecoder } = await import('./protocol')
    const connect = () => {
      let connected = false
      const decoder = new FrameDecoder()
      const stream = new Duplex({
        read() {},
        write(chunk: Buffer, _encoding, callback) {
          if (!connected) { connected = true; stream.push('OK 1\n') }
          else for (const frame of decoder.push(chunk)) {
            stream.push(encodeFrame({ id: (frame as { id: string }).id, ok: true, result: 'pong' }))
          }
          callback()
        },
      })
      return stream
    }
    const backend = createVirtualizationBackend({ helperPath: '/helper', platform: 'darwin', launcher, connect })
    const shares = [
      { tag: 'store', path: '/srv/store', readOnly: true },
      { tag: 'depot', path: '/srv/depot', readOnly: false },
    ]
    const plan = buildDeskLaunchPlan(
      { ...base, runtimeDir: directory, snapshotDir: directory, shares },
      { ...exists, isDirectory: () => true },
    )
    const machine = await backend.boot(plan)
    assert.deepEqual(boots[0]?.shares, shares)
    await machine.park!(directory)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'shares.json'), 'utf8')), shares)

    const before = spawned
    await assert.rejects(
      backend.boot({ ...plan, shares: shares.slice(0, 1), snapshot: { dir: directory, restoring: true } }, { onRestored: async () => undefined }),
      /cannot be restored: the snapshot was taken with shares/,
    )
    assert.equal(spawned, before, 'refused before a helper was started')

    const restored = await backend.boot({ ...plan, snapshot: { dir: directory, restoring: true } }, { onRestored: async () => undefined })
    assert.deepEqual(boots.at(-1)?.shares, shares)
    await restored.shutdown()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
