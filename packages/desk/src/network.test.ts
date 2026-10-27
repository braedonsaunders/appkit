import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeskNetwork, deskNetworkIdentity, syncDeskGuestClock } from './network'
import type { DeskHandle } from './host'

test('routed TAP installs ordered fail-closed egress and removes it', async () => {
  assert.deepEqual(deskNetworkIdentity(2), { tap: 'dsk2', macAddress: '06:00:00:00:00:02' })
  const calls: string[][] = []
  const network = createDeskNetwork({ gateway: '172.30.0.1', dns: '1.1.1.1', httpProxyPort: 3129, httpsProxyPort: 3130,
    enableForwarding: async () => {}, runner: { async run(command, args) {
      calls.push([command, ...args])
      if (args.includes('-C') || (command === 'ip' && args[0] === 'link' && args[1] === 'show')) throw new Error('absent')
      return ''
    } },
  })
  const link = { tap: 'dsk2', guest: '172.30.0.2' }
  await network.ensure(link)
  assert.ok(calls.some((c) => c.join(' ') === 'ip route replace 172.30.0.2/32 dev dsk2'))
  const forward = calls.filter((c) => c.includes('-A') && c.includes('bh-fwd-dsk2'))
  assert.equal(forward.at(-1)?.at(-1), 'DROP')
  assert.ok(forward.some((c) => c.includes('udp') && c.includes('1.1.1.1')))
  await network.teardown(link)
  assert.ok(calls.some((c) => c.join(' ') === 'ip link del dev dsk2'))
  assert.throws(() => network.ensure({ ...link, guest: '1.2.3.4;id' }), /IPv4/)
})

test('guest network and clock commands report failure', async () => {
  const commands: string[] = []
  const desk = { exec: async (value: { args: readonly string[] }) => { commands.push(value.args[1] ?? ''); return { exitCode: 0, stderr: '' } } } as unknown as Pick<DeskHandle, 'exec'>
  const network = createDeskNetwork({ gateway: '172.30.0.1', dns: '1.1.1.1', httpProxyPort: 3129, httpsProxyPort: 3130 })
  await network.configureGuest(desk, { tap: 'dsk2', guest: '172.30.0.2' })
  await syncDeskGuestClock(desk, 1234567)
  assert.match(commands[0] ?? '', /ip route replace default via 172\.30\.0\.1/)
  assert.match(commands[1] ?? '', /@1234\.567/)
})

test('guest exec errors propagate', async () => {
  const desk = { exec: async () => ({ exitCode: 1, stderr: 'permission denied' }) } as unknown as Pick<DeskHandle, 'exec'>
  await assert.rejects(syncDeskGuestClock(desk), /permission denied/)
})
