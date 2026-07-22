import type { AppBundleFile } from './bundle'

export interface AppObjectSpec {
  type: string
  key: string
  definition: Record<string, unknown>
  sourcePath: string
}

export interface ParsedAppObjects {
  objects: AppObjectSpec[]
  errors: string[]
}

/** Parse every objects/*.json declaration without imposing an application domain schema. */
export function parseAppObjects(files: AppBundleFile[]): ParsedAppObjects {
  const objects: AppObjectSpec[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const file of files) {
    if (!/^objects\/[^/]+\.json$/.test(file.path)) continue
    if (file.isBinary) { errors.push(`${file.path}: must be a JSON text file`); continue }
    let value: unknown
    try { value = JSON.parse(file.content) } catch { errors.push(`${file.path}: invalid JSON`); continue }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${file.path}: object declaration must be an object`); continue }
    const definition = value as Record<string, unknown>
    const type = typeof definition.type === 'string' ? definition.type.trim() : ''
    const key = typeof definition.key === 'string' ? definition.key.trim() : ''
    if (!/^[a-z][a-z0-9_-]*$/.test(type)) { errors.push(`${file.path}: type must be a slug`); continue }
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) { errors.push(`${file.path}: key must be a slug`); continue }
    const identity = `${type}:${key}`
    if (seen.has(identity)) { errors.push(`${file.path}: duplicate object "${identity}"`); continue }
    seen.add(identity)
    objects.push({ type, key, definition, sourcePath: file.path })
  }
  return { objects, errors }
}
