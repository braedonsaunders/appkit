import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { forkDeskTemplate, registerDeskTemplate } from './template-registry'

test('registration binds image identities and forks independent disk with shared memory inode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-register-'))
  try {
    const snapshot = join(root, 'source'), disk = join(root, 'base.raw'), vmm = join(root, 'vmm'), golden = join(root, 'golden.raw'), kernel = join(root, 'kernel'), initramfs = join(root, 'initrd')
    await mkdir(snapshot)
    for (const file of [disk, vmm, golden, kernel, initramfs]) await writeFile(file, file)
    const config = { memory: { shared: false }, payload: { kernel, initramfs }, disks: [{ path: disk, readonly: false }], net: [{ tap: 'tap0', mac: '02:00:00:00:00:01' }], vsock: { cid: 4, socket: '/old.sock' } }
    await writeFile(join(snapshot, 'config.json'), JSON.stringify(config))
    await writeFile(join(snapshot, 'state.json'), '{}')
    await writeFile(join(snapshot, 'memory-ranges'), 'memory')
    for (const file of [disk, join(snapshot, 'config.json'), join(snapshot, 'state.json'), join(snapshot, 'memory-ranges')]) await chmod(file, 0o400)
    const compatibility = { vmmVersion: 'v54.0', vmmPath: vmm, cpuSignature: 'cpu', baseImagePath: golden, kernelPath: kernel, initramfsPath: initramfs, attachmentPaths: [] }
    await registerDeskTemplate(snapshot, disk, compatibility)
    const identity = { deskId: 'child', tap: 'tap1', mac: '02:00:00:00:00:02', vsockCid: 5, vsockSocket: '/new.sock' }
    const first = await forkDeskTemplate(snapshot, join(root, 'child1'), identity, compatibility)
    const second = await forkDeskTemplate(snapshot, join(root, 'child2'), { ...identity, tap: 'tap2', vsockCid: 6, vsockSocket: '/other.sock', mac: '02:00:00:00:00:03' }, compatibility)
    assert.equal((await stat(join(first.snapshotPath, 'memory-ranges'))).ino, (await stat(join(second.snapshotPath, 'memory-ranges'))).ino)
    assert.equal((await stat(join(root, 'child1', '.template-memory'))).ino, (await stat(join(snapshot, 'memory-ranges'))).ino)
    assert.notEqual((await stat(first.diskPath)).ino, (await stat(second.diskPath)).ino)
    await writeFile(first.diskPath, 'child data')
    assert.equal(await readFile(second.diskPath, 'utf8'), disk)
    await assert.rejects(forkDeskTemplate(snapshot, join(root, 'badcpu'), identity, { ...compatibility, cpuSignature: 'other' }), /compatibility/)
    await writeFile(vmm, 'changed')
    await assert.rejects(forkDeskTemplate(snapshot, join(root, 'badvmm'), identity, compatibility), /changed since registration/)
    await writeFile(vmm, vmm)
    await writeFile(golden, 'changed')
    await assert.rejects(forkDeskTemplate(snapshot, join(root, 'badimage'), identity, compatibility), /changed since registration/)
    await writeFile(golden, golden)
    await writeFile(kernel, 'changed')
    await assert.rejects(forkDeskTemplate(snapshot, join(root, 'badkernel'), identity, compatibility), /changed since registration/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
