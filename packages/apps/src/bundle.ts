import { strFromU8, unzipSync } from 'fflate'
import { contentTypeFor } from './manifest'

export interface AppBundleFile {
  path: string
  content: string
  isBinary?: boolean
}

export interface AppBundle {
  manifest: unknown
  files: AppBundleFile[]
  grantedPermissions?: string[]
}

export class AppBundleError extends Error {
  override readonly name = 'AppBundleError'
}

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/
const MAX_FILES = 500
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export function parseZipBundle(bytes: Uint8Array): AppBundle {
  let entries: Record<string, Uint8Array>
  try { entries = unzipSync(bytes) } catch (error) {
    throw new AppBundleError(`not a readable zip archive: ${error instanceof Error ? error.message : String(error)}`)
  }
  const paths = Object.keys(entries).filter((path) => !path.endsWith('/') && !JUNK.test(path))
  if (!paths.length) throw new AppBundleError('zip archive is empty')
  if (paths.length > MAX_FILES) throw new AppBundleError(`too many files (max ${MAX_FILES})`)

  let prefix = ''
  if (!paths.includes('manifest.json')) {
    const nested = paths.find((path) => /(^|\/)manifest\.json$/.test(path))
    if (!nested) throw new AppBundleError('manifest.json not found in the archive')
    prefix = nested.slice(0, -'manifest.json'.length)
    if (!paths.every((path) => path.startsWith(prefix))) throw new AppBundleError('manifest.json must be at the archive root')
  }

  let total = 0
  let manifest: unknown
  const files: AppBundleFile[] = []
  for (const rawPath of paths) {
    const data = entries[rawPath]!
    total += data.length
    if (total > MAX_TOTAL_BYTES) throw new AppBundleError('bundle exceeds 20 MB decompressed')
    const path = rawPath.slice(prefix.length)
    if (path === 'manifest.json') {
      try { manifest = JSON.parse(strFromU8(data)) } catch { throw new AppBundleError('manifest.json is not valid JSON') }
      continue
    }
    if (!path) continue
    const { binary } = contentTypeFor(path)
    files.push({ path, content: binary ? bytesToBase64(data) : strFromU8(data), isBinary: binary })
  }
  if (manifest === undefined) throw new AppBundleError('manifest.json not found in the archive')
  return { manifest, files }
}

function bytesToBase64(value: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('base64')
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}
