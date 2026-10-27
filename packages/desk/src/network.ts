import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { promisify } from 'node:util'
import type { DeskHandle } from './host'

export interface DeskNetworkCommandRunner {
  run(command: string, args: readonly string[]): Promise<string>
}
export interface DeskNetworkOptions {
  gateway: string
  dns: string
  egress: { mode: 'proxied'; httpProxyPort: number; httpsProxyPort: number } | { mode: 'open' }
  chainPrefix?: string
  allowHostPorts?: readonly number[]
  prefixLength?: number
  runner?: DeskNetworkCommandRunner
  enableForwarding?: () => Promise<void>
}
export interface DeskNetworkAddress { tap: string; guest: string }
const execFileAsync = promisify(execFile)
const defaultRunner: DeskNetworkCommandRunner = {
  async run(command, args) {
    try { return (await execFileAsync(command, [...args], { timeout: 15_000 })).stdout }
    catch (error) {
      const failure = error as { stderr?: string; message?: string }
      throw new Error(`${command} ${args.join(' ')}: ${(failure.stderr || failure.message || String(error)).trim()}`)
    }
  },
}
async function forwarding(): Promise<void> {
  const path = '/proc/sys/net/ipv4/ip_forward'
  if ((await readFile(path, 'utf8').catch(() => '')).trim() !== '1') await writeFile(path, '1')
}
function port(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid TCP port')
}
function address(value: string): void {
  if (isIP(value) !== 4) throw new Error(`Invalid IPv4 address: ${value}`)
}

/** Deterministic TAP and locally administered MAC for an unsigned desk index. */
export function deskNetworkIdentity(index: number): { tap: string; macAddress: string } {
  if (!Number.isInteger(index) || index < 2 || index > 999999999) throw new Error('Invalid desk network index')
  const octets = [6, 0, (index >>> 24) & 255, (index >>> 16) & 255, (index >>> 8) & 255, index & 255]
  return { tap: `dsk${index}`, macAddress: octets.map((octet) => octet.toString(16).padStart(2, '0')).join(':') }
}

type Rule = readonly string[]
interface Chain { table: 'nat' | 'filter'; parent: string; chain: string; jumps: Rule[]; rules: Rule[]; command?: 'ip6tables' }
/** Point-to-point TAP with either open or transparent-proxy egress. */
export function createDeskNetwork(options: DeskNetworkOptions) {
  address(options.gateway); address(options.dns)
  const egress = options.egress
  if (egress.mode === 'proxied') { port(egress.httpProxyPort); port(egress.httpsProxyPort) }
  else if (egress.mode !== 'open') throw new Error('Invalid egress mode')
  const chainPrefix = options.chainPrefix ?? 'desk'
  if (!/^[A-Za-z0-9_-]+$/.test(chainPrefix)) throw new Error('Invalid iptables chain prefix')
  const hostPorts = [...(options.allowHostPorts ?? [])]
  hostPorts.forEach(port)
  const prefix = options.prefixLength ?? 24
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) throw new Error('Invalid guest prefix length')
  const runner = options.runner ?? defaultRunner
  const enableForwarding = options.enableForwarding ?? forwarding
  const work = new Map<string, Promise<void>>()
  const run = (command: string, args: readonly string[]) => runner.run(command, args)
  const succeeds = async (command: string, args: readonly string[]) => { try { await run(command, args); return true } catch { return false } }
  function validate(value: DeskNetworkAddress) {
    if (!/^dsk[0-9]{1,9}$/.test(value.tap)) throw new Error('Invalid TAP name')
    if (`${chainPrefix}-post-${value.tap}`.length > 28) throw new Error('iptables chain name exceeds 28 characters')
    address(value.guest)
    if (value.guest === options.gateway) throw new Error('Guest and gateway addresses must differ')
  }
  function chains({ tap, guest }: DeskNetworkAddress): Chain[] {
    const { gateway, dns } = options
    const proxyRules: Rule[] = egress.mode === 'proxied' ? [
      ['-p', 'tcp', '--dport', '80', '-j', 'DNAT', '--to-destination', `${gateway}:${egress.httpProxyPort}`],
      ['-p', 'tcp', '--dport', '443', '-j', 'DNAT', '--to-destination', `${gateway}:${egress.httpsProxyPort}`],
      ...(['udp', 'tcp'] as const).map((p) => ['-p', p, '--dport', '53', '-j', 'DNAT', '--to-destination', `${dns}:53`]),
    ] : []
    const proxyPorts: Rule[] = egress.mode === 'proxied'
      ? [egress.httpProxyPort, egress.httpsProxyPort].map((p) => ['-p', 'tcp', '-d', gateway, '--dport', String(p), '-j', 'ACCEPT'])
      : []
    const extraPorts: Rule[] = hostPorts.flatMap((p) => (['tcp', 'udp'] as const).map((protocol) =>
      ['-p', protocol, '-d', gateway, '--dport', String(p), '-j', 'ACCEPT']))
    const forwardRules: Rule[] = egress.mode === 'proxied' ? [
      ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
      ...(['udp', 'tcp'] as const).map((p) => ['-i', tap, '-p', p, '-d', dns, '--dport', '53', '-j', 'ACCEPT']),
      ['-j', 'DROP'],
    ] : [
      ['-o', tap, '-d', `${guest}/32`, '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
      ['-i', tap, '-s', `${guest}/32`, '-j', 'ACCEPT'],
      ['-j', 'DROP'],
    ]
    return [
      { table: 'nat', parent: 'PREROUTING', chain: `${chainPrefix}-pre-${tap}`, jumps: [['-i', tap]], rules: proxyRules },
      { table: 'nat', parent: 'POSTROUTING', chain: `${chainPrefix}-post-${tap}`, jumps: [['-s', `${guest}/32`]], rules: [['-j', 'MASQUERADE']] },
      { table: 'filter', parent: 'INPUT', chain: `${chainPrefix}-in-${tap}`, jumps: [['-i', tap]], rules: [
        ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
        ...proxyPorts, ...extraPorts, ['-j', 'DROP'],
      ] },
      { table: 'filter', parent: 'FORWARD', chain: `${chainPrefix}-fwd-${tap}`, jumps: [['-i', tap], ['-o', tap]], rules: forwardRules },
      ...(egress.mode === 'open' ? [
        { command: 'ip6tables' as const, table: 'filter' as const, parent: 'INPUT', chain: `${chainPrefix}-6in-${tap}`, jumps: [['-i', tap]], rules: [['-j', 'DROP']] },
        { command: 'ip6tables' as const, table: 'filter' as const, parent: 'FORWARD', chain: `${chainPrefix}-6fwd-${tap}`, jumps: [['-i', tap], ['-o', tap]], rules: [['-j', 'DROP']] },
      ] : []),
    ]
  }

  function serialize(tap: string, fn: () => Promise<void>): Promise<void> {
    const next = (work.get(tap) ?? Promise.resolve()).then(fn)
    const settled = next.then(() => undefined, () => undefined)
    work.set(tap, settled)
    void settled.then(() => { if (work.get(tap) === settled) work.delete(tap) })
    return next
  }
  return {
    ensure(value: DeskNetworkAddress): Promise<void> {
      validate(value)
      return serialize(value.tap, async () => {
        const { tap, guest } = value
        if (!(await succeeds('ip', ['link', 'show', 'dev', tap]))) await run('ip', ['tuntap', 'add', 'dev', tap, 'mode', 'tap'])
        await run('ip', ['addr', 'replace', `${options.gateway}/32`, 'dev', tap])
        await run('ip', ['link', 'set', 'dev', tap, 'up'])
        await run('ip', ['route', 'replace', `${guest}/32`, 'dev', tap])
        await enableForwarding()
        for (const { table, parent, chain, jumps, rules, command = 'iptables' } of chains(value)) {
          await succeeds(command, ['-t', table, '-N', chain])
          await run(command, ['-t', table, '-F', chain])
          for (const rule of rules) await run(command, ['-t', table, '-A', chain, ...rule])
          for (const jump of jumps) {
            const target = [...jump, '-j', chain]
            if (!(await succeeds(command, ['-t', table, '-C', parent, ...target]))) await run(command, ['-t', table, '-I', parent, '1', ...target])
          }
        }
      })
    },
    teardown(value: DeskNetworkAddress): Promise<void> {
      validate(value)
      return serialize(value.tap, async () => {
        for (const { table, parent, chain, jumps, command = 'iptables' } of chains(value)) {
          for (const jump of jumps) while (await succeeds(command, ['-t', table, '-C', parent, ...jump, '-j', chain])) {
            if (!(await succeeds(command, ['-t', table, '-D', parent, ...jump, '-j', chain]))) break
          }
          await succeeds(command, ['-t', table, '-F', chain]); await succeeds(command, ['-t', table, '-X', chain])
        }
        await succeeds('ip', ['link', 'del', 'dev', value.tap])
      })
    },
    async configureGuest(desk: Pick<DeskHandle, 'exec'>, value: DeskNetworkAddress): Promise<void> {
      validate(value)
      const script = ['set -e', 'dev=$(ls /sys/class/net | grep -E "^(en|eth)" | head -n 1)', 'test -n "$dev"', `ip addr replace ${value.guest}/${prefix} dev "$dev"`, 'ip link set dev "$dev" up', `ip route replace default via ${options.gateway} dev "$dev"`, 'rm -f /etc/resolv.conf', `printf 'nameserver %s\\n' ${options.dns} > /etc/resolv.conf`].join('\n')
      const result = await desk.exec({ command: '/bin/sh', args: ['-c', script], timeoutMs: 20_000 })
      if (result.exitCode !== 0) throw new Error(`The guest's network could not be configured: ${result.stderr.trim() || 'no reason given'}`)
    },
  }
}
export async function syncDeskGuestClock(desk: Pick<DeskHandle, 'exec'>, now = Date.now()): Promise<void> {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid clock time')
  const result = await desk.exec({ command: '/bin/sh', args: ['-c', `date -u -s @${(now / 1000).toFixed(3)} > /dev/null`], timeoutMs: 5_000 })
  if (result.exitCode !== 0) throw new Error(`The guest's clock could not be set: ${result.stderr.trim() || 'no reason given'}`)
}
