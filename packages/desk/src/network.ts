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
  httpProxyPort: number
  httpsProxyPort: number
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
interface Chain { table: 'nat' | 'filter'; parent: string; chain: string; jumps: Rule[]; rules: Rule[] }
/** Point-to-point TAP with transparent HTTP/HTTPS egress and DNS-only forwarding. */
export function createDeskNetwork(options: DeskNetworkOptions) {
  address(options.gateway); address(options.dns); port(options.httpProxyPort); port(options.httpsProxyPort)
  const prefix = options.prefixLength ?? 24
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) throw new Error('Invalid guest prefix length')
  const runner = options.runner ?? defaultRunner
  const enableForwarding = options.enableForwarding ?? forwarding
  const work = new Map<string, Promise<void>>()
  const run = (command: string, args: readonly string[]) => runner.run(command, args)
  const succeeds = async (command: string, args: readonly string[]) => { try { await run(command, args); return true } catch { return false } }
  function validate(value: DeskNetworkAddress) {
    if (!/^dsk[0-9]{1,9}$/.test(value.tap)) throw new Error('Invalid TAP name')
    address(value.guest)
    if (value.guest === options.gateway) throw new Error('Guest and gateway addresses must differ')
  }
  function chains({ tap, guest }: DeskNetworkAddress): Chain[] {
    const { gateway, dns, httpProxyPort: http, httpsProxyPort: https } = options
    return [
      { table: 'nat', parent: 'PREROUTING', chain: `bh-pre-${tap}`, jumps: [['-i', tap]], rules: [
        ['-p', 'tcp', '--dport', '80', '-j', 'DNAT', '--to-destination', `${gateway}:${http}`],
        ['-p', 'tcp', '--dport', '443', '-j', 'DNAT', '--to-destination', `${gateway}:${https}`],
        ...(['udp', 'tcp'] as const).map((p) => ['-p', p, '--dport', '53', '-j', 'DNAT', '--to-destination', `${dns}:53`]),
      ] },
      { table: 'nat', parent: 'POSTROUTING', chain: `bh-post-${tap}`, jumps: [['-s', `${guest}/32`]], rules: [['-j', 'MASQUERADE']] },
      { table: 'filter', parent: 'INPUT', chain: `bh-in-${tap}`, jumps: [['-i', tap]], rules: [
        ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
        ...[http, https].map((p) => ['-p', 'tcp', '-d', gateway, '--dport', String(p), '-j', 'ACCEPT']), ['-j', 'DROP'],
      ] },
      { table: 'filter', parent: 'FORWARD', chain: `bh-fwd-${tap}`, jumps: [['-i', tap], ['-o', tap]], rules: [
        ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
        ...(['udp', 'tcp'] as const).map((p) => ['-i', tap, '-p', p, '-d', dns, '--dport', '53', '-j', 'ACCEPT']), ['-j', 'DROP'],
      ] },
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
        for (const { table, parent, chain, jumps, rules } of chains(value)) {
          await succeeds('iptables', ['-t', table, '-N', chain])
          await run('iptables', ['-t', table, '-F', chain])
          for (const rule of rules) await run('iptables', ['-t', table, '-A', chain, ...rule])
          for (const jump of jumps) {
            const target = [...jump, '-j', chain]
            if (!(await succeeds('iptables', ['-t', table, '-C', parent, ...target]))) await run('iptables', ['-t', table, '-I', parent, '1', ...target])
          }
        }
      })
    },
    teardown(value: DeskNetworkAddress): Promise<void> {
      validate(value)
      return serialize(value.tap, async () => {
        for (const { table, parent, chain, jumps } of chains(value)) {
          for (const jump of jumps) while (await succeeds('iptables', ['-t', table, '-C', parent, ...jump, '-j', chain])) {
            if (!(await succeeds('iptables', ['-t', table, '-D', parent, ...jump, '-j', chain]))) break
          }
          await succeeds('iptables', ['-t', table, '-F', chain]); await succeeds('iptables', ['-t', table, '-X', chain])
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
