import { z } from 'zod'

const SLUG = /^[a-z][a-z0-9-]*$/
const VERSION = /^\d+(\.\d+){0,2}(-[0-9a-z.-]+)?$/i
const BUNDLE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9._\-/]+$/i

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY'] as const
export type AppHttpMethod = (typeof HTTP_METHODS)[number]

export const endpointSchema = z.object({
  name: z.string().regex(SLUG, 'endpoint name must be a slug').max(64),
  file: z.string().regex(BUNDLE_PATH, 'invalid endpoint file path').max(240),
  method: z.enum(HTTP_METHODS).default('ANY'),
})

export const manifestSchema = z.object({
  key: z.string().regex(SLUG, 'key must be a slug').max(64),
  name: z.string().trim().min(1).max(120),
  version: z.string().regex(VERSION, 'version must look like 1.0.0'),
  description: z.string().max(2_000).optional(),
  icon: z.string().max(80).optional(),
  permissions: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  frontend: z.object({ entry: z.string().regex(BUNDLE_PATH, 'invalid frontend entry path').max(240) }),
  endpoints: z.array(endpointSchema).max(100).default([]),
  nav: z.object({
    show: z.boolean().default(true),
    label: z.string().max(120).optional(),
    icon: z.string().max(80).optional(),
  }).optional(),
})

export type AppManifest = z.infer<typeof manifestSchema>
export type AppEndpoint = z.infer<typeof endpointSchema>

export interface ManifestResult {
  ok: boolean
  manifest?: AppManifest
  errors: string[]
}

export function parseManifest(raw: unknown): ManifestResult {
  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
  }
  const errors: string[] = []
  const endpoints = new Set<string>()
  const permissions = new Set<string>()
  for (const endpoint of result.data.endpoints) {
    if (endpoints.has(endpoint.name)) errors.push(`duplicate endpoint name: ${endpoint.name}`)
    endpoints.add(endpoint.name)
  }
  for (const permission of result.data.permissions) {
    if (permissions.has(permission)) errors.push(`duplicate permission: ${permission}`)
    permissions.add(permission)
  }
  return { ok: errors.length === 0, ...(errors.length ? {} : { manifest: result.data }), errors }
}

export function validateBundle(manifest: AppManifest, paths: string[]): {
  ok: boolean
  errors: string[]
  kinds: Record<string, 'frontend' | 'backend' | 'asset' | 'object'>
} {
  const errors: string[] = []
  const kinds: Record<string, 'frontend' | 'backend' | 'asset' | 'object'> = {}
  const unique = new Set(paths)
  if (unique.size !== paths.length) errors.push('bundle has duplicate file paths')
  if (!unique.has(manifest.frontend.entry)) errors.push(`frontend entry not found: ${manifest.frontend.entry}`)
  const backend = new Set<string>()
  for (const endpoint of manifest.endpoints) {
    if (!unique.has(endpoint.file)) errors.push(`endpoint "${endpoint.name}" file not found: ${endpoint.file}`)
    backend.add(endpoint.file)
  }
  for (const path of paths) {
    if (!BUNDLE_PATH.test(path)) errors.push(`invalid bundle path: ${path}`)
    if (backend.has(path)) kinds[path] = 'backend'
    else if (path.startsWith('objects/') && path.endsWith('.json')) kinds[path] = 'object'
    else if (path === manifest.frontend.entry || path.startsWith('frontend/')) kinds[path] = 'frontend'
    else kinds[path] = 'asset'
  }
  return { ok: errors.length === 0, errors, kinds }
}

export function contentTypeFor(path: string): { contentType: string; binary: boolean } {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (extension === 'html') return { contentType: 'text/html; charset=utf-8', binary: false }
  if (extension === 'js' || extension === 'mjs') return { contentType: 'text/javascript; charset=utf-8', binary: false }
  if (extension === 'css') return { contentType: 'text/css; charset=utf-8', binary: false }
  if (extension === 'json') return { contentType: 'application/json; charset=utf-8', binary: false }
  if (extension === 'svg') return { contentType: 'image/svg+xml', binary: false }
  if (extension === 'png') return { contentType: 'image/png', binary: true }
  if (extension === 'jpg' || extension === 'jpeg') return { contentType: 'image/jpeg', binary: true }
  if (extension === 'gif') return { contentType: 'image/gif', binary: true }
  if (extension === 'webp') return { contentType: 'image/webp', binary: true }
  if (extension === 'woff') return { contentType: 'font/woff', binary: true }
  if (extension === 'woff2') return { contentType: 'font/woff2', binary: true }
  return { contentType: 'text/plain; charset=utf-8', binary: false }
}
