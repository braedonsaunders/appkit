'use client'

import * as React from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { cn } from '@appkit/ui'
import {
  biasedSpawn,
  calculateScale,
  calculateZIndex,
  clampToWalkable,
  IDLE_MOTION,
  isInsideZones,
  pathCrossesZones,
  type SceneCharacter,
  type SceneGroundConfig,
  type WalkingConfig,
} from './config'
import { CharacterBadges } from './character-badges'
import { useSceneAnimationFrame } from './use-animation-frame'

type Position = { x: number; y: number }

function wouldCollide(x: number, y: number, others: Position[], minDistance: number): boolean {
  return others.some((other) => Math.hypot(x - other.x, y - other.y) < minDistance)
}

function findClearPosition(
  base: Position,
  others: Position[],
  ground: SceneGroundConfig,
  config: WalkingConfig,
): Position {
  if (!wouldCollide(base.x, base.y, others, config.minEntityDistance)) return base
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = (attempt / 8) * Math.PI * 2
    const distance = config.minEntityDistance + Math.random() * 5
    const candidate = clampToWalkable(
      base.x + Math.cos(angle) * distance,
      base.y + Math.sin(angle) * distance,
      ground.walkableArea,
    )
    if (!wouldCollide(candidate.x, candidate.y, others, config.minEntityDistance)) return candidate
  }
  return base
}

/** Nudge a point out of any exclusion zone by the shortest edge. */
function pushOutOfZones(point: Position, ground: SceneGroundConfig, config: WalkingConfig): Position {
  let { x, y } = clampToWalkable(point.x, point.y, ground.walkableArea)
  for (const zone of config.exclusionZones) {
    if (!isInsideZones(x, y, [zone])) continue
    const distances = [
      { edge: 'left' as const, value: x - zone.minX },
      { edge: 'right' as const, value: zone.maxX - x },
      { edge: 'top' as const, value: y - zone.minY },
      { edge: 'bottom' as const, value: zone.maxY - y },
    ].sort((a, b) => a.value - b.value)
    const nearest = distances[0]!
    if (nearest.edge === 'left') x = zone.minX - 3
    else if (nearest.edge === 'right') x = zone.maxX + 3
    else if (nearest.edge === 'top') y = zone.minY - 3
    else y = zone.maxY + 3
  }
  return clampToWalkable(x, y, ground.walkableArea)
}

type CharacterState = {
  x: number
  y: number
  targetX: number
  targetY: number
  phase: 'idle' | 'walking' | 'settling'
  facingRight: boolean
  timer: number
}

export type WalkingCharacterProps = {
  character: SceneCharacter
  ground: SceneGroundConfig
  config: WalkingConfig
  containerWidth: number
  containerHeight: number
  baseSize?: number
  onPositionChange?: (id: string, position: Position) => void
  getOtherPositions?: (excludeId: string) => Position[]
  onSelect?: (id: string) => void
}

/**
 * One character on the stage: strolls to nearby points, idles with a gentle
 * bounce or sway, faces its direction of travel, scales and sorts by depth,
 * and keeps clear of its neighbours and the exclusion zones.
 */
export const WalkingCharacter = React.memo(function WalkingCharacter({
  character,
  ground,
  config,
  containerWidth,
  containerHeight,
  baseSize = 150,
  onPositionChange,
  getOtherPositions,
  onSelect,
}: WalkingCharacterProps) {
  const [state, setState] = React.useState<CharacterState>(() => {
    const start = biasedSpawn(ground, config)
    return {
      x: start.x,
      y: start.y,
      targetX: start.x,
      targetY: start.y,
      phase: 'idle',
      facingRight: Math.random() > 0.5,
      timer: config.idleDuration[0] + Math.random() * (config.idleDuration[1] - config.idleDuration[0]),
    }
  })

  const bounceTarget = useMotionValue(0)
  const rotateTarget = useMotionValue(0)
  const bounce = useSpring(bounceTarget, { stiffness: 400, damping: 30 })
  const rotate = useSpring(rotateTarget, { stiffness: 400, damping: 30 })
  const xTarget = useMotionValue((state.x / 100) * containerWidth)
  const yTarget = useMotionValue((state.y / 100) * containerHeight)
  const springX = useSpring(xTarget, { stiffness: 120, damping: 20 })
  const springY = useSpring(yTarget, { stiffness: 120, damping: 20 })
  const phaseRef = React.useRef(0)

  const idle = IDLE_MOTION[character.idleAnimation ?? 'bounce']
  const speedMultiplier = character.walkSpeed ?? 1

  useSceneAnimationFrame((delta) => {
    if (state.phase === 'walking') {
      phaseRef.current += delta * 0.015
      bounceTarget.set(Math.sin(phaseRef.current) * -2)
      rotateTarget.set(Math.sin(phaseRef.current) * 0.5)
    } else if (state.phase === 'settling') {
      bounceTarget.set(0)
      rotateTarget.set(0)
    } else {
      phaseRef.current += delta * (0.002 / idle.speed)
      bounceTarget.set(-Math.abs(Math.sin(phaseRef.current)) * idle.bounce)
      rotateTarget.set(Math.sin(phaseRef.current) * idle.rotate)
    }

    xTarget.set((state.x / 100) * containerWidth)
    yTarget.set((state.y / 100) * containerHeight)

    setState((prev) => {
      if (prev.phase === 'walking') {
        const dx = prev.targetX - prev.x
        const dy = prev.targetY - prev.y
        const distance = Math.hypot(dx, dy)
        if (distance < 1 || prev.timer <= 0) {
          return { ...prev, phase: 'settling', timer: config.settlingDuration }
        }
        const step = config.walkSpeed * speedMultiplier * delta
        const next = clampToWalkable(
          prev.x + (dx / distance) * step,
          prev.y + (dy / distance) * step,
          ground.walkableArea,
        )
        if (isInsideZones(next.x, next.y, config.exclusionZones)) {
          return { ...prev, phase: 'settling', timer: config.settlingDuration }
        }
        const others = getOtherPositions?.(character.id) ?? []
        if (wouldCollide(next.x, next.y, others, config.minEntityDistance)) {
          return { ...prev, phase: 'settling', timer: config.settlingDuration }
        }
        return { ...prev, x: next.x, y: next.y, timer: prev.timer - delta, facingRight: dx > 0 }
      }

      if (prev.phase === 'settling') {
        if (prev.timer <= 0) {
          return {
            ...prev,
            phase: 'idle',
            timer: config.idleDuration[0] + Math.random() * (config.idleDuration[1] - config.idleDuration[0]),
          }
        }
        return { ...prev, timer: prev.timer - delta }
      }

      if (prev.timer > 0) return { ...prev, timer: prev.timer - delta }

      const others = getOtherPositions?.(character.id) ?? []
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = pushOutOfZones(
          { x: prev.x + (Math.random() - 0.5) * 24, y: prev.y + (Math.random() - 0.3) * 20 },
          ground,
          config,
        )
        const clear = findClearPosition(candidate, others, ground, config)
        if (!pathCrossesZones(prev.x, prev.y, clear.x, clear.y, config.exclusionZones)) {
          return {
            ...prev,
            targetX: clear.x,
            targetY: clear.y,
            phase: 'walking',
            facingRight: clear.x > prev.x,
            timer: config.walkDuration[0] + Math.random() * (config.walkDuration[1] - config.walkDuration[0]),
          }
        }
      }
      return { ...prev, timer: config.idleDuration[0] * 0.5 }
    })
  }, containerWidth > 0 && containerHeight > 0)

  React.useEffect(() => {
    onPositionChange?.(character.id, { x: state.x, y: state.y })
  }, [character.id, state.x, state.y, onPositionChange])

  const scale = calculateScale(state.y, ground)
  const size = baseSize * scale
  const shadowWidth = size * 0.55
  const shadowHeight = size * 0.12

  return (
    <motion.div
      className="group absolute"
      style={{
        left: springX,
        top: springY,
        zIndex: calculateZIndex(state.y, ground),
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{
          bottom: -shadowHeight * 0.35,
          width: shadowWidth,
          height: shadowHeight,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.16) 55%, transparent 72%)',
          filter: `blur(${Math.max(2, 4 * scale)}px)`,
        }}
      />
      <motion.button
        type="button"
        onClick={onSelect ? () => onSelect(character.id) : undefined}
        aria-label={character.name}
        className={cn(
          'block rounded-lg outline-none transition-opacity',
          onSelect ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50' : 'pointer-events-none',
        )}
        style={{ width: size, height: size, y: bounce, rotate }}
      >
        {character.figure ?? character.imageUrl ? (
          // Only the artwork mirrors — text would read backwards.
          <span
            className="flex h-full w-full items-end justify-center"
            style={{
              transform: `scaleX(${state.facingRight ? 1 : -1})`,
              filter: `drop-shadow(0 ${2 * scale}px ${4 * scale}px rgba(0,0,0,0.18))`,
            }}
          >
            {character.figure ?? (
              <img src={character.imageUrl} alt="" className="h-full w-full object-contain" />
            )}
          </span>
        ) : (
          <span className="flex h-full w-full items-end justify-center">
            <span
              className="flex items-center justify-center rounded-full border border-border bg-primary-subtle font-semibold text-primary"
              style={{ width: size * 0.42, height: size * 0.42, fontSize: 15 * scale }}
            >
              {character.name.charAt(0)}
            </span>
          </span>
        )}
      </motion.button>
      {/*
        Identity on hover, activity always. The status used to live in here,
        which meant the one thing a person opens the scene to find out — is
        anybody actually working — was invisible until they hovered, and could
        only be read one character at a time.
      */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-elevated/90 px-2 py-0.5',
          'text-center opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100',
          // The same spot the status pill occupies: hovering swaps one label
          // for the other rather than stacking two under a walking figure.
          'top-full mt-1',
        )}
        style={{ fontSize: Math.max(10, 11 * scale) }}
      >
        <span className="font-medium text-fg">{character.name}</span>
        {character.title ? <span className="ml-1.5 text-fg-muted">{character.title}</span> : null}
      </div>
      <CharacterBadges character={character} scale={scale} size={size} />
    </motion.div>
  )
})
