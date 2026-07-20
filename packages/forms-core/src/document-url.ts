const APPLICATION_ATTACHMENT_URL =
  /^\/api\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\?cap=[A-Za-z0-9_-]{43}$/i

/**
 * Validate the canonical same-origin capability URL returned by an attachment
 * uploader. When an id is supplied, the URL must refer to that exact record.
 */
export function isApplicationAttachmentUrl(value: string, attachmentId?: string): boolean {
  const match = APPLICATION_ATTACHMENT_URL.exec(value)
  return (
    !!match &&
    (attachmentId === undefined || match[1]!.toLowerCase() === attachmentId.toLowerCase())
  )
}

/** Normalize links accepted by the rich-document storage boundary. */
export function normalizeDocumentHref(value: string): string | null {
  const href = value.trim()
  if (!href || href.length > 2_048 || /[\u0000-\u0020\u007f\\]/.test(href)) return null
  if (href.startsWith('/') && !href.startsWith('//')) return href
  if (/^#[A-Za-z][\w:.-]{0,127}$/.test(href)) return href
  if (/^https:\/\//i.test(href)) {
    return /^https:\/\/(?![^/?#]*@)[^\s]+$/i.test(href) ? href : null
  }
  if (/^mailto:/i.test(href)) return /^mailto:[^@\s]+@[^@\s]+$/i.test(href) ? href : null
  if (/^tel:/i.test(href)) return /^tel:\+?[\d(). -]{3,30}$/i.test(href) ? href : null
  return null
}
