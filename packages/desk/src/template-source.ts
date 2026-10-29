import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Create an exclusive snapshot directory whose memory file is the SAME inode
 * as the source. The caller owns the source and must keep its bytes immutable
 * until every linked child has exited. Reflinking memory would not share the
 * page cache. The caller must validate and rewrite the configuration and fence
 * the guest before this directory can be restored.
 *
 * The source and destination must be on the same filesystem. A hard link is a
 * durable pin: unlinking the source name cannot invalidate a resident mapping.
 * This function never overwrites an existing destination.
 */
export async function pinTemplateMemory(source: string, destination: string, config: unknown): Promise<void> {
  const sourceMemory = join(source, 'memory-ranges')
  const memory = await lstat(sourceMemory)
  if (!memory.isFile() || memory.isSymbolicLink() || (memory.mode & 0o222) !== 0) {
    throw new Error('Template memory must be a read-only regular file')
  }
  const parent = dirname(destination)
  const stage = join(parent, `.${basename(destination)}.${randomUUID()}.tmp`)
  await mkdir(stage, { mode: 0o700 })
  try {
    await link(sourceMemory, join(stage, 'memory-ranges'))
    const pinned = await stat(join(stage, 'memory-ranges'))
    const current = await lstat(sourceMemory)
    if (!current.isFile() || current.dev !== memory.dev || current.ino !== memory.ino || pinned.dev !== memory.dev || pinned.ino !== memory.ino || (current.mode & 0o222) !== 0) {
      throw new Error('Template memory changed while pinning')
    }
    // state.json is private to the child, so it cannot mutate the template.
    await copyFile(join(source, 'state.json'), join(stage, 'state.json'), constants.COPYFILE_EXCL)
    await writeFile(join(stage, 'config.json'), JSON.stringify(config), { flag: 'wx', mode: 0o600 })
    for (const name of ['state.json', 'config.json']) {
      const file = await open(join(stage, name), 'r')
      try { await file.sync() } finally { await file.close() }
    }
    const dir = await open(stage, 'r')
    try { await dir.sync() } finally { await dir.close() }
    // Reserve the destination first: POSIX rename would otherwise replace an
    // existing empty directory, potentially invalidating a competing fork.
    await mkdir(destination, { mode: 0o700 })
    try {
      // Publishing individual entries into the reserved directory keeps the
      // hard-link pin even if the process dies halfway through publication.
      for (const name of ['memory-ranges', 'state.json', 'config.json']) {
        await rename(join(stage, name), join(destination, name))
      }
      await writeFile(join(destination, '.complete'), '1\n', { flag: 'wx', mode: 0o600 })
      const published = await open(destination, 'r')
      try { await published.sync() } finally { await published.close() }
      const parentDir = await open(parent, 'r')
      try { await parentDir.sync() } finally { await parentDir.close() }
    } catch (error) {
      // An incomplete destination is deliberately retained; a recovery owner
      // must establish that no VMM uses it before removing it.
      throw error
    }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

/** Reject incomplete fork publication before handing it to a VMM. */
export async function assertPinnedTemplateMemory(source: string, destination: string): Promise<void> {
  if (await readFile(join(destination, '.complete'), 'utf8') !== '1\n') throw new Error('Incomplete template fork')
  const [original, pinned] = await Promise.all([lstat(join(source, 'memory-ranges')), lstat(join(destination, 'memory-ranges'))])
  if (!original.isFile() || !pinned.isFile() || original.dev !== pinned.dev || original.ino !== pinned.ino || (original.mode & 0o222) !== 0) {
    throw new Error('Template fork does not pin the immutable memory source')
  }
}
