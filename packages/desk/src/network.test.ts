import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeskNetwork, deskNetworkIdentity, syncDeskGuestClock, type DeskNetworkOptions } from './network'
import type { DeskHandle } from './host'

const gateway = '172.30.0.1'
const dns = '1.1.1.1'
const link = { tap: 'dsk2', guest: '172.30.0.2' }
function recorder(options: Pick<DeskNetworkOptions, 'egress' | 'chainPrefix' | 'allowHostPorts'>) {
  const calls: string[][] = []
  const network = createDeskNetwork({ gateway, dns, ...options, enableForwarding: async () => {},
    runner: { async run(command, args) {
      calls.push([command, ...args])
      if (args.includes('-C') || (command === 'ip' && args[0] === 'link' && args[1] === 'show')) throw new Error('absent')
      return ''
    } },
  })
  return { calls, network }
}
function iptables(calls: string[][]): string[] { return calls.filter((call) => call[0] === 'iptables').map((call) => call.slice(1).join(' ')) }

test('proxied egress retains the existing exact iptables commands and chain names', async () => {
  assert.deepEqual(deskNetworkIdentity(2), { tap: 'dsk2', macAddress: '06:00:00:00:00:02' })
  const { calls, network } = recorder({ chainPrefix: 'bh', egress: { mode: 'proxied', httpProxyPort: 3129, httpsProxyPort: 3130 } })
  await network.ensure(link)
  assert.deepEqual(iptables(calls), [
    '-t nat -N bh-pre-dsk2', '-t nat -F bh-pre-dsk2',
    '-t nat -A bh-pre-dsk2 -p tcp --dport 80 -j DNAT --to-destination 172.30.0.1:3129',
    '-t nat -A bh-pre-dsk2 -p tcp --dport 443 -j DNAT --to-destination 172.30.0.1:3130',
    '-t nat -A bh-pre-dsk2 -p udp --dport 53 -j DNAT --to-destination 1.1.1.1:53',
    '-t nat -A bh-pre-dsk2 -p tcp --dport 53 -j DNAT --to-destination 1.1.1.1:53',
    '-t nat -C PREROUTING -i dsk2 -j bh-pre-dsk2', '-t nat -I PREROUTING 1 -i dsk2 -j bh-pre-dsk2',
    '-t nat -N bh-post-dsk2', '-t nat -F bh-post-dsk2', '-t nat -A bh-post-dsk2 -j MASQUERADE',
    '-t nat -C POSTROUTING -s 172.30.0.2/32 -j bh-post-dsk2', '-t nat -I POSTROUTING 1 -s 172.30.0.2/32 -j bh-post-dsk2',
    '-t filter -N bh-in-dsk2', '-t filter -F bh-in-dsk2',
    '-t filter -A bh-in-dsk2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
    '-t filter -A bh-in-dsk2 -p tcp -d 172.30.0.1 --dport 3129 -j ACCEPT',
    '-t filter -A bh-in-dsk2 -p tcp -d 172.30.0.1 --dport 3130 -j ACCEPT',
    '-t filter -A bh-in-dsk2 -j DROP', '-t filter -C INPUT -i dsk2 -j bh-in-dsk2', '-t filter -I INPUT 1 -i dsk2 -j bh-in-dsk2',
    '-t filter -N bh-fwd-dsk2', '-t filter -F bh-fwd-dsk2',
    '-t filter -A bh-fwd-dsk2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
    '-t filter -A bh-fwd-dsk2 -i dsk2 -p udp -d 1.1.1.1 --dport 53 -j ACCEPT',
    '-t filter -A bh-fwd-dsk2 -i dsk2 -p tcp -d 1.1.1.1 --dport 53 -j ACCEPT',
    '-t filter -A bh-fwd-dsk2 -j DROP', '-t filter -C FORWARD -i dsk2 -j bh-fwd-dsk2',
    '-t filter -I FORWARD 1 -i dsk2 -j bh-fwd-dsk2', '-t filter -C FORWARD -o dsk2 -j bh-fwd-dsk2',
    '-t filter -I FORWARD 1 -o dsk2 -j bh-fwd-dsk2',
  ])
  assert.ok(calls.some((c) => c.join(' ') === 'ip route replace 172.30.0.2/32 dev dsk2'))
  await network.teardown(link)
  assert.ok(calls.some((c) => c.join(' ') === 'ip link del dev dsk2'))
  assert.throws(() => network.ensure({ ...link, guest: '1.2.3.4;id' }), /IPv4/)
})

test('open egress masquerades outbound traffic and drops new inbound and host traffic', async () => {
  const { calls, network } = recorder({ egress: { mode: 'open' }, allowHostPorts: [8080] })
  await network.ensure(link)
  assert.deepEqual(iptables(calls), [
    '-t nat -N desk-pre-dsk2', '-t nat -F desk-pre-dsk2', '-t nat -C PREROUTING -i dsk2 -j desk-pre-dsk2', '-t nat -I PREROUTING 1 -i dsk2 -j desk-pre-dsk2',
    '-t nat -N desk-post-dsk2', '-t nat -F desk-post-dsk2', '-t nat -A desk-post-dsk2 -j MASQUERADE',
    '-t nat -C POSTROUTING -s 172.30.0.2/32 -j desk-post-dsk2', '-t nat -I POSTROUTING 1 -s 172.30.0.2/32 -j desk-post-dsk2',
    '-t filter -N desk-in-dsk2', '-t filter -F desk-in-dsk2',
    '-t filter -A desk-in-dsk2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
    '-t filter -A desk-in-dsk2 -p tcp -d 172.30.0.1 --dport 8080 -j ACCEPT',
    '-t filter -A desk-in-dsk2 -p udp -d 172.30.0.1 --dport 8080 -j ACCEPT',
    '-t filter -A desk-in-dsk2 -j DROP', '-t filter -C INPUT -i dsk2 -j desk-in-dsk2', '-t filter -I INPUT 1 -i dsk2 -j desk-in-dsk2',
    '-t filter -N desk-fwd-dsk2', '-t filter -F desk-fwd-dsk2',
    '-t filter -A desk-fwd-dsk2 -o dsk2 -d 172.30.0.2/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
    '-t filter -A desk-fwd-dsk2 -i dsk2 -s 172.30.0.2/32 -j ACCEPT', '-t filter -A desk-fwd-dsk2 -j DROP',
    '-t filter -C FORWARD -i dsk2 -j desk-fwd-dsk2', '-t filter -I FORWARD 1 -i dsk2 -j desk-fwd-dsk2',
    '-t filter -C FORWARD -o dsk2 -j desk-fwd-dsk2', '-t filter -I FORWARD 1 -o dsk2 -j desk-fwd-dsk2',
  ])
  assert.deepEqual(calls.filter((call) => call[0] === 'ip6tables').map((call) => call.slice(1).join(' ')), [
    '-t filter -N desk-6in-dsk2', '-t filter -F desk-6in-dsk2', '-t filter -A desk-6in-dsk2 -j DROP',
    '-t filter -C INPUT -i dsk2 -j desk-6in-dsk2', '-t filter -I INPUT 1 -i dsk2 -j desk-6in-dsk2',
    '-t filter -N desk-6fwd-dsk2', '-t filter -F desk-6fwd-dsk2', '-t filter -A desk-6fwd-dsk2 -j DROP',
    '-t filter -C FORWARD -i dsk2 -j desk-6fwd-dsk2', '-t filter -I FORWARD 1 -i dsk2 -j desk-6fwd-dsk2',
    '-t filter -C FORWARD -o dsk2 -j desk-6fwd-dsk2', '-t filter -I FORWARD 1 -o dsk2 -j desk-6fwd-dsk2',
  ])
  await network.teardown(link)
  assert.ok(iptables(calls).includes('-t filter -X desk-fwd-dsk2'))
  assert.ok(calls.some((call) => call.join(' ') === 'ip6tables -t filter -X desk-6fwd-dsk2'))
})

test('validates chain names and host ports before changing the host', () => {
  assert.throws(() => recorder({ egress: { mode: 'open' }, chainPrefix: 'invalid prefix' }), /prefix/)
  assert.throws(() => recorder({ egress: { mode: 'open' }, allowHostPorts: [0] }), /port/)
  const { network } = recorder({ egress: { mode: 'open' }, chainPrefix: 'abcdefghijklmno' })
  assert.throws(() => network.ensure({ tap: 'dsk123456789', guest: link.guest }), /chain name/)
})

test('guest network and clock commands report failure', async () => {
  const commands: string[] = []
  const desk = { exec: async (value: { args: readonly string[] }) => { commands.push(value.args[1] ?? ''); return { exitCode: 0, stderr: '' } } } as unknown as Pick<DeskHandle, 'exec'>
  const network = createDeskNetwork({ gateway, dns, egress: { mode: 'open' } })
  await network.configureGuest(desk, link)
  await syncDeskGuestClock(desk, 1234567)
  assert.match(commands[0] ?? '', /ip route replace default via 172\.30\.0\.1/)
  assert.match(commands[1] ?? '', /@1234\.567/)
})

test('guest exec errors propagate', async () => {
  const desk = { exec: async () => ({ exitCode: 1, stderr: 'permission denied' }) } as unknown as Pick<DeskHandle, 'exec'>
  await assert.rejects(syncDeskGuestClock(desk), /permission denied/)
})
