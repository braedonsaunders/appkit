/** Disposable macOS integration check. See the desk README for prerequisites. */
import { createConnection, createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDeskHost, createVirtualizationBackend } from '../src/index'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
const imageRoot = required('DESK_CHECK_IMAGE_ROOT')
const baseImage = required('DESK_CHECK_BASE_IMAGE')
const helperPath = required('DESK_CHECK_VZ_HELPER')
const address = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
  .find((entry) => entry.family === 'IPv4' && !entry.internal && (/^10\./.test(entry.address) || /^192\.168\./.test(entry.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)))?.address
if (!address) throw new Error('A private host IPv4 address is required to verify the LAN fence.')
const directory = await mkdtemp('/tmp/desk-vz-check-')
let received = false
const consolePath = join(directory, 'console.log')
await writeFile(consolePath, '')
const server = createServer((socket) => { received = true; socket.destroy() })
const host = createDeskHost({ imageRoot, backend: createVirtualizationBackend({ helperPath, connectTimeoutMs: 120_000, consoleLogPath: consolePath }),
  runtimeDir: directory, parkWithMemory: true, trimOnSuspend: false,
  ports: { onEvent: () => {}, audit: () => {} },
  ...(process.env.DESK_CHECK_KERNEL_CMDLINE ? { kernelCmdline: process.env.DESK_CHECK_KERNEL_CMDLINE } : {}),
})
try {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve) })
  const port = (server.address() as { port: number }).port
  const controlAccepted = new Promise<void>((resolve) => server.once('connection', () => resolve()))
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: address, port }, () => { socket.destroy(); resolve() })
    socket.once('error', reject)
  })
  await controlAccepted
  received = false
  let desk = await host.start({ deskId: 'vz-check', baseImage, overlayPath: join(directory, 'disk.raw'), memoryMb: 768 })
  console.log('Guest agent connected.')
  const ping = await desk.exec({ command: '/bin/echo', args: ['appkit-vz-ready'] })
  if (ping.exitCode !== 0 || ping.stdout.trim() !== 'appkit-vz-ready') throw new Error('Guest execution failed.')
  console.log('Guest execution passed.')
  const network = await desk.exec({ command: '/bin/sh', args: ['-c',
    'for p in /sys/class/net/*; do n=${p##*/}; [ "$n" = lo ] || break; done; ip link set "$n" up && ip addr replace 10.0.2.15/24 dev "$n" && ip route replace default via 10.0.2.2'] })
  if (network.exitCode !== 0) throw new Error(`Guest network configuration failed: ${network.stderr}`)
  const blocked = await desk.exec({ command: '/usr/bin/python3', args: ['-c',
    'import socket,sys\ns=socket.socket()\ns.settimeout(3)\ntry:\n s.connect((sys.argv[1],int(sys.argv[2])))\nexcept OSError:\n sys.exit(0)\nsys.exit(1)', address, String(port)] })
  if (blocked.exitCode !== 0 || received) throw new Error(`Fence probe failed (exit ${blocked.exitCode}, host accepted ${received}): ${blocked.stderr}`)
  console.log('Private-host fence passed.')
  await desk.exec({ command: '/usr/bin/python3', args: ['-m', 'http.server', '14500', '--bind', '0.0.0.0'], keepAlive: true })
  const check = async () => {
    const stream = await desk.connect(14500)
    try {
      stream.write('GET / HTTP/1.0\r\n\r\n')
      let response = ''
      for await (const chunk of stream) response += String(chunk)
      if (!response.startsWith('HTTP/1.0 200')) throw new Error('Unexpected guest HTTP response.')
    } finally { stream.destroy() }
  }
  let connected = false
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await check(); connected = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
  }
  if (!connected) throw new Error('Guest service did not become reachable.')
  console.log('Guest TCP relay passed.')
  await host.suspend('vz-check')
  if (host.stats().lastError) throw new Error(`Park failed: ${host.stats().lastError}`)
  desk = await host.resume('vz-check')
  if (host.stats().snapshotCpuFallbacks || host.stats().lastError) throw new Error('Snapshot was not restored.')
  await check()
  console.log('VZ guest execution, private-host fence, TCP relay, memory park and restore passed.')

} catch (error) {
  console.error('Guest console tail:', (await readFile(consolePath, 'utf8')).slice(-4000))
  throw error
} finally {
  try { await host.destroy('vz-check') } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}
