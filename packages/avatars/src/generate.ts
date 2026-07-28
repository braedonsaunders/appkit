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

/**
 * FALLBACK catalog only — the authoritative source is `listImageModels`,
 * which queries the provider's live model API with the tenant's key.
 * Providers retire image models without notice (Google's Imagen models, for
 * example, return "no longer available to new users"), so callers should
 * present the live list and reach for this catalog only when the live fetch
 * fails — and it is the caller's decision to fall back, ideally while
 * surfacing the provider's error.
 */
export const IMAGE_MODELS: { id: ImageModelId; name: string; provider: 'openai' | 'google' }[] = [
  { id: 'gpt-image-1', name: 'GPT Image 1', provider: 'openai' },
  { id: 'dall-e-3', name: 'DALL·E 3', provider: 'openai' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Nano Banana)', provider: 'google' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image (Nano Banana 2)', provider: 'google' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (Nano Banana Pro)', provider: 'google' },
]

/** Provider kinds (as named by @appkit/ai) that can generate images. */
export const IMAGE_CAPABLE_PROVIDERS = ['openai', 'google'] as const

export type ImageModelListing = {
  id: ImageModelId
  /** Provider display name, when the provider supplies one. */
  name?: string
}

const LIST_TIMEOUT_MS = 15_000

/**
 * List the image-generation models the tenant's key can actually use, straight
 * from the provider's model API. This is the authoritative list — prefer it
 * over the static {@link IMAGE_MODELS} fallback catalog.
 */
export async function listImageModels(config: ImageAiConfig): Promise<ImageModelListing[]> {
  if (config.provider === 'google') return listGoogleImageModels(config)
  if (config.provider === 'openai') return listOpenAiImageModels(config)
  throw new Error(
    `Provider "${config.provider}" cannot generate images — use one of: ${IMAGE_CAPABLE_PROVIDERS.join(', ')}.`,
  )
}

async function listGoogleImageModels(config: ImageAiConfig): Promise<ImageModelListing[]> {
  const base = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
  const url = `${base}/models?key=${encodeURIComponent(config.apiKey)}&pageSize=1000`
  const payload = await fetchModelList('Google', url, {})
  const models = Array.isArray((payload as { models?: unknown }).models)
    ? ((payload as { models: unknown[] }).models as {
        name?: string
        displayName?: string
        supportedGenerationMethods?: string[]
      }[])
    : []
  const listings: ImageModelListing[] = []
  for (const model of models) {
    if (typeof model?.name !== 'string') continue
    const id = model.name.replace(/^models\//, '')
    const supportsPredict =
      Array.isArray(model.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes('predict')
    const isNativeImageModel = id.includes('image')
    if (!supportsPredict && !isNativeImageModel) continue
    listings.push({ id, ...(model.displayName ? { name: model.displayName } : {}) })
  }
  return listings.sort((a, b) => a.id.localeCompare(b.id))
}

async function listOpenAiImageModels(config: ImageAiConfig): Promise<ImageModelListing[]> {
  const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const payload = await fetchModelList('OpenAI', `${base}/models`, {
    Authorization: `Bearer ${config.apiKey}`,
  })
  const models = Array.isArray((payload as { data?: unknown }).data)
    ? ((payload as { data: unknown[] }).data as { id?: string }[])
    : []
  return models
    .filter((model): model is { id: string } => typeof model?.id === 'string' && /^(gpt-image|dall-e)/.test(model.id))
    .map((model) => ({ id: model.id }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function fetchModelList(
  providerLabel: string,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(
        `${providerLabel} model list request timed out after ${LIST_TIMEOUT_MS / 1000}s.`,
      )
    }
    throw new Error(
      `Could not reach the ${providerLabel} model list API: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (typeof body?.error?.message === 'string') detail = ` — ${body.error.message}`
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new Error(
      `${providerLabel} model list request failed (HTTP ${response.status})${detail}`,
    )
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`${providerLabel} model list API returned an unreadable response.`)
  }
}

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

  // Gemini-native image models reject n>1 — batch with per-image calls there;
  // Imagen and OpenAI models batch natively.
  const geminiNative = config.provider === 'google' && !request.model.startsWith('imagen')
  if (geminiNative) {
    const results = await Promise.all(
      Array.from({ length: count }, () =>
        generateImage({ model, prompt: request.prompt, size: '1024x1024' }),
      ),
    )
    return {
      images: results.flatMap((r) => r.images.map((image) => `data:${image.mediaType};base64,${image.base64}`)),
      model: request.model,
    }
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

/** The shared art direction — one house style across a whole roster. */
const HOUSE_STYLE =
  'flat vector illustration style, warm modern palette, clean simple shapes, soft even lighting, no photorealism, no text, no watermark, no logo, single subject only'

/**
 * A consistent portrait prompt for staff avatars: one flat-illustration
 * head-and-shoulders portrait per subject, uniform style across a roster.
 */
export function buildPortraitPrompt(subject: { description: string; tone?: string[] }): string {
  return `friendly professional head-and-shoulders portrait of ${subject.description}${
    subject.tone?.length ? `, personality: ${subject.tone.join(', ')}` : ''
  }, ${HOUSE_STYLE}, simple solid background, consistent studio-portrait framing, centered, facing forward.`
}

/**
 * The standing full-body companion to the portrait: one character, feet to
 * head, on a fully transparent background so it can be composited into a
 * scene (a lobby, a desk, a room) and scaled by depth.
 */
export function buildFullBodyPrompt(subject: { description: string; tone?: string[] }): string {
  return `full body standing character illustration of ${subject.description}${
    subject.tone?.length ? `, personality: ${subject.tone.join(', ')}` : ''
  }, ${HOUSE_STYLE}, entire body visible from head to feet, front-facing three-quarter view, relaxed natural standing pose, business-casual workwear, centered in frame with even margins, completely transparent background (PNG alpha), no ground, no shadow, no floor line, no background scenery, no cropping of the feet or head.`
}
