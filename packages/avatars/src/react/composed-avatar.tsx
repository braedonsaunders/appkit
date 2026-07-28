'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  sortLayers,
  viewportTransform,
  type AvatarComposition,
  type AvatarPart,
  type AvatarPartCategory,
} from '../composition'

/**
 * `full` renders the whole 512×768 stage; `head` crops to the composition's
 * head viewport. There is no third variant and no second stored image — a
 * portrait is this component with `variant="head"`.
 */
export type ComposedAvatarVariant = 'full' | 'head'

/**
 * `idle` is the resting figure — a slow breathing rise and a faint sway.
 * `talking` is the loop for a live call: a quicker head bob with the mouth
 * layer working. Both honour `prefers-reduced-motion` and fall still.
 */
export type ComposedAvatarAnimation = 'idle' | 'talking' | 'none'

export type ComposedAvatarProps = {
  composition: AvatarComposition
  parts: readonly AvatarPart[]
  categories: readonly AvatarPartCategory[]
  variant?: ComposedAvatarVariant
  /**
   * Rendered width in pixels. `full` is `size` wide and 1.5× that tall (the
   * stage's aspect); `head` is a `size` square.
   */
  size: number
  animate?: ComposedAvatarAnimation
  /** Shown when the composition resolves to no layers. Defaults to initials. */
  fallback?: React.ReactNode
  /** Used for the initials fallback and the accessible name. */
  name?: string
  className?: string
  /** Round the frame — the usual choice for `head` in a directory. */
  rounded?: boolean
}

/**
 * The one avatar renderer: a composition painted as absolutely positioned
 * `<img>` layers inside a scaled stage.
 *
 * OpenStudio composited to a `<canvas>` and stored the flattened PNG, which
 * cost it a stored image per size and per crop and made per-layer motion
 * impossible. Layering in the DOM instead keeps every part addressable — so a
 * mouth can move while a call is live — and stays sharp at any size, because
 * the browser rasterizes the source art at the size actually shown.
 */
export function ComposedAvatar({
  composition,
  parts,
  categories,
  variant = 'full',
  size,
  animate = 'none',
  fallback,
  name,
  className,
  rounded,
}: ComposedAvatarProps) {
  const reduceMotion = useReducedMotion()
  const layers = React.useMemo(
    () => sortLayers(composition, parts, categories),
    [composition, parts, categories],
  )

  const frame =
    variant === 'head'
      ? { width: size, height: size }
      : { width: size, height: (size * CANVAS_HEIGHT) / CANVAS_WIDTH }

  const viewport =
    variant === 'head'
      ? composition.headViewport
      : { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }

  const { scale, translateX, translateY } = viewportTransform(viewport, frame)

  const motionEnabled = animate !== 'none' && !reduceMotion
  const figureMotion = motionEnabled
    ? animate === 'talking'
      ? {
          animate: { y: [0, -1.6, 0, -1, 0], rotate: [0, 0.35, 0, -0.35, 0] },
          transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const },
        }
      : {
          animate: { y: [0, -4, 0], rotate: [0, 0.7, 0, -0.7, 0] },
          transition: { duration: 5.2, repeat: Infinity, ease: 'easeInOut' as const },
        }
    : {}

  if (layers.length === 0) {
    return (
      <div
        className={cx(
          'flex items-center justify-center overflow-hidden border border-border bg-primary-subtle text-primary',
          rounded ? 'rounded-full' : 'rounded-lg',
          className,
        )}
        style={{ width: frame.width, height: frame.height }}
        role="img"
        aria-label={name ?? 'Avatar'}
      >
        {fallback ?? (
          <span className="font-semibold" style={{ fontSize: Math.max(11, frame.width * 0.36) }}>
            {(name ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cx('relative overflow-hidden', rounded ? 'rounded-full' : '', className)}
      style={{ width: frame.width, height: frame.height }}
      role="img"
      aria-label={name ?? 'Avatar'}
    >
      <motion.div
        className="absolute left-0 top-0"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          // The origin is inline, not `origin-top-left`: the crop maths assume
          // the stage scales from its top-left corner, and a utility class the
          // consuming app never generated would silently move the whole figure
          // out of frame instead of failing loudly.
          transformOrigin: '0 0',
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        }}
      >
        {/* The figure moves as one; individual parts move inside it. */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: '50% 100%' }}
          {...figureMotion}
        >
          {layers.map((layer) => (
            <PartLayer
              key={layer.categoryId}
              layer={layer}
              talking={motionEnabled && animate === 'talking'}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Category ids whose layers animate while a subject is speaking. */
const MOUTH_CATEGORY_IDS = new Set(['mouth', 'lips', 'facial-hair'])

function PartLayer({
  layer,
  talking,
}: {
  layer: ReturnType<typeof sortLayers>[number]
  talking: boolean
}) {
  const speaks = talking && MOUTH_CATEGORY_IDS.has(layer.categoryId)
  return (
    <motion.div
      className="absolute"
      style={{
        left: layer.box.left,
        top: layer.box.top,
        width: layer.box.width,
        height: layer.box.height,
        opacity: layer.opacity,
        rotate: layer.placement.transform.rotation,
        transformOrigin: speaks ? '50% 100%' : '50% 50%',
      }}
      {...(speaks
        ? {
            animate: { scaleY: [1, 0.45, 1, 0.75, 1], scaleX: [1, 1.06, 1, 1.03, 1] },
            transition: { duration: 0.42, repeat: Infinity, ease: 'easeInOut' as const },
          }
        : {})}
    >
      <img
        src={layer.url}
        alt=""
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </motion.div>
  )
}

function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}
