// Art direction for generating library parts.
//
// Parts are composited as DOM layers, so they must arrive **alpha-cut**. Asking
// for transparency directly removes an image-processing step; the
// white-background wording remains a fallback for models that cannot emit
// alpha.
//
// Pure strings and string-building — no provider, no network. Safe to import
// from a client bundle.

/**
 * The house style every part shares. A parts library only reads as one
 * character if every asset was drawn to the same sentence.
 */
export const PART_STYLE_SUFFIX =
  'isolated single object, fully transparent background (PNG alpha, no backdrop of any kind), ' +
  'perfectly centered in frame, front-facing symmetric view, no shadows, no gradients, ' +
  'flat solid colors, clean vector-style illustration, 2D character asset sprite, ' +
  'uniform consistent art style, consistent scale with other parts of the same set, ' +
  'crisp clean cut-out edges, professional character art quality'

/** What a part must never contain. */
export const PART_NEGATIVE_PROMPT =
  'photorealistic, photograph, photo, realistic, hyperrealistic, 3D render, 3D, CGI, ' +
  'background scenery, complex background, colored background, gradient background, ' +
  'textured background, white background, checkerboard background, ' +
  'shadows, drop shadow, cast shadow, ambient occlusion, multiple objects, additional items, ' +
  'side view, three-quarter view, angled view, perspective, depth of field, bokeh, ' +
  'film grain, noise, blur, blurry, watermark, signature, text, logo, frame, border, ' +
  'vignette, lens flare, glow, reflection, glossy highlights, ' +
  'cropped, cut off, partial object, off-center'

export type PartPromptRequest = {
  /** What the operator asked for: "short curly red hair". */
  description: string
  /** The slot it fills, for the model's benefit: "Hair". */
  categoryLabel: string
  /** The category's own art direction — {@link AvatarPartCategory.promptAddition}. */
  promptAddition?: string
  /** Extra house style shared across the whole library. */
  styleSuffix?: string
}

/**
 * Build the full prompt for one library part: description, category rules,
 * shared style, then the negative prompt folded in for models that take only
 * one string.
 */
export function buildPartPrompt(request: PartPromptRequest): { prompt: string; negativePrompt: string } {
  const segments = [
    `${request.categoryLabel.toLowerCase()} asset for a character avatar: ${request.description.trim()}`,
  ]
  if (request.promptAddition?.trim()) segments.push(request.promptAddition.trim())
  if (request.styleSuffix?.trim()) segments.push(request.styleSuffix.trim())
  segments.push(PART_STYLE_SUFFIX)

  const prompt = segments.join(', ')
  return {
    prompt: `${prompt}.\n\nDo NOT include any of the following: ${PART_NEGATIVE_PROMPT}.`,
    negativePrompt: PART_NEGATIVE_PROMPT,
  }
}
