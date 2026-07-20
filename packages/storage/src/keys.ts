import { randomUUID } from 'node:crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCOPE_RE = /^[a-z0-9_](?:[a-z0-9_/-]*[a-z0-9_])?$/
const OBJECT_KEY_PART_RE = /^[a-zA-Z0-9._-]+$/

export function assertTenantObjectKey(args: { tenantId: string; key: string }): void {
  if (!UUID_RE.test(args.tenantId)) throw new Error('Tenant id must be a UUID')
  if (!args.key || args.key.length > 1_024 || args.key.includes('\\')) {
    throw new Error('Storage object key is invalid')
  }
  const parts = args.key.split('/')
  if (
    parts.length < 4 ||
    parts[0] !== 't' ||
    parts[1] !== args.tenantId.toLowerCase() ||
    parts.slice(2).some((part) => !OBJECT_KEY_PART_RE.test(part) || part === '.' || part === '..')
  ) {
    throw new Error('Storage object key does not belong to the tenant')
  }
}

export function assertTenantBrandingObjectKey(args: { tenantId: string; key: string }): void {
  if (!UUID_RE.test(args.tenantId)) throw new Error('Tenant id must be a UUID')
  if (!args.key || args.key.length > 1_024 || args.key.includes('\\')) {
    throw new Error('Tenant branding object key is invalid')
  }
  const parts = args.key.split('/')
  const valid = parts.every((part) => OBJECT_KEY_PART_RE.test(part) && part !== '.' && part !== '..')
  if (!valid || parts[0] !== 't' || parts[1] !== args.tenantId.toLowerCase() || parts[2] !== 'branding' || parts.length < 4) {
    throw new Error('Tenant branding object key does not belong to the active tenant')
  }
}

/** Branding-specific alias for logo upload adapters. */
export const assertTenantLogoObjectKey = assertTenantBrandingObjectKey

export function newTenantObjectKey(args: { tenantId: string; scope: string; filename: string }): string {
  if (!UUID_RE.test(args.tenantId)) throw new Error('Tenant id must be a UUID')
  if (!SCOPE_RE.test(args.scope) || args.scope.split('/').some((part) => !part || part === '..')) {
    throw new Error('Object scope is invalid')
  }
  const safe = args.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
  return `t/${args.tenantId.toLowerCase()}/${args.scope}/${randomUUID()}-${safe}`
}

export function newAttachmentKey(args: {
  tenantId: string
  kind: 'image' | 'document' | 'video' | 'audio' | 'signature' | 'other'
  filename: string
}): string {
  return newTenantObjectKey({ tenantId: args.tenantId, scope: args.kind, filename: args.filename })
}

export function newPendingUploadKey(args: { tenantId: string; uploadId: string }): string {
  if (!UUID_RE.test(args.uploadId)) throw new Error('Upload id must be a UUID')
  return newTenantObjectKey({ tenantId: args.tenantId, scope: '_pending', filename: args.uploadId })
}

function decodedUrlPathParts(url: URL): string[] | null {
  const encodedParts = url.pathname.split('/').slice(1)
  if (encodedParts.at(-1) === '') encodedParts.pop()
  const parts: string[] = []
  for (const encodedPart of encodedParts) {
    if (!encodedPart) return null
    let part: string
    try { part = decodeURIComponent(encodedPart) } catch { return null }
    if (!part || part === '.' || part === '..' || part.includes('/') || part.includes('\\') || /[\u0000-\u001f\u007f]/.test(part)) return null
    parts.push(part)
  }
  return parts
}

export function objectKeyFromStorageUrl(args: { url: string; endpoint: string; bucket: string }): string | null {
  let candidate: URL
  let endpoint: URL
  try { candidate = new URL(args.url); endpoint = new URL(args.endpoint) } catch { return null }
  if (!['http:', 'https:'].includes(candidate.protocol) || !['http:', 'https:'].includes(endpoint.protocol) || candidate.username || candidate.password || endpoint.username || endpoint.password || candidate.origin !== endpoint.origin) return null
  const candidateParts = decodedUrlPathParts(candidate)
  const endpointParts = decodedUrlPathParts(endpoint)
  if (!candidateParts || !endpointParts || endpointParts.some((part, index) => candidateParts[index] !== part)) return null
  const bucketIndex = endpointParts.length
  if (candidateParts[bucketIndex] !== args.bucket) return null
  const key = candidateParts.slice(bucketIndex + 1).join('/')
  return key && key.length <= 1_024 ? key : null
}
