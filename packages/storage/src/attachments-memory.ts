import type { AttachedFile, AttachmentAdapter, AttachmentTarget, AttachmentUrlIntent } from './attachments'

export interface MemoryAttachmentSeed {
  target: AttachmentTarget
  attachment: AttachedFile
  url: string
}

export interface MemoryAttachmentAdapterOptions {
  seed?: MemoryAttachmentSeed[]
  createId?: () => string
  now?: () => Date
  createdBy?: string | null
  createObjectUrl?: (file: File) => string
  revokeObjectUrl?: (url: string) => void
}

/** Fully functional, database-free adapter for demos, tests, and local tools. */
export function createMemoryAttachmentAdapter({
  seed = [],
  createId = defaultId,
  now = () => new Date(),
  createdBy = null,
  createObjectUrl = (file) => URL.createObjectURL(file),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
}: MemoryAttachmentAdapterOptions = {}): AttachmentAdapter {
  const records = new Map<string, { attachment: AttachedFile; url: string; owned: boolean }[]>()
  for (const entry of seed) {
    const key = targetKey(entry.target)
    records.set(key, [...(records.get(key) ?? []), { attachment: { ...entry.attachment }, url: entry.url, owned: false }])
  }

  const adapter: AttachmentAdapter = {
    async list(target) {
      return (records.get(targetKey(target)) ?? []).map((entry) => ({ ...entry.attachment }))
    },
    async upload(target, file) {
      const id = createId()
      const attachment: AttachedFile = {
        id,
        attachmentId: `attachment:${id}`,
        name: file.name,
        fileType: file.name.includes('.') ? file.name.split('.').pop() ?? '' : '',
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        createdAt: now().toISOString(),
        createdBy,
      }
      const key = targetKey(target)
      records.set(key, [
        { attachment, url: createObjectUrl(file), owned: true },
        ...(records.get(key) ?? []),
      ])
      return { ...attachment }
    },
    async remove(target, attachment) {
      const key = targetKey(target)
      const entries = records.get(key) ?? []
      const removed = entries.find((entry) => entry.attachment.attachmentId === attachment.attachmentId)
      if (removed?.owned) revokeObjectUrl(removed.url)
      records.set(key, entries.filter((entry) => entry.attachment.attachmentId !== attachment.attachmentId))
    },
    url(attachment, _intent: AttachmentUrlIntent) {
      for (const entries of records.values()) {
        const match = entries.find((entry) => entry.attachment.id === attachment.id)
        if (match) return match.url
      }
      return ''
    },
    dispose() {
      for (const entries of records.values()) {
        for (const entry of entries) if (entry.owned) revokeObjectUrl(entry.url)
      }
      records.clear()
    },
  }
  return adapter
}

function targetKey(target: AttachmentTarget): string {
  return `${target.targetTable}\u0000${target.targetId}`
}

function defaultId(): string {
  return globalThis.crypto.randomUUID()
}
