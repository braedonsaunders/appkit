/**
 * Scene geometry and motion constants — extracted from the OpenStudio
 * homepage world and generalized: no product data, no data fetching, all
 * numbers overridable by the consuming application.
 *
 * The scene is a shallow stage seen from the front. Y (in percent of the
 * container height) doubles as depth: characters near the horizon are small
 * and behind, characters near the bottom are large and in front.
 */

import type * as React from 'react'

export type SceneGroundConfig = {
  /** Horizon line, percent from the top. */
  horizonY: number
  /** Where characters may stand, in percent of the container. */
  walkableArea: { minX: number; maxX: number; minY: number; maxY: number }
  /** Character scale at the horizon (min) and at the front edge (max). */
  scaleRange: { min: number; max: number }
  /**
   * CSS backgrounds for the floor and the backdrop behind it — either color
   * stops for a plain top-to-bottom gradient, or a complete CSS background
   * (`css`), which wins when both are given. The painted stages in
   * `scene-art.tsx` use full gradient strings.
   */
  groundStyle: { colors?: string[]; css?: string }
  backdropStyle: { colors?: string[]; css?: string }
}

export type IdleAnimation = 'bounce' | 'sway' | 'still' | 'dance'

export type SceneCharacter = {
  id: string
  name: string
  /** Their role, shown beside the name on hover. */
  title?: string
  /** Standing, transparent-background full-body art. Falls back to initials. */
  imageUrl?: string
  /**
   * A rendered figure to use instead of `imageUrl` — for characters composed
   * from layered parts rather than stored as one flattened image (see
   * `@braedonsaunders/avatars/react`'s `ComposedAvatar`). It is stretched to the
   * character's box and mirrored with it, exactly as the image would be.
   */
  figure?: React.ReactNode
  /** Multiplier on the scene walk speed (1 = normal). */
  walkSpeed?: number
  idleAnimation?: IdleAnimation
  /**
   * What this character is doing, shown as a pill beside them whether or not
   * anyone is hovering.
   *
   * A stage full of characters wandering about conveys that the office is
   * populated and nothing at all about whether anybody is working. The name
   * card on hover answers "who is that"; this answers "what is going on", which
   * is the question somebody actually opens this screen to ask.
   */
  status?: {
    /**
     * ONE SHORT WORD, from a vocabulary the consumer controls: "working",
     * "reading", "on a call", "needs you", "free".
     *
     * Deliberately not a sentence. A label beside a walking figure has almost
     * no room, and the first version of this put prose here and clipped it —
     * every character wore the same grey "needs… waiting on a deci…", which is
     * unreadable, identical across the cast, and worse than showing nothing.
     * Anything that needs a sentence belongs in `speech`, above the head,
     * where there is room for one.
     */
    label: string
    tone: 'active' | 'busy' | 'idle' | 'waiting' | 'trouble'
    /**
     * What KIND of work, drawn as a small animated glyph. This is what makes
     * the pill readable at a glance and different per character without any
     * more words: an arc going round, a page being scanned, a magnifier
     * sweeping, an equaliser for talking.
     */
    activity?: 'working' | 'reading' | 'searching' | 'talking' | 'writing' | 'waiting' | 'idle'
  }
  /**
   * Something the character is saying right now, drawn as a bubble above them.
   *
   * Short-lived by nature: pass it while it is true and drop it when it stops
   * being. Long text is clamped rather than allowed to cover the scene — a
   * speech bubble is a glance, not a transcript.
   */
  speech?: {
    text: string
    /** Distinguishes thinking-to-itself from talking to somebody. */
    kind?: 'say' | 'think'
  }
}

export type WalkingConfig = {
  /** Percent of the container traversed per millisecond. */
  walkSpeed: number
  /** Random idle pause range, ms. */
  idleDuration: [number, number]
  /** Random walk-leg duration range, ms. */
  walkDuration: [number, number]
  /** Settling pause after arriving, ms. */
  settlingDuration: number
  /** Minimum distance between characters, in percent units. */
  minEntityDistance: number
  /** Characters spawn below this Y (percent) — keeps them downstage. */
  spawnMinY: number
  /** Rectangles characters never enter or cross (e.g. the content card). */
  exclusionZones: { minX: number; maxX: number; minY: number; maxY: number }[]
}

export const DEFAULT_WALKING_CONFIG: WalkingConfig = {
  walkSpeed: 0.005,
  idleDuration: [3000, 7000],
  walkDuration: [2000, 4000],
  settlingDuration: 300,
  minEntityDistance: 8,
  spawnMinY: 60,
  exclusionZones: [],
}

/** A neutral indoor stage that suits an application shell. */
export const LOBBY_GROUND: SceneGroundConfig = {
  horizonY: 30,
  walkableArea: { minX: 6, maxX: 94, minY: 42, maxY: 88 },
  scaleRange: { min: 0.55, max: 1.15 },
  groundStyle: { colors: ['color-mix(in oklab, var(--color-bg) 88%, black)', 'var(--color-bg)'] },
  backdropStyle: { colors: ['var(--color-bg)', 'color-mix(in oklab, var(--color-bg) 92%, var(--color-primary))'] },
}

export const IDLE_MOTION: Record<IdleAnimation, { bounce: number; rotate: number; speed: number }> = {
  bounce: { bounce: 4, rotate: 0, speed: 1.2 },
  sway: { bounce: 0, rotate: 2, speed: 2 },
  still: { bounce: 0, rotate: 0, speed: 1 },
  dance: { bounce: 6, rotate: 3, speed: 0.8 },
}

/** Depth scale from the character's Y position. */
export function calculateScale(y: number, ground: SceneGroundConfig): number {
  const { minY, maxY } = ground.walkableArea
  const t = Math.max(0, Math.min(1, (y - minY) / Math.max(1, maxY - minY)))
  return ground.scaleRange.min + t * (ground.scaleRange.max - ground.scaleRange.min)
}

/** Nearer characters paint over farther ones. */
export function calculateZIndex(y: number, ground: SceneGroundConfig): number {
  const { minY, maxY } = ground.walkableArea
  const t = Math.max(0, Math.min(1, (y - minY) / Math.max(1, maxY - minY)))
  return 10 + Math.round(t * 80)
}

export function clampToWalkable(
  x: number,
  y: number,
  area: SceneGroundConfig['walkableArea'],
): { x: number; y: number } {
  return {
    x: Math.max(area.minX, Math.min(area.maxX, x)),
    y: Math.max(area.minY, Math.min(area.maxY, y)),
  }
}

export function isInsideZones(x: number, y: number, zones: WalkingConfig['exclusionZones']): boolean {
  return zones.some((zone) => x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY)
}

export function pathCrossesZones(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zones: WalkingConfig['exclusionZones'],
): boolean {
  if (zones.length === 0) return false
  if (isInsideZones(x1, y1, zones) || isInsideZones(x2, y2, zones)) return true
  const steps = 10
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (isInsideZones(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, zones)) return true
  }
  return false
}

/** A downstage spawn point, clear of the exclusion zones. */
export function biasedSpawn(ground: SceneGroundConfig, config: WalkingConfig): { x: number; y: number } {
  const { walkableArea } = ground
  const minY = Math.max(walkableArea.minY, config.spawnMinY)
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = walkableArea.minX + 4 + Math.random() * Math.max(1, walkableArea.maxX - walkableArea.minX - 8)
    const y = minY + Math.random() * Math.max(1, walkableArea.maxY - minY - 2)
    if (!isInsideZones(x, y, config.exclusionZones)) return { x, y }
  }
  return { x: (walkableArea.minX + walkableArea.maxX) / 2, y: walkableArea.maxY - 4 }
}
