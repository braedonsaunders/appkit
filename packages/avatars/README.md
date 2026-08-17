# @braedonsaunders/appkit-avatars

A parts library, a composition model, and the composer that arranges them —
plus AI image generation through the shared provider layer.

The doctrine is one image per subject. A person has exactly one **full-body
composition**; a portrait is not a second image but a **viewport** on that
composition. Nothing to keep in sync, nothing to regenerate when a hairstyle
changes.

## Entry points

| Import | Environment | Contents |
| --- | --- | --- |
| `@braedonsaunders/appkit-avatars` | server | Image generation (`generateImages`, `listImageModels`), prompt builders, and a re-export of the composition model. |
| `@braedonsaunders/appkit-avatars/composition` | anywhere | The pure model: types, `sortLayers`, `resolvePartUrl`, `viewportTransform`, `DEFAULT_HEAD_VIEWPORT`. No provider dependencies — safe in a browser bundle. |
| `@braedonsaunders/appkit-avatars/react` | client | `ComposedAvatar` (the renderer) and `AvatarComposer` (the editor). |

Import composition helpers from `/composition` in client code. The root entry
pulls the AI SDK provider factories; types erase at compile time, but values do
not.

## The coordinate model

One stage, **512 × 768 canvas units**, origin top-left, +x right and +y down.
Portrait orientation, because the composition is a standing figure.

A category declares a `frame` (the part's natural box at `scale: 1`) and a
`defaultTransform`. A placement stores `{ x, y, scale, rotation }`: `x`/`y` are
the top-left of that frame, `scale` multiplies it, and `rotation` is degrees
clockwise about the frame's centre.

```ts
box = {
  left:   transform.x,
  top:    transform.y,
  width:  category.frame.width  * transform.scale,
  height: category.frame.height * transform.scale,
}
```

Nothing stored depends on display size — the renderer and the editor both scale
canvas units by a single factor.

## Head framing

`composition.headViewport` is a rectangle in the same canvas units.
`viewportTransform(viewport, frame)` returns the scale and translation that make
that rectangle fill a frame, and `ComposedAvatar variant="head"` applies it. The
composer's **Head framing** tab drags and resizes the rectangle directly, with
everything outside it dimmed.

```tsx
<ComposedAvatar composition={c} parts={parts} categories={categories}
  variant="head" size={32} rounded />          {/* a directory row       */}
<ComposedAvatar … variant="head" size={96} animate="talking" />  {/* a call */}
<ComposedAvatar … variant="full" size={170} animate="idle" />    {/* a scene */}
```

## Why DOM layers, not canvas

The renderer paints absolutely positioned `<img>` elements inside a scaled
stage rather than compositing to a `<canvas>`. Three things follow:

- **Per-layer motion.** `animate="talking"` works the mouth layer independently
  of the figure — impossible once the layers are flattened.
- **Sharp at any size.** The browser rasterizes the source art at the size
  actually shown, so one composition serves a 24px row and a 400px stage.
- **One code path.** What the composer arranges is literally what ships; there
  is no export step that can drift from the editor.

Both `animate` modes honour `prefers-reduced-motion` and fall still.

## Generating parts

`buildPartPrompt` carries the art direction that keeps a library coherent —
isolated single object, transparent background, front-facing, flat colours —
with a matching negative prompt. Parts **must** be alpha-cut: they stack.

```ts
const { prompt } = buildPartPrompt({
  description: 'a short curly hairstyle',
  categoryLabel: 'Hair',
  promptAddition: category.promptAddition,
})
const { images } = await generateImages(aiConfig, { prompt, model, count: 4 })
```

## Provenance

Extracted from the OpenStudio avatar component system: `src/types/avatar.ts`
(categories, layer order, render boxes, selections), `src/lib/avatar/compositor.ts`
(layer sort and scaled placement), `src/lib/avatar/generator.ts` (the asset
prompt discipline), and `src/components/avatar/canvas/*` (the editor —
`AvatarCanvasEditor`, `CanvasWorkspace`, `LayerPanel`, `AssetLibraryPanel`,
`TransformControls`, `useCanvasState`).

Decoupled on the way across: the unlock/rarity economy, Supabase and R2
storage, and the product's API routes. Changed deliberately: a 512×768 portrait
stage instead of 512×512; DOM layers instead of Konva; rotation about the frame
centre instead of the top-left origin; a single `scale` instead of independent
width and height; and the head viewport as part of the document, replacing the
separately stored headshot.
