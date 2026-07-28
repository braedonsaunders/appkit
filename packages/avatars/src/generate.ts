// Avatar/image generation routed through the same provider layer as
// @appkit/ai: consumers pass their tenant-resolved AiConfig (provider kind +
// API key), and models are constructed with the AI SDK provider factories —
// one connection layer for every AI call, no side-channel providers.

import { generateImage } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

/** Structurally identical to @appkit/ai's AiConfig — pass it straight in. */
export type ImageAiConfig = {
  provider: string
  apiKey: string
  baseUrl?: string | null
}

export type ImageModelId = string

export const IMAGE_MODELS: { id: ImageModelId; name: string; provider: 'openai' | 'google' }[] = [
  { id: 'gpt-image-1', name: 'GPT Image 1', provider: 'openai' },
  { id: 'dall-e-3', name: 'DALL·E 3', provider: 'openai' },
  { id: 'imagen-3.0-generate-002', name: 'Imagen 3', provider: 'google' },
  { id: 'imagen-4.0-generate-001', name: 'Imagen 4', provider: 'google' },
]

/** Provider kinds (as named by @appkit/ai) that can generate images. */
export const IMAGE_CAPABLE_PROVIDERS = ['openai', 'google'] as const

export type GenerateImagesRequest = {
  prompt: string
  model: ImageModelId
  count?: number
}

export type GenerateImagesResult = {
  /** data: URIs (base64). */
  images: string[]
  model: ImageModelId
}

export async function generateImages(
  config: ImageAiConfig,
  request: GenerateImagesRequest,
): Promise<GenerateImagesResult> {
  const count = request.count ?? 4

  let model
  if (config.provider === 'openai') {
    model = createOpenAI({ apiKey: config.apiKey, ...(config.baseUrl ? { baseURL: config.baseUrl } : {}) }).image(
      request.model,
    )
  } else if (config.provider === 'google') {
    model = createGoogleGenerativeAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    }).image(request.model)
  } else {
    throw new Error(
      `Provider "${config.provider}" cannot generate images — use one of: ${IMAGE_CAPABLE_PROVIDERS.join(', ')}.`,
    )
  }

  const result = await generateImage({
    model,
    prompt: request.prompt,
    n: count,
    size: '1024x1024',
  })
  return {
    images: result.images.map((image) => `data:${image.mediaType};base64,${image.base64}`),
    model: request.model,
  }
}

/**
 * A consistent portrait prompt for staff avatars: one flat-illustration
 * head-and-shoulders portrait per subject, uniform style across a roster.
 */
export function buildPortraitPrompt(subject: { description: string; tone?: string[] }): string {
  return `friendly professional head-and-shoulders portrait of ${subject.description}${
    subject.tone?.length ? `, personality: ${subject.tone.join(', ')}` : ''
  }, flat vector illustration style, warm modern palette, simple solid background, clean shapes, consistent studio-portrait framing, centered, facing forward. Never photorealistic; no text, no watermark, no multiple people, no busy background.`
}
