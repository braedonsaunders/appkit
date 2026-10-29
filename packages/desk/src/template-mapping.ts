import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** True only for a writable private mapping of the registered inode/device. */
export function hasPrivateMemoryMapping(maps: string, device: bigint, inode: bigint): boolean {
  const major = ((device >> 8n) & 0xfffn) | ((device >> 32n) & ~0xfffn)
  const minor = (device & 0xffn) | ((device >> 12n) & ~0xffn)
  return maps.split('\n').some(line => {
    const fields = line.trim().split(/\s+/)
    if (!fields[1]?.startsWith('rw-') || !fields[1].endsWith('p') || !fields[3] || !fields[4]) return false
    const parts = fields[3].split(':')
    if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[a-f0-9]+$/i.test(parts[0]) || !/^[a-f0-9]+$/i.test(parts[1]) || !/^\d+$/.test(fields[4])) return false
    return BigInt(`0x${parts[0]}`) === major && BigInt(`0x${parts[1]}`) === minor && BigInt(fields[4]) === inode
  })
}

/** Check the real VMM mapping before guest resume; inability to inspect fails closed. */
export async function assertPrivateMemoryMapping(pid: number | undefined, snapshot: string): Promise<void> {
  if (!pid || !Number.isSafeInteger(pid) || pid < 1) throw new Error('Cannot identify the template VMM process')
  const source = await stat(join(snapshot, 'memory-ranges'), { bigint: true })
  const maps = await readFile(`/proc/${pid}/maps`, 'utf8')
  if (!source.isFile() || !hasPrivateMemoryMapping(maps, source.dev, source.ino)) throw new Error('VMM did not privately map the template memory inode')
}
