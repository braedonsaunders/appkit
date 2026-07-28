// The avatar composition model — a parts library placed on one full-body
// stage, and the head crop that derives every portrait from it.
//
// Extracted from the OpenStudio avatar component system (`src/types/avatar.ts`,
// `src/lib/avatar/compositor.ts`, `src/components/avatar/canvas/*`) and
// generalized: no unlock rules, no rarity economy, no product storage. What
// remains is the part library, the per-layer transform, the layer order, and
// the head viewport.
//
// ## The coordinate model
//
// One canvas, {@link CANVAS_WIDTH} × {@link CANVAS_HEIGHT} **canvas units**,
// origin at the top-left, +x right and +y down. OpenStudio composed on a
// square 512×512 stage, which cannot hold a standing figure without wasting
// half the frame on empty margin; a portrait 512×768 stage fits one head-to-
// feet character with the same 512-unit horizontal vocabulary, so ported
// horizontal offsets carry over unchanged.
//
// There is exactly **one** composition per subject — the full body. A headshot
// is not a second image: it is {@link AvatarComposition.headViewport}, a
// rectangle in the same canvas units, and rendering a portrait means scaling
// and translating the one composition so that rectangle fills the frame.

/** Full-body stage width, in canvas units. */
export const CANVAS_WIDTH = 512
/** Full-body stage height, in canvas units. */
export const CANVAS_HEIGHT = 768

/**
 * Where one part sits on the stage.
 *
 * `x`/`y` are the **top-left** of the part's frame (the category's
 * {@link AvatarPartCategory.frame}) in canvas units — the same anchor
 * OpenStudio's `renderX`/`renderY` used. `scale` multiplies that frame, and
 * `rotation` is degrees clockwise **about the frame's centre**.
 *
 * (OpenStudio rotated about the top-left origin, inherited from Konva's node
 * model, which swings a part away from the pointer as it turns. Rotating about
 * the centre is the same data with the pivot moved to where a person expects
 * it; nothing else about the transform changed.)
 */
export type AvatarPartTransform = {
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * A slot on the figure. Categories are the app's vocabulary — body, hair,
 * outfit — and they carry the layer order and the placement a freshly added
 * part starts from, so a library drops onto the stage already assembled.
 */
export type AvatarPartCategory = {
  id: string
  label: string
  /** Lower paints first (behind). Ported from OpenStudio's `layerOrder`. */
  layerOrder: number
  /** A composition without this category is incomplete. */
  required?: boolean
  /** Whether parts in this category ship recoloured variants. */
  supportsColorVariants?: boolean
  /** The part's natural box in canvas units at `scale: 1`. */
  frame: { width: number; height: number }
  /** Where a newly placed part of this category lands. */
  defaultTransform: AvatarPartTransform
  /**
   * Category-specific art direction appended to the generation prompt —
   * OpenStudio's `promptAddition`, kept because a library is only as coherent
   * as the sentence that produced it.
   */
  promptAddition?: string
}

/** One drawable asset in the library. */
export type AvatarPart = {
  id: string
  categoryId: string
  name: string
  /** The base artwork. Alpha-cut PNG — parts stack, so they must be cut out. */
  imageUrl: string
  /** Recoloured takes, keyed by variant name (`{ black: url, blonde: url }`). */
  colorVariants?: Record<string, string>
  tags?: string[]
}

/** A part placed on the stage. */
export type AvatarPartPlacement = {
  partId: string
  colorVariant?: string
  transform: AvatarPartTransform
  /** Hidden layers stay in the composition but are not painted. */
  hidden?: boolean
  /**
   * Paint order override. Categories carry the default order; a composition
   * only stores this when the operator has reordered layers by hand.
   */
  layerOrder?: number
  /** 0–1. Defaults to fully opaque. */
  opacity?: number
}

/**
 * The head crop, in canvas units, on the same stage as the parts. Rendering a
 * portrait scales and translates the composition until this rectangle fills
 * the frame — there is no second image to keep in sync.
 */
export type AvatarHeadViewport = { x: number; y: number; width: number; height: number }

/**
 * One subject's avatar: which part fills each category, where each sits, and
 * how to crop in on the face.
 */
export type AvatarComposition = {
  /** Schema version, so stored compositions can be migrated in place. */
  version: 1
  /** Keyed by category id — one part per category, as OpenStudio's selections were. */
  parts: Record<string, AvatarPartPlacement>
  headViewport: AvatarHeadViewport
}

/**
 * A head-and-shoulders crop for a figure standing on the 512×768 stage: a
 * square roughly the top fifth of the frame, centred. Templates and the
 * composer both start here and adjust.
 */
export const DEFAULT_HEAD_VIEWPORT: AvatarHeadViewport = { x: 156, y: 32, width: 200, height: 200 }

/** An empty composition — no parts placed, default head framing. */
export function createEmptyComposition(
  headViewport: AvatarHeadViewport = DEFAULT_HEAD_VIEWPORT,
): AvatarComposition {
  return { version: 1, parts: {}, headViewport: { ...headViewport } }
}

/** One resolved layer, ready to paint. */
export type AvatarLayer = {
  categoryId: string
  category: AvatarPartCategory
  part: AvatarPart
  placement: AvatarPartPlacement
  /** The resolved artwork URL, honouring the selected colour variant. */
  url: string
  /** Effective paint order — the placement override, else the category's. */
  order: number
  /** The part's painted box in canvas units, before rotation. */
  box: { left: number; top: number; width: number; height: number }
  opacity: number
}

/**
 * Resolve a composition into back-to-front paint order.
 *
 * Ported from OpenStudio's compositor, which sorted the categories by
 * `layerOrder` and drew each selection at the category's fixed render box.
 * Here the placement carries its own transform, so the box is the category
 * frame scaled by the placement — free placement rather than fixed slots —
 * and the order may be overridden per layer.
 *
 * Categories and parts that no longer exist are skipped rather than thrown on:
 * a library is editable, and a person's saved composition must survive a part
 * being retired.
 */
export function sortLayers(
  composition: AvatarComposition,
  parts: readonly AvatarPart[],
  categories: readonly AvatarPartCategory[],
  options?: { includeHidden?: boolean },
): AvatarLayer[] {
  const partsById = new Map(parts.map((part) => [part.id, part]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const layers: AvatarLayer[] = []

  for (const [categoryId, placement] of Object.entries(composition.parts)) {
    if (placement.hidden && !options?.includeHidden) continue
    const category = categoriesById.get(categoryId)
    const part = partsById.get(placement.partId)
    if (!category || !part) continue
    layers.push({
      categoryId,
      category,
      part,
      placement,
      url: resolvePartUrl(part, placement.colorVariant),
      order: placement.layerOrder ?? category.layerOrder,
      box: {
        left: placement.transform.x,
        top: placement.transform.y,
        width: category.frame.width * placement.transform.scale,
        height: category.frame.height * placement.transform.scale,
      },
      opacity: placement.opacity ?? 1,
    })
  }

  return layers.sort((a, b) => a.order - b.order || a.categoryId.localeCompare(b.categoryId))
}

/** The artwork for a part, preferring the requested colour variant. */
export function resolvePartUrl(part: AvatarPart, colorVariant?: string): string {
  if (colorVariant) {
    const variant = part.colorVariants?.[colorVariant]
    if (variant) return variant
  }
  return part.imageUrl
}

/** Place a part in its category, keeping any transform already set there. */
export function placePart(
  composition: AvatarComposition,
  part: AvatarPart,
  category: AvatarPartCategory,
): AvatarComposition {
  const existing = composition.parts[category.id]
  return {
    ...composition,
    parts: {
      ...composition.parts,
      [category.id]: {
        partId: part.id,
        transform: existing?.transform ?? { ...category.defaultTransform },
        ...(existing?.colorVariant ? { colorVariant: existing.colorVariant } : {}),
        ...(existing?.layerOrder !== undefined ? { layerOrder: existing.layerOrder } : {}),
        ...(existing?.opacity !== undefined ? { opacity: existing.opacity } : {}),
      },
    },
  }
}

/** Remove a category's part from the composition. */
export function removePart(composition: AvatarComposition, categoryId: string): AvatarComposition {
  if (!composition.parts[categoryId]) return composition
  const parts = { ...composition.parts }
  delete parts[categoryId]
  return { ...composition, parts }
}

/**
 * Which required categories are still empty. A composition can be saved
 * incomplete — half a figure is a legitimate work in progress — but the
 * composer says so.
 */
export function missingRequiredCategories(
  composition: AvatarComposition,
  categories: readonly AvatarPartCategory[],
): AvatarPartCategory[] {
  return categories.filter((category) => category.required && !composition.parts[category.id])
}

/**
 * The transform that makes a rectangle of the stage fill a frame.
 *
 * This is the whole headshot mechanism: pass {@link AvatarComposition.headViewport}
 * and the frame size, and the composition — rendered at its natural
 * {@link CANVAS_WIDTH}×{@link CANVAS_HEIGHT} — lands cropped to the head.
 * `cover` (the default) scales until the shorter viewport axis fills the
 * frame, so a portrait never shows empty bars; `contain` guarantees the whole
 * viewport is visible.
 */
export function viewportTransform(
  viewport: AvatarHeadViewport,
  frame: { width: number; height: number },
  fit: 'cover' | 'contain' = 'cover',
): { scale: number; translateX: number; translateY: number } {
  const byWidth = frame.width / Math.max(1, viewport.width)
  const byHeight = frame.height / Math.max(1, viewport.height)
  const scale = fit === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight)
  return {
    scale,
    translateX: frame.width / 2 - scale * (viewport.x + viewport.width / 2),
    translateY: frame.height / 2 - scale * (viewport.y + viewport.height / 2),
  }
}

/** Smallest head crop, in canvas units — below this the face is unreadable. */
export const MIN_HEAD_VIEWPORT = 40

export function clampHeadViewport(viewport: AvatarHeadViewport): AvatarHeadViewport {
  // The crop's aspect ratio is fixed — it is the shape every portrait in the
  // app renders at — so clamping scales both axes by the same factor. Clamping
  // them independently would let a frame dragged past an edge come back
  // stretched, and the face would then render distorted everywhere it appears.
  const ratio = viewport.height > 0 ? viewport.width / viewport.height : 1
  let height = Math.max(MIN_HEAD_VIEWPORT, viewport.height)
  let width = height * ratio
  const shrink = Math.min(1, CANVAS_WIDTH / width, CANVAS_HEIGHT / height)
  width *= shrink
  height *= shrink
  return {
    width,
    height,
    x: Math.min(CANVAS_WIDTH - width, Math.max(0, viewport.x)),
    y: Math.min(CANVAS_HEIGHT - height, Math.max(0, viewport.y)),
  }
}

