import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** True only when writable private mappings cover every byte of the source. */
export function hasPrivateMemoryMapping(maps: string, device: bigint, inode: bigint, size: bigint): boolean {
  if (size <= 0n) return false
  const major = ((device >> 8n) & 0xfffn) | ((device >> 32n) & ~0xfffn)
  const minor = (device & 0xffn) | ((device >> 12n) & ~0xffn)
  const ranges: { start: bigint; end: bigint }[] = []
  for (const line of maps.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (!fields[0] || !fields[1]?.startsWith('rw-') || !fields[1].endsWith('p') || !fields[2] || !fields[3] || !fields[4]) continue
    const address = fields[0].split('-'), parts = fields[3].split(':')
    if (address.length !== 2 || parts.length !== 2 || !address[0] || !address[1] || !parts[0] || !parts[1]
      || !address.every(part => /^[a-f0-9]+$/i.test(part)) || !parts.every(part => /^[a-f0-9]+$/i.test(part))
      || !/^[a-f0-9]+$/i.test(fields[2]) || !/^\d+$/.test(fields[4])) continue
    if (BigInt(`0x${parts[0]}`) !== major || BigInt(`0x${parts[1]}`) !== minor || BigInt(fields[4]) !== inode) continue
    const length = BigInt(`0x${address[1]}`) - BigInt(`0x${address[0]}`)
    if (length <= 0n) continue
    const offset = BigInt(`0x${fields[2]}`)
    ranges.push({ start: offset, end: offset + length })
  }
  ranges.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
  let covered = 0n
  for (const range of ranges) {
    if (range.start > covered) break
    if (range.end > covered) covered = range.end
    if (covered >= size) return true
  }
  return false
}

/** Check the real VMM mapping before guest resume; inability to inspect fails closed. */
export async function assertPrivateMemoryMapping(pid: number | undefined, snapshot: string): Promise<void> {
  if (!pid || !Number.isSafeInteger(pid) || pid < 1) throw new Error('Cannot identify the template VMM process')
  const source = await stat(join(snapshot, 'memory-ranges'), { bigint: true })
  const maps = await readFile(`/proc/${pid}/maps`, 'utf8')
  if (!source.isFile() || !hasPrivateMemoryMapping(maps, source.dev, source.ino, source.size)) throw new Error('VMM did not privately map the template memory inode')
}
