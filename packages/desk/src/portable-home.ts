import { createHash } from 'node:crypto'
import { posix } from 'node:path'

export const PORTABLE_DESK_HOME_VERSION = 1 as const

export type PortableDeskHomeEntry =
  | { path: string; kind: 'directory'; mode: number; modifiedAt: string | null }
  | { path: string; kind: 'file'; mode: number; modifiedAt: string | null; size: number; digest: string }
  | { path: string; kind: 'symlink'; mode: number; modifiedAt: string | null; target: string }

export type PortableDeskHomeManifest = {
  version: typeof PORTABLE_DESK_HOME_VERSION
  createdAt: string
  entries: readonly PortableDeskHomeEntry[]
  totalBytes: number
}

export type PortableDeskHomeArchive = {
  manifest: PortableDeskHomeManifest
  /** Content-addressed file bodies. Identical files occupy one blob. */
  blobs: ReadonlyMap<string, Uint8Array>
}

export type DeskHomeSourceEntry =
  | Omit<Extract<PortableDeskHomeEntry, { kind: 'directory' }>, 'path'> & { path: string }
  | Omit<Extract<PortableDeskHomeEntry, { kind: 'file' }>, 'path' | 'size' | 'digest'> & { path: string }
  | Omit<Extract<PortableDeskHomeEntry, { kind: 'symlink' }>, 'path'> & { path: string }

export interface PortableDeskHomeSource {
  entries(signal: AbortSignal): AsyncIterable<DeskHomeSourceEntry>
  readFile(path: string, signal: AbortSignal): Promise<Uint8Array>
}

export interface PortableDeskHomeImport {
  writeDirectory(entry: Extract<PortableDeskHomeEntry, { kind: 'directory' }>, signal: AbortSignal): Promise<void>
  writeFile(
    entry: Extract<PortableDeskHomeEntry, { kind: 'file' }>,
    bytes: Uint8Array,
    signal: AbortSignal,
  ): Promise<void>
  writeSymlink(entry: Extract<PortableDeskHomeEntry, { kind: 'symlink' }>, signal: AbortSignal): Promise<void>
  /** Atomically make the staged home authoritative. */
  commit(signal: AbortSignal): Promise<void>
  /** Best-effort cleanup of an uncommitted staging area. */
  rollback(): Promise<void>
}

export interface PortableDeskHomeSink {
  begin(manifest: PortableDeskHomeManifest, signal: AbortSignal): Promise<PortableDeskHomeImport>
}

export type PortableDeskHomeLimits = {
  maxEntries?: number
  maxFileBytes?: number
  maxTotalBytes?: number
}

const DEFAULT_LIMITS = {
  maxEntries: 20_000,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
} as const

export async function exportPortableDeskHome(
  source: PortableDeskHomeSource,
  options: PortableDeskHomeLimits & { signal?: AbortSignal; now?: () => Date } = {},
): Promise<PortableDeskHomeArchive> {
  const limits = resolveLimits(options)
  const controller = linkedController(options.signal)
  const entries: PortableDeskHomeEntry[] = []
  const blobs = new Map<string, Uint8Array>()
  let totalBytes = 0

  for await (const raw of source.entries(controller.signal)) {
    throwIfAborted(controller.signal)
    if (entries.length >= limits.maxEntries) throw new Error(`Desk home exceeds ${limits.maxEntries} entries.`)
    const path = portablePath(raw.path)
    const base = { path, mode: portableMode(raw.mode), modifiedAt: portableDate(raw.modifiedAt) }
    if (raw.kind === 'directory') {
      entries.push({ ...base, kind: 'directory' })
      continue
    }
    if (raw.kind === 'symlink') {
      entries.push({ ...base, kind: 'symlink', target: portableSymlinkTarget(path, raw.target) })
      continue
    }
    const bytes = await source.readFile(path, controller.signal)
    if (!(bytes instanceof Uint8Array)) throw new Error(`Desk home source returned invalid bytes for ${path}.`)
    if (bytes.byteLength > limits.maxFileBytes) throw new Error(`Desk home file ${path} exceeds ${limits.maxFileBytes} bytes.`)
    totalBytes += bytes.byteLength
    if (totalBytes > limits.maxTotalBytes) throw new Error(`Desk home exceeds ${limits.maxTotalBytes} total bytes.`)
    const digest = digestBytes(bytes)
    if (!blobs.has(digest)) blobs.set(digest, Uint8Array.from(bytes))
    entries.push({ ...base, kind: 'file', size: bytes.byteLength, digest })
  }

  entries.sort(compareEntries)
  assertUniquePaths(entries)
  return {
    manifest: {
      version: PORTABLE_DESK_HOME_VERSION,
      createdAt: (options.now?.() ?? new Date()).toISOString(),
      entries,
      totalBytes,
    },
    blobs,
  }
}

export async function importPortableDeskHome(
  archive: PortableDeskHomeArchive,
  sink: PortableDeskHomeSink,
  options: PortableDeskHomeLimits & { signal?: AbortSignal } = {},
): Promise<void> {
  const limits = resolveLimits(options)
  const controller = linkedController(options.signal)
  const manifest = validateArchive(archive, limits)
  const writer = await sink.begin(manifest, controller.signal)
  let committed = false
  try {
    for (const entry of manifest.entries.filter((candidate) => candidate.kind === 'directory')) {
      throwIfAborted(controller.signal)
      await writer.writeDirectory(entry, controller.signal)
    }
    for (const entry of manifest.entries.filter((candidate) => candidate.kind !== 'directory')) {
      throwIfAborted(controller.signal)
      if (entry.kind === 'symlink') await writer.writeSymlink(entry, controller.signal)
      else {
        const bytes = archive.blobs.get(entry.digest)
        if (!bytes) throw new Error(`Desk home blob ${entry.digest} is missing.`)
        await writer.writeFile(entry, Uint8Array.from(bytes), controller.signal)
      }
    }
    await writer.commit(controller.signal)
    committed = true
  } finally {
    if (!committed) await writer.rollback().catch(() => undefined)
  }
}

function validateArchive(archive: PortableDeskHomeArchive, limits: Required<PortableDeskHomeLimits>): PortableDeskHomeManifest {
  const manifest = archive.manifest
  if (manifest.version !== PORTABLE_DESK_HOME_VERSION) throw new Error(`Unsupported desk home version ${String(manifest.version)}.`)
  if (!Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Desk home createdAt is invalid.')
  if (manifest.entries.length > limits.maxEntries) throw new Error(`Desk home exceeds ${limits.maxEntries} entries.`)
  let totalBytes = 0
  const entries = manifest.entries.map((entry): PortableDeskHomeEntry => {
    const path = portablePath(entry.path)
    const base = { path, mode: portableMode(entry.mode), modifiedAt: portableDate(entry.modifiedAt) }
    if (entry.kind === 'directory') return { ...base, kind: 'directory' }
    if (entry.kind === 'symlink') return { ...base, kind: 'symlink', target: portableSymlinkTarget(path, entry.target) }
    if (!Number.isInteger(entry.size) || entry.size < 0 || entry.size > limits.maxFileBytes) {
      throw new Error(`Desk home file ${path} has an invalid size.`)
    }
    const bytes = archive.blobs.get(entry.digest)
    if (!bytes || bytes.byteLength !== entry.size || digestBytes(bytes) !== entry.digest) {
      throw new Error(`Desk home file ${path} failed content verification.`)
    }
    totalBytes += entry.size
    if (totalBytes > limits.maxTotalBytes) throw new Error(`Desk home exceeds ${limits.maxTotalBytes} total bytes.`)
    return { ...base, kind: 'file', size: entry.size, digest: entry.digest }
  })
  assertUniquePaths(entries)
  if (totalBytes !== manifest.totalBytes) throw new Error('Desk home total byte count does not match its manifest.')
  return { ...manifest, entries: [...entries].sort(compareEntries), totalBytes }
}

function portablePath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) {
    throw new Error('Desk home paths must be non-empty portable paths.')
  }
  const normalized = posix.normalize(value)
  if (normalized !== value || posix.isAbsolute(value) || value === '..' || value.startsWith('../')) {
    throw new Error(`Desk home path escapes its root: ${value}`)
  }
  return value
}

function portableSymlinkTarget(path: string, target: string): string {
  if (typeof target !== 'string' || target.length === 0 || target.includes('\0') || target.includes('\\') || posix.isAbsolute(target)) {
    throw new Error(`Desk home symlink ${path} has an unsafe target.`)
  }
  const resolved = posix.normalize(posix.join(posix.dirname(path), target))
  if (resolved === '..' || resolved.startsWith('../')) throw new Error(`Desk home symlink ${path} escapes its root.`)
  return target
}

function portableMode(mode: number): number {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new Error('Desk home mode must be between 0000 and 7777.')
  return mode
}

function portableDate(value: string | null): string | null {
  if (value === null) return null
  if (!Number.isFinite(Date.parse(value))) throw new Error('Desk home modifiedAt is invalid.')
  return value
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function compareEntries(left: PortableDeskHomeEntry, right: PortableDeskHomeEntry): number {
  const leftDepth = left.path.split('/').length
  const rightDepth = right.path.split('/').length
  return leftDepth - rightDepth || left.path.localeCompare(right.path)
}

function assertUniquePaths(entries: readonly PortableDeskHomeEntry[]): void {
  const paths = new Set<string>()
  for (const entry of entries) {
    if (paths.has(entry.path)) throw new Error(`Desk home contains duplicate path ${entry.path}.`)
    paths.add(entry.path)
  }
}

function resolveLimits(options: PortableDeskHomeLimits): Required<PortableDeskHomeLimits> {
  return {
    maxEntries: positiveLimit(options.maxEntries ?? DEFAULT_LIMITS.maxEntries, 'maxEntries'),
    maxFileBytes: positiveLimit(options.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes, 'maxFileBytes'),
    maxTotalBytes: positiveLimit(options.maxTotalBytes ?? DEFAULT_LIMITS.maxTotalBytes, 'maxTotalBytes'),
  }
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer.`)
  return value
}

function linkedController(signal?: AbortSignal): AbortController {
  const controller = new AbortController()
  if (!signal) return controller
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  return controller
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('The operation was aborted.', 'AbortError')
}
