'use client'

import * as React from 'react'
import { cn, useElementSize } from '@braedonsaunders/ui'
import {
  DEFAULT_WALKING_CONFIG,
  LOBBY_GROUND,
  type SceneCharacter,
  type SceneGroundConfig,
  type WalkingConfig,
} from './config'
import { WalkingCharacter } from './walking-character'

export type CharacterSceneProps = {
  characters: SceneCharacter[]
  ground?: SceneGroundConfig
  config?: Partial<WalkingConfig>
  /** Rendered above the ground, inside the stage — cards, headings, actions. */
  children?: React.ReactNode
  /**
   * A painted stage — trees, fire, skyline — rendered over the gradients and
   * under every character (see `scene-art.tsx`). Characters always walk in
   * front of the art, exactly as OpenStudio layered its homepage world.
   */
  art?: React.ReactNode
  /** Keep characters out of the area the overlay content occupies. */
  contentZone?: { minX: number; maxX: number; minY: number; maxY: number }
  onSelect?: (id: string) => void
  baseCharacterSize?: number
  className?: string
  /** Stage height; the scene is purely decorative below its content. */
  height?: number | string
}

/**
 * A stage where characters live: a backdrop, a receding floor, and any number
 * of characters that walk, idle, and sort by depth. Data comes from the
 * application; the scene owns only geometry and motion.
 */
export function CharacterScene({
  characters,
  ground = LOBBY_GROUND,
  config,
  children,
  art,
  contentZone,
  onSelect,
  baseCharacterSize = 150,
  className,
  height = 420,
}: CharacterSceneProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()

  /**
   * The last size this stage genuinely had.
   *
   * A measured size of zero is almost never "the stage has no width" — it is
   * the frame before a ResizeObserver has reported, which happens again on
   * every re-render that relayouts the page. Rendering the cast only when the
   * width is non-zero therefore unmounted every character for a frame and
   * remounted them, and before positions were remembered that scattered the
   * whole floor whenever a flyout opened or closed. Once a real width is
   * known, it is kept.
   */
  const lastMeasured = React.useRef({ width: 0, height: 0 })
  if (size.width > 0 && size.height > 0) lastMeasured.current = size
  const measured = size.width > 0 ? size : lastMeasured.current
  const positions = React.useRef(new Map<string, { x: number; y: number }>())

  const walking = React.useMemo<WalkingConfig>(() => {
    const zones = [...(config?.exclusionZones ?? DEFAULT_WALKING_CONFIG.exclusionZones)]
    if (contentZone) zones.push(contentZone)
    return { ...DEFAULT_WALKING_CONFIG, ...config, exclusionZones: zones }
  }, [config, contentZone])

  const handlePosition = React.useCallback((id: string, position: { x: number; y: number }) => {
    positions.current.set(id, position)
  }, [])

  const getOtherPositions = React.useCallback((excludeId: string) => {
    const others: { x: number; y: number }[] = []
    for (const [id, position] of positions.current) if (id !== excludeId) others.push(position)
    return others
  }, [])

  return (
    <div
      ref={ref}
      // `isolate` contains the scene's internal layering (characters 10–90,
      // content 90) inside this element: without it those z-indexes join the
      // page's stacking context and paint over application chrome like a z-50
      // drawer portaled to <body>.
      className={cn('isolate relative w-full overflow-hidden rounded-xl border border-border', className)}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{ background: backgroundOf(ground.backdropStyle) }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ top: `${ground.horizonY}%`, background: backgroundOf(ground.groundStyle) }}
      />
      {art ? (
        <div className="absolute inset-0 z-[5]">{art}</div>
      ) : (
        <div
          className="absolute inset-x-0 h-px opacity-40"
          style={{ top: `${ground.horizonY}%`, background: 'var(--color-border)' }}
        />
      )}

      {measured.width > 0
        ? characters.map((character) => (
            <WalkingCharacter
              key={character.id}
              character={character}
              ground={ground}
              config={walking}
              containerWidth={measured.width}
              containerHeight={measured.height}
              baseSize={baseCharacterSize}
              onPositionChange={handlePosition}
              getOtherPositions={getOtherPositions}
              {...(onSelect ? { onSelect } : {})}
            />
          ))
        : null}

      {children ? <div className="relative z-[90] h-full">{children}</div> : null}
    </div>
  )
}

function backgroundOf(style: { colors?: string[]; css?: string }): string {
  if (style.css) return style.css
  return `linear-gradient(to bottom, ${(style.colors ?? []).join(', ')})`
}
