import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, open, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { cleanDeskId } from './plan'
import { planTemplateConfig, type DeskTemplateChildIdentity } from './template-plan'
import { assertPinnedTemplateMemory, pinTemplateMemory } from './template-source'

/** Compatibility inputs must describe the actual VMM and host CPU, not labels. */
export interface DeskTemplateCompatibility {
  vmmVersion: string
  cpuSignature: string
  kernelPath: string
  initramfsPath: string
  attachmentPaths: readonly string[]
}

interface Registration {
  version: 1
  diskPath: string
  compatibility: DeskTemplateCompatibility
  files: Record<string, string>
}

async function digest(path: string, immutable: boolean): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Template paths must be absolute')
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || (immutable && (before.mode & 0o222) !== 0)) throw new Error(`Template file must be ${immutable ? 'read-only and ' : ''}regular: ${path}`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  const after = await lstat(path)
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error(`Template file changed during verification: ${path}`)
  return hash.digest('hex')
}

async function measure(snapshot: string, diskPath: string, compatibility: DeskTemplateCompatibility): Promise<Registration> {
  if (!isAbsolute(snapshot) || !compatibility.cpuSignature || !compatibility.vmmVersion) throw new Error('Invalid template compatibility identity')
  const diskFiles = [join(snapshot, 'config.json'), join(snapshot, 'state.json'), join(snapshot, 'memory-ranges'), diskPath]
  const boundFiles = [compatibility.kernelPath, compatibility.initramfsPath, ...compatibility.attachmentPaths]
  const all = [...diskFiles, ...boundFiles]
  if (new Set(all).size !== all.length) throw new Error('Template file identities must be distinct')
  const values = await Promise.all(all.map((path, index) => digest(path, index < diskFiles.length)))
  const files: Record<string, string> = {}
  all.forEach((path, index) => { files[path] = values[index]! })
  return { version: 1, diskPath, compatibility, files }
}

/**
 * Register a stopped, specially prepared template. The caller must ensure the
 * guest was fenced and contains no user data or credentials; hashing cannot
 * prove provenance. Every source file is kept read-only and protected against
 * writers for as long as any child can map its memory.
 */
export async function registerDeskTemplate(snapshot: string, diskPath: string, compatibility: DeskTemplateCompatibility): Promise<void> {
  const registration = await measure(snapshot, diskPath, compatibility)
  const config = JSON.parse(await readFile(join(snapshot, 'config.json'), 'utf8')) as { disks?: { path?: string; readonly?: boolean }[]; payload?: { kernel?: string; initramfs?: string } }
  if (config.payload?.kernel !== compatibility.kernelPath || config.payload.initramfs !== compatibility.initramfsPath) throw new Error('Template kernel or initramfs does not match its configuration')
  if (config.disks?.[0]?.path !== diskPath || config.disks[0].readonly === true || JSON.stringify(config.disks.slice(1).map(disk => disk.path)) !== JSON.stringify(compatibility.attachmentPaths) || config.disks.slice(1).some(disk => disk.readonly !== true)) throw new Error('Template disk and attachments do not match its configuration')
  const file = await open(join(snapshot, 'appkit-template.json'), 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(registration)); await file.sync() } finally { await file.close() }
  const directory = await open(snapshot, 'r')
  try { await directory.sync() } finally { await directory.close() }
}

/**
 * Prepare a child in a new private directory, without starting it. The caller
 * must hold a network/workload fence until guest reinitialization succeeds.
 * A failed or interrupted child directory is deliberately left for recovery.
 */
export async function forkDeskTemplate(snapshot: string, childDirectory: string, child: Omit<DeskTemplateChildIdentity, 'diskPath'> & { deskId: string }, compatibility: DeskTemplateCompatibility): Promise<{ diskPath: string; snapshotPath: string }> {
  if (!isAbsolute(childDirectory)) throw new Error('Child directory must be absolute')
  const registered = JSON.parse(await readFile(join(snapshot, 'appkit-template.json'), 'utf8')) as Registration
  if (registered.version !== 1 || typeof registered.diskPath !== 'string' || JSON.stringify(registered.compatibility) !== JSON.stringify(compatibility)) throw new Error('Template compatibility does not match')
  const measured = await measure(snapshot, registered.diskPath, compatibility)
  if (JSON.stringify(measured) !== JSON.stringify(registered)) throw new Error('Template source changed since registration')
  const diskPath = join(childDirectory, 'disk.raw')
  const snapshotPath = join(childDirectory, `${cleanDeskId(child.deskId)}.snapshot`)
  const config = planTemplateConfig(JSON.parse(await readFile(join(snapshot, 'config.json'), 'utf8')), { ...child, diskPath })
  await mkdir(childDirectory, { mode: 0o700 })
  const parent = await open(dirname(childDirectory), 'r')
  try { await parent.sync() } finally { await parent.close() }
  await copyFile(registered.diskPath, diskPath, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
  await chmod(diskPath, 0o600)
  const [sourceDisk, childDisk] = await Promise.all([stat(registered.diskPath), stat(diskPath)])
  if (sourceDisk.dev === childDisk.dev && sourceDisk.ino === childDisk.ino) throw new Error('Child disk must be independent')
  if (await digest(diskPath, false) !== registered.files[registered.diskPath]) throw new Error('Child disk does not match the registered template')
  const disk = await open(diskPath, 'r')
  try { await disk.sync() } finally { await disk.close() }
  await pinTemplateMemory(snapshot, snapshotPath, config)
  await assertPinnedTemplateMemory(snapshot, snapshotPath)
  const attachments = compatibility.attachmentPaths.map(path => ({ path, sha256: registered.files[path], kind: 'block' }))
  for (const [name, value] of [['appkit-cpu-signature', compatibility.cpuSignature], ['attachments.json', JSON.stringify(attachments)]] as const) {
    const file = await open(join(snapshotPath, name), 'wx', 0o600)
    try { await file.writeFile(value); await file.sync() } finally { await file.close() }
  }
  const snapshotDir = await open(snapshotPath, 'r')
  try { await snapshotDir.sync() } finally { await snapshotDir.close() }
  const marker = await open(join(childDirectory, '.prepared'), 'wx', 0o600)
  try { await marker.writeFile('1\n'); await marker.sync() } finally { await marker.close() }
  const directory = await open(childDirectory, 'r')
  try { await directory.sync() } finally { await directory.close() }
  return { diskPath, snapshotPath }
}
