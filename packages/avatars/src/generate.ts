// AI image generation over Cloudflare Workers AI, Replicate, and Google
// Gemini — extracted from the OpenStudio production generator. Credentials are
// injected per call (tenant-configured by the consuming app), never read from
// env, so one process can serve many tenants safely.

export type ImageModelId =
  | 'cf-sdxl-lightning'
  | 'cf-sdxl-base'
  | 'cf-flux-schnell'
  | 'replicate-flux-schnell'
  | 'replicate-sdxl'
  | 'gemini-nano-banana'
  | 'gemini-nano-banana-pro'

export const IMAGE_MODELS: { id: ImageModelId; name: string; provider: 'cloudflare' | 'replicate' | 'gemini' }[] = [
  { id: 'gemini-nano-banana', name: 'Gemini 2.5 Flash Image', provider: 'gemini' },
  { id: 'gemini-nano-banana-pro', name: 'Gemini 3 Pro Image', provider: 'gemini' },
  { id: 'cf-flux-schnell', name: 'FLUX Schnell (Cloudflare)', provider: 'cloudflare' },
  { id: 'cf-sdxl-lightning', name: 'SDXL Lightning (Cloudflare)', provider: 'cloudflare' },
  { id: 'cf-sdxl-base', name: 'SDXL Base (Cloudflare)', provider: 'cloudflare' },
  { id: 'replicate-flux-schnell', name: 'FLUX Schnell (Replicate)', provider: 'replicate' },
  { id: 'replicate-sdxl', name: 'SDXL (Replicate)', provider: 'replicate' },
]

export type ImageProviderConfig =
  | { provider: 'cloudflare'; accountId: string; apiToken: string }
  | { provider: 'replicate'; apiToken: string }
  | { provider: 'gemini'; apiKey: string }

export type GenerateImagesRequest = {
  prompt: string
  negativePrompt?: string
  model: ImageModelId
  count?: number
  seed?: number
}

export type GenerateImagesResult = {
  /** data: URIs (base64 PNG) or https URLs, provider-dependent. */
  images: string[]
  seed: number
  model: ImageModelId
}

export async function generateImages(
  config: ImageProviderConfig,
  request: GenerateImagesRequest,
): Promise<GenerateImagesResult> {
  const model = request.model
  if (model.startsWith('cf-')) {
    if (config.provider !== 'cloudflare') throw new Error(`Model ${model} requires the cloudflare provider.`)
    return generateWithCloudflare(config, request, model)
  }
  if (model.startsWith('replicate-')) {
    if (config.provider !== 'replicate') throw new Error(`Model ${model} requires the replicate provider.`)
    return generateWithReplicate(config, request, model)
  }
  if (config.provider !== 'gemini') throw new Error(`Model ${model} requires the gemini provider.`)
  return generateWithGemini(config, request, model)
}

async function generateWithCloudflare(
  config: Extract<ImageProviderConfig, { provider: 'cloudflare' }>,
  request: GenerateImagesRequest,
  model: ImageModelId,
): Promise<GenerateImagesResult> {
  const modelMap: Partial<Record<ImageModelId, string>> = {
    'cf-sdxl-lightning': '@cf/bytedance/stable-diffusion-xl-lightning',
    'cf-sdxl-base': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    'cf-flux-schnell': '@cf/black-forest-labs/flux-1-schnell',
  }
  const cfModel = modelMap[model]
  if (!cfModel) throw new Error(`Unknown Cloudflare model: ${model}`)

  const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
  const count = request.count ?? 4
  const prompt = request.negativePrompt ? `${request.prompt}. Avoid: ${request.negativePrompt}` : request.prompt

  const images = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${cfModel}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            num_steps: model === 'cf-sdxl-lightning' ? 4 : 20,
            guidance: 7.5,
            seed: seed + i,
            width: 1024,
            height: 1024,
          }),
        },
      )
      if (!response.ok) throw new Error(`Cloudflare AI error: ${await response.text()}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('image/')) {
        const buffer = await response.arrayBuffer()
        return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`
      }
      const result = (await response.json()) as { result?: { image?: string }; success?: boolean; errors?: string[] }
      if (!result.success || !result.result?.image) {
        throw new Error(`Cloudflare AI error: ${result.errors?.join(', ') ?? 'No image in response'}`)
      }
      return `data:image/png;base64,${result.result.image}`
    }),
  )
  return { images, seed, model }
}

async function generateWithReplicate(
  config: Extract<ImageProviderConfig, { provider: 'replicate' }>,
  request: GenerateImagesRequest,
  model: ImageModelId,
): Promise<GenerateImagesResult> {
  const modelVersions: Partial<Record<ImageModelId, string>> = {
    'replicate-flux-schnell': 'black-forest-labs/flux-schnell',
    'replicate-sdxl': 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  }
  const modelId = modelVersions[model]
  if (!modelId) throw new Error(`Unknown Replicate model: ${model}`)

  const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
  const input: Record<string, unknown> =
    model === 'replicate-flux-schnell'
      ? {
          prompt: request.negativePrompt ? `${request.prompt}. Avoid: ${request.negativePrompt}` : request.prompt,
          num_outputs: request.count ?? 4,
          aspect_ratio: '1:1',
          output_format: 'png',
          output_quality: 90,
          seed,
        }
      : {
          prompt: request.prompt,
          negative_prompt: request.negativePrompt ?? 'blurry, low quality, distorted',
          num_outputs: request.count ?? 4,
          width: 1024,
          height: 1024,
          scheduler: 'K_EULER',
          num_inference_steps: 25,
          guidance_scale: 7.5,
          seed,
        }

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: modelId.includes(':') ? modelId.split(':')[1] : undefined,
      model: modelId.includes(':') ? undefined : modelId,
      input,
    }),
  })
  if (!response.ok) throw new Error(`Replicate API error: ${await response.text()}`)

  let result = (await response.json()) as { id: string; status: string; output?: unknown; error?: string }
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
      headers: { Authorization: `Bearer ${config.apiToken}` },
    })
    if (!poll.ok) throw new Error('Failed to poll Replicate prediction status')
    result = (await poll.json()) as typeof result
  }
  if (result.status === 'failed') throw new Error(`Generation failed: ${result.error ?? 'Unknown error'}`)
  const output = Array.isArray(result.output) ? result.output : [result.output]
  return { images: output.filter((url): url is string => typeof url === 'string'), seed, model }
}

async function generateWithGemini(
  config: Extract<ImageProviderConfig, { provider: 'gemini' }>,
  request: GenerateImagesRequest,
  model: ImageModelId,
): Promise<GenerateImagesResult> {
  const modelMap: Partial<Record<ImageModelId, string>> = {
    'gemini-nano-banana': 'gemini-2.5-flash-image',
    'gemini-nano-banana-pro': 'gemini-3-pro-image-preview',
  }
  const geminiModel = modelMap[model]
  if (!geminiModel) throw new Error(`Unknown Gemini model: ${model}`)

  const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
  const count = request.count ?? 4
  const prompt = request.negativePrompt
    ? `${request.prompt}\n\nIMPORTANT: Do NOT include any of the following: ${request.negativePrompt}`
    : request.prompt

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.apiKey}`
  const images: string[] = []
  for (let i = 0; i < count; i++) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Generate an image: ${prompt}\n\nThis should be a square 1:1 aspect ratio image. Variation seed: ${seed + i}` },
            ],
          },
        ],
        generationConfig: { responseModalities: ['image', 'text'], temperature: 1.0 },
      }),
    })
    if (!response.ok) continue
    const result = (await response.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[]
      error?: { message: string }
    }
    if (result.error) continue
    for (const part of result.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`)
    }
  }
  if (images.length === 0) throw new Error('Gemini returned no images')
  return { images, seed, model }
}

/**
 * A consistent portrait prompt for staff avatars: one flat-illustration
 * head-and-shoulders portrait per subject, uniform style across a roster.
 */
export function buildPortraitPrompt(subject: {
  description: string
  tone?: string[]
}): { prompt: string; negativePrompt: string } {
  return {
    prompt: `friendly professional head-and-shoulders portrait of ${subject.description}${subject.tone?.length ? `, personality: ${subject.tone.join(', ')}` : ''}, flat vector illustration style, warm modern palette, simple solid background, clean shapes, consistent studio-portrait framing, centered, facing forward`,
    negativePrompt:
      'photorealistic, photograph, 3D render, text, watermark, logo, multiple people, full body, hands, busy background, harsh shadows, gradients, uncanny features',
  }
}
