export interface AttachmentTarget {
  targetTable: string
  targetId: string
}

/** File metadata retained from the production attachment workspace contract. */
export interface AttachedFile {
  id: string
  name: string
  fileType: string
  contentType: string
  sizeBytes: number
  createdAt: string
  createdBy: string | null
  attachmentId: string
}

export type AttachmentUrlIntent = 'download' | 'open' | 'preview'

/**
 * Host boundary for the attachment workspace. Applications keep ownership of
 * authorization, tenancy, persistence, object storage, and signed URL policy.
 */
export interface AttachmentAdapter {
  list: (target: AttachmentTarget, signal?: AbortSignal) => Promise<AttachedFile[]>
  upload: (target: AttachmentTarget, file: File) => Promise<AttachedFile>
  remove: (target: AttachmentTarget, attachment: AttachedFile) => Promise<void>
  url: (attachment: AttachedFile, intent: AttachmentUrlIntent) => string
  dispose?: () => void
}

export type AttachmentGroup = 'pdf' | 'image' | 'other'

export function attachmentGroup(file: Pick<AttachedFile, 'contentType'>): AttachmentGroup {
  if (file.contentType === 'application/pdf') return 'pdf'
  if (file.contentType.startsWith('image/')) return 'image'
  return 'other'
}

export function isPreviewableAttachment(file: Pick<AttachedFile, 'contentType'>): boolean {
  return attachmentGroup(file) !== 'other'
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export class AttachmentRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'AttachmentRequestError'
    this.status = status
    this.code = code
  }
}

export interface HttpAttachmentAdapterOptions {
  /** Collection endpoint implementing GET + POST and DELETE /:attachmentId. */
  collectionUrl: string
  /** Resolve the authenticated or signed file URL for preview/download. */
  fileUrl: (attachment: AttachedFile, intent: AttachmentUrlIntent) => string
  fetcher?: typeof fetch
  removeUrl?: (attachment: AttachedFile) => string
}

/**
 * HTTP adapter matching the extracted production route contract:
 * GET `{ attachments }`, POST multipart `{ attachment }`, DELETE by link id.
 */
export function createHttpAttachmentAdapter({
  collectionUrl,
  fileUrl,
  fetcher = fetch,
  removeUrl = (attachment) => `${collectionUrl}/${encodeURIComponent(attachment.attachmentId)}`,
}: HttpAttachmentAdapterOptions): AttachmentAdapter {
  return {
    async list(target, signal) {
      const url = new URL(collectionUrl, 'http://appkit.local')
      url.searchParams.set('targetTable', target.targetTable)
      url.searchParams.set('targetId', target.targetId)
      const response = await fetcher(toRequestUrl(url, collectionUrl), { signal })
      const body = await readJson(response)
      if (!response.ok) throw requestError(response, body, 'Unable to load attachments')
      if (!isRecord(body) || !Array.isArray(body.attachments)) {
        throw new AttachmentRequestError('Attachment response is invalid', response.status)
      }
      return body.attachments as AttachedFile[]
    },
    async upload(target, file) {
      const form = new FormData()
      form.append('file', file)
      form.append('targetTable', target.targetTable)
      form.append('targetId', target.targetId)
      const response = await fetcher(collectionUrl, { method: 'POST', body: form })
      const body = await readJson(response)
      if (!response.ok) throw requestError(response, body, `Unable to attach ${file.name}`)
      if (!isRecord(body) || !isRecord(body.attachment)) {
        throw new AttachmentRequestError('Attachment response is invalid', response.status)
      }
      return body.attachment as unknown as AttachedFile
    },
    async remove(_target, attachment) {
      const response = await fetcher(removeUrl(attachment), { method: 'DELETE' })
      const body = await readJson(response)
      if (!response.ok) throw requestError(response, body, `Unable to remove ${attachment.name}`)
    },
    url: fileUrl,
  }
}

function toRequestUrl(url: URL, original: string): string {
  return /^https?:\/\//.test(original) ? url.toString() : `${url.pathname}${url.search}`
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return null
  return response.json().catch((error: unknown) => {
    throw new AttachmentRequestError(
      error instanceof Error ? error.message : 'Attachment response could not be read',
      response.status,
    )
  })
}

function requestError(response: Response, body: unknown, fallback: string): AttachmentRequestError {
  const record = isRecord(body) ? body : null
  const message = typeof record?.error === 'string' ? record.error : fallback
  const code = typeof record?.code === 'string' ? record.code : undefined
  return new AttachmentRequestError(message, response.status, code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
