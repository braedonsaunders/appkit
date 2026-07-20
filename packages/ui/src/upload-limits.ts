export type AttachmentKind =
  | 'image'
  | 'document'
  | 'video'
  | 'audio'
  | 'signature'
  | 'other'

// Client mirror of the storage protocol's per-kind ceilings. Hosts still
// enforce their authoritative limits in requestUploadAction.
const DEFAULT_MAX_BY_KIND: Record<AttachmentKind, number> = {
  image: 50 * 1024 * 1024,
  signature: 10 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
  document: 1024 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  other: 500 * 1024 * 1024,
}

export function defaultMaxUploadBytes(kind: AttachmentKind): number {
  return DEFAULT_MAX_BY_KIND[kind]
}

export function formatUploadSizeLimit(sizeBytes: number): string {
  const gibibyte = 1024 * 1024 * 1024
  const mebibyte = 1024 * 1024
  if (sizeBytes % gibibyte === 0) return `${sizeBytes / gibibyte} GiB`
  return `${Math.round(sizeBytes / mebibyte)} MiB`
}
