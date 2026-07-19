// The delivery input shared by every provider (generalized from beaconhs
// email-render/delivery-input).

export type EmailAttachmentPayload = {
  filename: string
  /** base64-encoded content. */
  content: string
  contentType?: string
}

export type EmailDeliveryInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  attachments?: EmailAttachmentPayload[]
}

export function isValidEmailAddress(value: string): boolean {
  const v = value.trim()
  return v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** Validate + normalize recipients/subject/body before a send. */
export function normalizeEmailDeliveryInput(
  input: EmailDeliveryInput,
  opts: { requireSingleRecipient?: boolean } = {},
): EmailDeliveryInput {
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) throw new Error('Email requires at least one recipient')
  if (opts.requireSingleRecipient && to.length !== 1) {
    throw new Error('Exactly one recipient is required')
  }
  for (const addr of to) {
    if (!isValidEmailAddress(addr)) throw new Error(`Invalid recipient address: ${addr}`)
  }
  if (!input.subject?.trim()) throw new Error('Email requires a subject')
  if (!input.html && !input.text) throw new Error('Email requires an html or text body')
  return { ...input, to }
}
