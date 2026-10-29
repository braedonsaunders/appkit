/** Disposable integration check. See the package README for prerequisites. */
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createDeskHost, createDeskNetwork, syncDeskGuestClock } from '../src/index'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
const tap = required('DESK_CHECK_TAP')
const guest = required('DESK_CHECK_GUEST')
const gateway = required('DESK_CHECK_GATEWAY')
const imageRoot = required('DESK_CHECK_IMAGE_ROOT')
const baseImage = required('DESK_CHECK_BASE_IMAGE')
const tmpRoot = required('DESK_CHECK_TMPDIR')
/** Set to also check a read-only virtio-fs share, including a file held open across the restore. */
const virtiofsdPath = process.env.DESK_CHECK_VIRTIOFSD
const exec = promisify(execFile)
const incremental = process.env.DESK_CHECK_INCREMENTAL === '1'
if (incremental && (process.env.DESK_CHECK_COW !== '1' || virtiofsdPath)) {
  throw new Error('Incremental check requires DESK_CHECK_COW=1 and no virtio-fs share')
}
const vmmPath = process.env.DESK_CHECK_VMM
if (incremental) {
  if (!vmmPath) throw new Error('Incremental check requires DESK_CHECK_VMM')
  const version = await exec(vmmPath, ['--version'])
  if (!version.stdout.includes('appkit-incremental.1')) throw new Error('Expected the pinned incremental VMM build')
}
try {
  await exec('ip', ['link', 'show', 'dev', tap])
  throw new Error(`Refusing to reuse existing TAP ${tap}`)
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Refusing')) throw error
}
const directory = await mkdtemp(join(tmpRoot, 'desk-check-'))
const deskId = `check-${randomUUID()}`
const runtimeDir = await mkdtemp(join(tmpdir(), 'dkr-'))
const hashFile = async (path: string): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const shareDirectory = join(directory, 'share')
if (virtiofsdPath) {
  await mkdir(shareDirectory)
  await writeFile(join(shareDirectory, 'hello.txt'), 'shared from the host\n')
}
const network = createDeskNetwork({ gateway, dns: '1.1.1.1', egress: { mode: 'open' } })
const host = createDeskHost({ imageRoot, runtimeDir, ...(vmmPath ? { vmmPath } : {}), parkWithMemory: true, trimOnSuspend: false,
  ...(process.env.DESK_CHECK_COW === '1' ? { memoryRestoreMode: 'copyonwrite' as const } : {}),
  ports: { onEvent: (event) => console.log(event.kind), audit: () => {} },
  ...(process.env.DESK_CHECK_KERNEL_CMDLINE ? { kernelCmdline: process.env.DESK_CHECK_KERNEL_CMDLINE } : {}),
  ...(virtiofsdPath ? { virtiofsdPath } : {}),
})
let created = false
let desk: Awaited<ReturnType<typeof host.start>>
const shell = async (script: string) => desk.exec({ command: '/bin/sh', args: ['-c', script] })
try {
  created = true
  await network.ensure({ tap, guest })
  desk = await host.start({
    deskId, memoryMb: 1024, strictMemoryRestore: incremental,
    ...(process.env.DESK_CHECK_CID ? { vsockCid: Number(process.env.DESK_CHECK_CID) } : {}),
    freePageReporting: process.env.DESK_CHECK_BALLOON === '1', baseImage, overlayPath: join(directory, 'disk.img'), network: { tapDevice: tap, guestAddress: guest },
    ...(virtiofsdPath ? { shares: [{ tag: 'check', path: shareDirectory, readOnly: true }] } : {}),
  })
  if (process.env.DESK_CHECK_BALLOON === '1') {
    const balloon = await shell('test -n "$(ls -d /sys/bus/virtio/drivers/virtio_balloon/virtio* 2>/dev/null)"')
    if (balloon.exitCode !== 0) throw new Error('Guest did not bind a virtio-balloon driver')
  }
  await network.configureGuest(desk, { tap, guest })
  await syncDeskGuestClock(desk)
  await desk.exec({ command: '/usr/bin/python3', args: ['-m', 'http.server', '14500', '--bind', guest], keepAlive: true })
  const check = async () => {
    const stream = await desk.connect(14500)
    try {
      stream.write('GET / HTTP/1.0\r\n\r\n')
      let response = ''
      for await (const chunk of stream) response += String(chunk)
      if (!response.startsWith('HTTP/1.0 200')) throw new Error(`Unexpected HTTP response: ${response.slice(0, 100)}`)
    } finally { stream.destroy() }
  }
  // The guest job may need a moment to bind before the first connection.
  let connected = false
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await check(); connected = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
  }
  if (!connected) throw new Error('Guest service did not become reachable')
  if (!host.canPause(deskId)) throw new Error('Cloud Hypervisor does not offer resident pause')
  await host.pause(deskId)
  let fenced = false
  try { await shell('true') } catch { fenced = true }
  if (!fenced) throw new Error('Guest requests were not fenced while paused')
  desk = await host.resume(deskId)
  await check()
  if (virtiofsdPath) {
    const mounted = await shell('mkdir -p /mnt/check && mount -t virtiofs check /mnt/check && cat /mnt/check/hello.txt')
    if (mounted.stdout !== 'shared from the host\n') throw new Error(`Share did not mount: ${mounted.stderr}`)
    const written = await shell('echo guest > /mnt/check/written')
    if (written.exitCode === 0) throw new Error('A read-only share accepted a write')
    const remounted = await shell('mount -o remount,rw /mnt/check && echo guest > /mnt/check/written')
    if (remounted.exitCode === 0) throw new Error('A read-only share accepted a write after a read-write remount')
    // Holds the file open across the park, then reads it through the same descriptor.
    await desk.exec({ command: '/usr/bin/python3', keepAlive: true, args: ['-c', [
      'import os, time',
      "held = open('/mnt/check/hello.txt')",
      "open('/tmp/share-held', 'w').close()",
      "while not os.path.exists('/tmp/share-go'): time.sleep(0.1)",
      'held.seek(0)',
      "open('/tmp/share-read', 'w').write(held.read())",
    ].join('\n')] })
    const opened = await shell('for i in $(seq 50); do [ -e /tmp/share-held ] && exit 0; sleep 0.1; done; exit 1')
    if (opened.exitCode !== 0) throw new Error('The share reader did not open its file')
  }
  await host.suspend(deskId)
  if (host.stats().lastError) throw new Error(`Park failed: ${host.stats().lastError}`)
  const originalMemory = join(directory, 'original-memory')
  const snapshotMemory = join(directory, `${deskId}.snapshot`, 'memory-ranges')
  let originalHash: string | undefined
  if (incremental) {
    await link(snapshotMemory, originalMemory)
    originalHash = await hashFile(originalMemory)
  }
  desk = await host.resume(deskId)
  if (host.stats().snapshotCpuFallbacks || host.stats().lastError) throw new Error('Snapshot was not restored')
  await syncDeskGuestClock(desk)
  await check()
  if (incremental) {
    // Change private guest pages while keeping the original file pinned for proof.
    const dirtied = await shell("python3 -c 'import time; b=bytearray(16*1024*1024); b[:]=b\"x\"*len(b); print(len(b))'")
    if (dirtied.exitCode !== 0) throw new Error(`Could not dirty guest pages: ${dirtied.stderr}`)
    await host.suspend(deskId)
    if (host.stats().lastError) throw new Error(`Second park failed: ${host.stats().lastError}`)
    if (await hashFile(originalMemory) !== originalHash) throw new Error('Restore modified its immutable source')
    const extents = await exec('filefrag', ['-v', originalMemory, snapshotMemory])
    if (!/\bshared\b/.test(extents.stdout)) throw new Error('No shared extents: incremental reflink path was not exercised')
    desk = await host.resume(deskId)
    await check()
    console.log('Repeated CoW restore, immutable source and shared snapshot extents passed')
  }
  if (virtiofsdPath) {
    const reread = await shell('touch /tmp/share-go; for i in $(seq 50); do [ -s /tmp/share-read ] && break; sleep 0.1; done; cat /tmp/share-read /mnt/check/hello.txt')
    if (reread.stdout !== 'shared from the host\n'.repeat(2)) {
      throw new Error(`The share did not survive the restore: ${reread.stdout}${reread.stderr}`)
    }
    console.log('Read-only virtio-fs share, and a file held open across the restore, passed')
  }
  console.log('KVM, TAP, guest TCP, memory park and restore passed')
} finally {
  // Never delete a disk or its source memory until the VMM has exited.
  await host.destroy(deskId)
  try {
    try { if (created) await network.teardown({ tap, guest }) } finally {
      await rm(directory, { recursive: true, force: true })
    }
  } finally {
    await rm(runtimeDir, { recursive: true, force: true })
  }
}
