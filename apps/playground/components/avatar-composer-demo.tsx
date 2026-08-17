'use client'

import * as React from 'react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@braedonsaunders/ui'
import { AvatarComposer, ComposedAvatar } from '@braedonsaunders/avatars/react'
import {
  DEFAULT_HEAD_VIEWPORT,
  type AvatarComposition,
  type AvatarPart,
  type AvatarPartCategory,
} from '@braedonsaunders/avatars/composition'

/**
 * A working proof of the composition surface.
 *
 * The parts are inline SVG data URIs generated here — deliberately crude
 * shapes, not artwork. An application fills this library with real alpha-cut
 * PNGs; the demo only needs assets that stack, recolour, and crop, so the
 * placement model, the head viewport, and the two render variants can be
 * exercised without shipping binary fixtures or calling an image provider.
 */

function svg(width: number, height: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  )}`
}

const SKIN = '#e8bb96'

const CATEGORIES: AvatarPartCategory[] = [
  {
    id: 'body',
    label: 'Body',
    layerOrder: 10,
    required: true,
    frame: { width: 260, height: 620 },
    defaultTransform: { x: 126, y: 140, scale: 1, rotation: 0 },
    promptAddition: 'full standing body from the neck down, arms relaxed at the sides',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    layerOrder: 20,
    frame: { width: 260, height: 420 },
    defaultTransform: { x: 126, y: 210, scale: 1, rotation: 0 },
    promptAddition: 'clothing only, worn shape with an empty neck and empty sleeves',
  },
  {
    id: 'head',
    label: 'Head',
    layerOrder: 30,
    required: true,
    frame: { width: 180, height: 200 },
    defaultTransform: { x: 166, y: 40, scale: 1, rotation: 0 },
    promptAddition: 'bare head and neck, no hair, no features',
  },
  {
    id: 'eyes',
    label: 'Eyes',
    layerOrder: 40,
    frame: { width: 120, height: 40 },
    defaultTransform: { x: 196, y: 108, scale: 1, rotation: 0 },
  },
  {
    id: 'mouth',
    label: 'Mouth',
    layerOrder: 50,
    frame: { width: 70, height: 32 },
    defaultTransform: { x: 221, y: 158, scale: 1, rotation: 0 },
  },
  {
    id: 'hair',
    label: 'Hair',
    layerOrder: 60,
    supportsColorVariants: true,
    frame: { width: 200, height: 140 },
    defaultTransform: { x: 156, y: 28, scale: 1, rotation: 0 },
    promptAddition: 'hairstyle only, hollow underside so it sits over a head',
  },
]

const PARTS: AvatarPart[] = [
  {
    id: 'body-standing',
    categoryId: 'body',
    name: 'Standing',
    imageUrl: svg(
      260,
      620,
      `<rect x="98" y="0" width="64" height="70" rx="26" fill="${SKIN}"/>` +
        `<rect x="52" y="56" width="156" height="250" rx="54" fill="#4b5f7a"/>` +
        `<rect x="70" y="296" width="52" height="300" rx="24" fill="#33445c"/>` +
        `<rect x="138" y="296" width="52" height="300" rx="24" fill="#33445c"/>` +
        `<rect x="20" y="90" width="42" height="190" rx="20" fill="${SKIN}"/>` +
        `<rect x="198" y="90" width="42" height="190" rx="20" fill="${SKIN}"/>`,
    ),
    tags: ['neutral'],
  },
  {
    id: 'outfit-apron',
    categoryId: 'outfit',
    name: 'Work apron',
    imageUrl: svg(
      260,
      420,
      `<path d="M78 6 L182 6 L206 92 L206 300 Q130 330 54 300 L54 92 Z" fill="#8a5a3b"/>` +
        `<rect x="104" y="150" width="52" height="46" rx="8" fill="#6f452c"/>`,
    ),
    tags: ['workwear'],
  },
  {
    id: 'outfit-blazer',
    categoryId: 'outfit',
    name: 'Blazer',
    imageUrl: svg(
      260,
      420,
      `<path d="M60 10 L200 10 L214 300 L46 300 Z" fill="#2f3b52"/>` +
        `<path d="M118 10 L142 10 L136 160 L124 160 Z" fill="#f3f4f6"/>`,
    ),
    tags: ['formal'],
  },
  {
    id: 'head-round',
    categoryId: 'head',
    name: 'Round',
    imageUrl: svg(180, 200, `<ellipse cx="90" cy="86" rx="72" ry="82" fill="${SKIN}"/><rect x="66" y="150" width="48" height="46" rx="16" fill="${SKIN}"/>`),
  },
  {
    id: 'eyes-open',
    categoryId: 'eyes',
    name: 'Open',
    imageUrl: svg(
      120,
      40,
      `<ellipse cx="28" cy="20" rx="13" ry="14" fill="#ffffff"/><circle cx="28" cy="21" r="7" fill="#2b2b2b"/>` +
        `<ellipse cx="92" cy="20" rx="13" ry="14" fill="#ffffff"/><circle cx="92" cy="21" r="7" fill="#2b2b2b"/>`,
    ),
  },
  {
    id: 'mouth-smile',
    categoryId: 'mouth',
    name: 'Smile',
    imageUrl: svg(70, 32, `<path d="M6 6 Q35 34 64 6 Z" fill="#a63d3d"/>`),
  },
  {
    id: 'hair-crop',
    categoryId: 'hair',
    name: 'Short crop',
    imageUrl: svg(200, 140, `<path d="M18 116 Q10 8 100 8 Q190 8 182 116 Q150 62 100 62 Q50 62 18 116 Z" fill="#33291f"/>`),
    colorVariants: {
      black: svg(200, 140, `<path d="M18 116 Q10 8 100 8 Q190 8 182 116 Q150 62 100 62 Q50 62 18 116 Z" fill="#171412"/>`),
      auburn: svg(200, 140, `<path d="M18 116 Q10 8 100 8 Q190 8 182 116 Q150 62 100 62 Q50 62 18 116 Z" fill="#8a3c22"/>`),
      ash: svg(200, 140, `<path d="M18 116 Q10 8 100 8 Q190 8 182 116 Q150 62 100 62 Q50 62 18 116 Z" fill="#9aa0a6"/>`),
    },
    tags: ['short'],
  },
  {
    id: 'hair-long',
    categoryId: 'hair',
    name: 'Long',
    imageUrl: svg(200, 140, `<path d="M12 138 Q4 4 100 4 Q196 4 188 138 Q168 56 100 56 Q32 56 12 138 Z" fill="#4a3524"/>`),
    colorVariants: {
      black: svg(200, 140, `<path d="M12 138 Q4 4 100 4 Q196 4 188 138 Q168 56 100 56 Q32 56 12 138 Z" fill="#171412"/>`),
      auburn: svg(200, 140, `<path d="M12 138 Q4 4 100 4 Q196 4 188 138 Q168 56 100 56 Q32 56 12 138 Z" fill="#8a3c22"/>`),
      ash: svg(200, 140, `<path d="M12 138 Q4 4 100 4 Q196 4 188 138 Q168 56 100 56 Q32 56 12 138 Z" fill="#9aa0a6"/>`),
    },
    tags: ['long'],
  },
]

const INITIAL: AvatarComposition = {
  version: 1,
  headViewport: DEFAULT_HEAD_VIEWPORT,
  parts: Object.fromEntries(
    ['body', 'outfit', 'head', 'eyes', 'mouth', 'hair'].map((categoryId) => {
      const category = CATEGORIES.find((c) => c.id === categoryId)!
      const part = PARTS.find((p) => p.categoryId === categoryId)!
      return [categoryId, { partId: part.id, transform: { ...category.defaultTransform } }]
    }),
  ),
}

export function AvatarComposerDemo() {
  const [composition, setComposition] = React.useState<AvatarComposition>(INITIAL)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>One composition, every surface</CardTitle>
          <CardDescription>
            A subject has exactly one full-body composition. The portrait is that composition cropped to its
            head viewport — no second image is stored, generated, or kept in sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-8">
          <Surface label="Directory row" caption="head · 32px">
            <ComposedAvatar
              composition={composition}
              parts={PARTS}
              categories={CATEGORIES}
              variant="head"
              size={32}
              rounded
              name="Demo"
            />
          </Surface>
          <Surface label="Record header" caption="head · 72px">
            <ComposedAvatar
              composition={composition}
              parts={PARTS}
              categories={CATEGORIES}
              variant="head"
              size={72}
              rounded
              name="Demo"
            />
          </Surface>
          <Surface label="On a call" caption="head · talking">
            <ComposedAvatar
              composition={composition}
              parts={PARTS}
              categories={CATEGORIES}
              variant="head"
              size={96}
              rounded
              animate="talking"
              name="Demo"
            />
          </Surface>
          <Surface label="In a scene" caption="full · idle">
            <ComposedAvatar
              composition={composition}
              parts={PARTS}
              categories={CATEGORIES}
              variant="full"
              size={110}
              animate="idle"
              name="Demo"
            />
          </Surface>
          <Badge variant="secondary">512 × 768 canvas units</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The composer</CardTitle>
          <CardDescription>
            Library on the left, stage in the middle, layer stack and transform on the right. Drag to move,
            corners to scale, the top handle to rotate; switch to Head framing to set the portrait crop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarComposer
            composition={INITIAL}
            parts={PARTS}
            categories={CATEGORIES}
            onChange={setComposition}
            subjectName="Demo"
            stageWidth={300}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Surface({
  label,
  caption,
  children,
}: {
  label: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <div className="text-center">
        <p className="text-xs font-medium text-fg">{label}</p>
        <p className="text-xs text-fg-muted">{caption}</p>
      </div>
    </div>
  )
}
