import { createHash } from 'node:crypto'

export type DeskFrameIdentity = {
  frameId: string
  changed: boolean
}

export interface DeskFrameDeduplicator {
  observe(data: Uint8Array | string, mediaType?: string): DeskFrameIdentity
  reset(): void
}

/**
 * Exact frame identity for model and recording pipelines. The digest is safe
 * to persist and compare; pixel bytes need not be retained after hashing.
 */
export function createDeskFrameDeduplicator(): DeskFrameDeduplicator {
  let previous: string | null = null
  return {
    observe(data, mediaType = 'image/png') {
      const hash = createHash('sha256')
      hash.update(mediaType)
      hash.update('\0')
      hash.update(typeof data === 'string' ? Buffer.from(data, 'base64') : data)
      const frameId = `sha256:${hash.digest('hex')}`
      const changed = frameId !== previous
      previous = frameId
      return { frameId, changed }
    },
    reset() {
      previous = null
    },
  }
}
