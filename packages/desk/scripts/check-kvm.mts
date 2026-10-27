/** Disposable integration check. See the package README for prerequisites. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
const exec = promisify(execFile)
try {
  await exec('ip', ['link', 'show', 'dev', tap])
  throw new Error(`Refusing to reuse existing TAP ${tap}`)
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Refusing')) throw error
}
const directory = await mkdtemp(join(tmpRoot, 'desk-check-'))
const network = createDeskNetwork({ gateway, dns: '1.1.1.1', egress: { mode: 'open' } })
const host = createDeskHost({ imageRoot, parkWithMemory: true, trimOnSuspend: false,
  ports: { onEvent: (event) => console.log(event.kind), audit: () => {} },
  ...(process.env.DESK_CHECK_KERNEL_CMDLINE ? { kernelCmdline: process.env.DESK_CHECK_KERNEL_CMDLINE } : {}),
})
let created = false
try {
  created = true
  await network.ensure({ tap, guest })
  let desk = await host.start({ deskId: 'integration-check', baseImage, overlayPath: join(directory, 'disk.img'), network: { tapDevice: tap, guestAddress: guest } })
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
  await host.suspend('integration-check')
  if (host.stats().lastError) throw new Error(`Park failed: ${host.stats().lastError}`)
  desk = await host.resume('integration-check')
  if (host.stats().snapshotCpuFallbacks || host.stats().lastError) throw new Error('Snapshot was not restored')
  await syncDeskGuestClock(desk)
  await check()
  console.log('KVM, TAP, guest TCP, memory park and restore passed')
} finally {
  try { await host.destroy('integration-check') } finally {
    try { if (created) await network.teardown({ tap, guest }) } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
