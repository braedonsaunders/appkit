import type { ModelMessage } from 'ai'

export const DEFAULT_VISUAL_CONTEXT_FRAMES = 2

export type VisualContextPruneResult = {
  messages: ModelMessage[]
  prunedFrames: number
  deduplicatedFrames: number
}

type ContentPart = Record<string, unknown> & { type: string }

/**
 * Keep only the newest distinct tool-result images. Tool-call/result structure
 * remains intact, and textual metadata stays available, but a long desktop or
 * browser session no longer resends every historical screenshot on every step.
 * User-supplied image messages are deliberately untouched.
 */
export function pruneVisualToolContext(
  messages: readonly ModelMessage[],
  options: { keepRecent?: number; omittedText?: string } = {},
): VisualContextPruneResult {
  const keepRecent = options.keepRecent ?? DEFAULT_VISUAL_CONTEXT_FRAMES
  if (!Number.isInteger(keepRecent) || keepRecent < 0) {
    throw new Error('keepRecent must be a non-negative integer.')
  }
  const omittedText = options.omittedText ?? '[Earlier visual frame omitted; request a fresh observation if needed.]'
  const seen = new Set<string>()
  let retained = 0
  let prunedFrames = 0
  let deduplicatedFrames = 0
  const copied = [...messages]

  for (let messageIndex = copied.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = copied[messageIndex]
    if (!message || message.role !== 'tool' || !Array.isArray(message.content)) continue
    let messageChanged = false
    const content = [...message.content]
    for (let partIndex = content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = content[partIndex]
      if (!part || part.type !== 'tool-result') continue
      const output = asRecord(part.output)
      if (!output || output.type !== 'content' || !Array.isArray(output.value)) continue
      const visual = output.value.filter(isImagePart)
      if (visual.length === 0) continue

      const fingerprints = visual.map(frameFingerprint)
      const duplicate = fingerprints.every((fingerprint) => seen.has(fingerprint))
      const keep = !duplicate && retained < keepRecent
      if (keep) {
        retained += 1
        for (const fingerprint of fingerprints) seen.add(fingerprint)
        continue
      }

      if (duplicate) deduplicatedFrames += visual.length
      else prunedFrames += visual.length
      const value = output.value.filter((entry) => !isImagePart(entry)) as unknown[]
      if (!value.some((entry) => asRecord(entry)?.type === 'text')) {
        value.push({ type: 'text', text: omittedText })
      } else {
        value.push({ type: 'text', text: omittedText })
      }
      content[partIndex] = {
        ...part,
        output: { ...output, value },
      } as typeof part
      messageChanged = true
    }
    if (messageChanged) copied[messageIndex] = { ...message, content }
  }

  return { messages: copied, prunedFrames, deduplicatedFrames }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isImagePart(value: unknown): value is ContentPart {
  const record = asRecord(value)
  return Boolean(
    record
    && (record.type === 'image-data' || record.type === 'image')
    && typeof record.mediaType === 'string'
    && (typeof record.data === 'string' || record.data instanceof Uint8Array),
  )
}

function frameFingerprint(frame: ContentPart): string {
  const data = frame.data
  if (typeof data === 'string') return `${String(frame.mediaType)}:${data}`
  return `${String(frame.mediaType)}:${Buffer.from(data as Uint8Array).toString('base64')}`
}
