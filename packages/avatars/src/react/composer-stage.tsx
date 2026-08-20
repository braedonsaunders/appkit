'use client'

import * as React from 'react'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clampHeadViewport,
  MIN_HEAD_VIEWPORT,
  resolvePartUrl,
  sortLayers,
  type AvatarComposition,
  type AvatarHeadViewport,
  type AvatarPart,
  type AvatarPartCategory,
  type AvatarPartTransform,
} from '../composition'

/**
 * The stage — direct manipulation of the composition.
 *
 * Drag the part to move, use corner anchors to resize, or use the handle to
 * rotate. The interaction runs on DOM nodes and pointer
 * events, for the reason the renderer is DOM too — one code path paints the
 * composition in the editor, in a list row, and on a call, so what an operator
 * arranges is exactly what ships.
 *
 * Coordinates are canvas units throughout (see `composition.ts`); the stage
 * only scales them for display, so nothing stored depends on the editor size.
 */

/** Snap tolerance in canvas units for the centre line and the unit grid. */
const CENTER_SNAP = 8
const GRID = 4

export type StageMode = 'compose' | 'headFraming'

export function ComposerStage({
  composition,
  parts,
  categories,
  selectedCategoryId,
  mode,
  width,
  onSelect,
  onTransform,
  onHeadViewport,
}: {
  composition: AvatarComposition
  parts: readonly AvatarPart[]
  categories: readonly AvatarPartCategory[]
  selectedCategoryId: string | null
  mode: StageMode
  /** Rendered stage width in px. Height follows the 512×768 aspect. */
  width: number
  onSelect: (categoryId: string | null) => void
  onTransform: (categoryId: string, transform: Partial<AvatarPartTransform>, commit?: boolean) => void
  onHeadViewport: (viewport: AvatarHeadViewport, commit?: boolean) => void
}) {
  const k = width / CANVAS_WIDTH
  const height = CANVAS_HEIGHT * k
  const stageRef = React.useRef<HTMLDivElement>(null)
  const [guides, setGuides] = React.useState<{ centerX: boolean }>({ centerX: false })

  const layers = React.useMemo(
    () => sortLayers(composition, parts, categories, { includeHidden: true }),
    [composition, parts, categories],
  )

  /** Pointer position in canvas units. */
  const toCanvas = React.useCallback(
    (event: React.PointerEvent | PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return { x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k }
    },
    [k],
  )

  const selected = selectedCategoryId ? composition.parts[selectedCategoryId] : undefined
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId)
  const selectedBox =
    selected && selectedCategory
      ? {
          left: selected.transform.x,
          top: selected.transform.y,
          width: selectedCategory.frame.width * selected.transform.scale,
          height: selectedCategory.frame.height * selected.transform.scale,
          rotation: selected.transform.rotation,
        }
      : null

  /** Shared pointer-drag driver: capture, stream deltas, commit on release. */
  const drag = React.useCallback(
    (
      event: React.PointerEvent,
      onMove: (canvas: { x: number; y: number }, shift: boolean) => void,
      onEnd?: () => void,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const move = (native: PointerEvent) => onMove(toCanvas(native), native.shiftKey)
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setGuides({ centerX: false })
        onEnd?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [toCanvas],
  )

  const startMove = (event: React.PointerEvent, categoryId: string) => {
    const placement = composition.parts[categoryId]
    const category = categories.find((c) => c.id === categoryId)
    if (!placement || !category) return
    onSelect(categoryId)
    const origin = toCanvas(event)
    const start = { ...placement.transform }
    const boxWidth = category.frame.width * start.scale
    drag(
      event,
      (canvas, shift) => {
        let x = start.x + (canvas.x - origin.x)
        let y = start.y + (canvas.y - origin.y)
        if (!shift) {
          x = Math.round(x / GRID) * GRID
          y = Math.round(y / GRID) * GRID
          // Snap the part's own centre to the stage centre line.
          const centre = x + boxWidth / 2
          if (Math.abs(centre - CANVAS_WIDTH / 2) < CENTER_SNAP) {
            x = CANVAS_WIDTH / 2 - boxWidth / 2
            setGuides({ centerX: true })
          } else setGuides({ centerX: false })
        }
        onTransform(categoryId, { x, y }, false)
      },
      () => onTransform(categoryId, {}, true),
    )
  }

  const startScale = (event: React.PointerEvent, categoryId: string) => {
    const placement = composition.parts[categoryId]
    const category = categories.find((c) => c.id === categoryId)
    if (!placement || !category) return
    const start = { ...placement.transform }
    const centre = {
      x: start.x + (category.frame.width * start.scale) / 2,
      y: start.y + (category.frame.height * start.scale) / 2,
    }
    const origin = toCanvas(event)
    const startDistance = Math.hypot(origin.x - centre.x, origin.y - centre.y) || 1
    drag(
      event,
      (canvas) => {
        const distance = Math.hypot(canvas.x - centre.x, canvas.y - centre.y)
        const scale = Math.min(4, Math.max(0.1, (start.scale * distance) / startDistance))
        // Scale about the centre so the part does not walk across the stage.
        onTransform(
          categoryId,
          {
            scale,
            x: centre.x - (category.frame.width * scale) / 2,
            y: centre.y - (category.frame.height * scale) / 2,
          },
          false,
        )
      },
      () => onTransform(categoryId, {}, true),
    )
  }

  const startRotate = (event: React.PointerEvent, categoryId: string) => {
    const placement = composition.parts[categoryId]
    const category = categories.find((c) => c.id === categoryId)
    if (!placement || !category) return
    const start = { ...placement.transform }
    const centre = {
      x: start.x + (category.frame.width * start.scale) / 2,
      y: start.y + (category.frame.height * start.scale) / 2,
    }
    const origin = toCanvas(event)
    const startAngle = Math.atan2(origin.y - centre.y, origin.x - centre.x)
    drag(
      event,
      (canvas, shift) => {
        const angle = Math.atan2(canvas.y - centre.y, canvas.x - centre.x)
        let rotation = start.rotation + ((angle - startAngle) * 180) / Math.PI
        rotation = ((rotation + 180) % 360) - 180
        if (!shift) rotation = Math.round(rotation / 5) * 5
        onTransform(categoryId, { rotation }, false)
      },
      () => onTransform(categoryId, {}, true),
    )
  }

  const startViewportMove = (event: React.PointerEvent) => {
    const start = { ...composition.headViewport }
    const origin = toCanvas(event)
    // The committed value has to be the one the drag ended on. Reading
    // `composition.headViewport` here would read the prop captured when the
    // drag began and snap the frame back to where it started.
    let latest = start
    drag(
      event,
      (canvas) => {
        latest = clampHeadViewport({
          ...start,
          x: start.x + (canvas.x - origin.x),
          y: start.y + (canvas.y - origin.y),
        })
        onHeadViewport(latest, false)
      },
      () => onHeadViewport(latest, true),
    )
  }

  const startViewportResize = (event: React.PointerEvent, corner: Corner) => {
    const start = { ...composition.headViewport }
    const origin = toCanvas(event)
    // The crop's aspect ratio is fixed — it is the shape the portrait renders
    // at everywhere in the app — so the drag sets one size and both axes follow.
    const ratio = start.height > 0 ? start.width / start.height : 1
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    let latest = start
    drag(
      event,
      (canvas) => {
        // Project the pointer onto the frame's diagonal so dragging either way
        // grows the frame, instead of the vertical drag doing nothing.
        const dx = (west ? -1 : 1) * (canvas.x - origin.x)
        const dy = (north ? -1 : 1) * (canvas.y - origin.y)
        const width = Math.max(MIN_HEAD_VIEWPORT * ratio, start.width + (dx + dy * ratio) / 2)
        const height = width / ratio
        latest = clampHeadViewport({
          width,
          height,
          // The opposite corner is the anchor: it stays put while you drag.
          x: west ? start.x + start.width - width : start.x,
          y: north ? start.y + start.height - height : start.y,
        })
        onHeadViewport(latest, false)
      },
      () => onHeadViewport(latest, true),
    )
  }

  const viewport = composition.headViewport

  return (
    <div
      ref={stageRef}
      className="relative shrink-0 overflow-hidden rounded-lg border border-border"
      style={{
        width,
        height,
        // Checkerboard: the parts are alpha-cut, so the stage must read as empty.
        backgroundImage:
          'linear-gradient(45deg, var(--color-border) 25%, transparent 25%), linear-gradient(-45deg, var(--color-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-border) 75%), linear-gradient(-45deg, transparent 75%, var(--color-border) 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: 'var(--color-bg-subtle)',
        touchAction: 'none',
      }}
      onPointerDown={(event) => {
        if (event.target === stageRef.current) onSelect(null)
      }}
    >
      {layers.map((layer) => (
        <div
          key={layer.categoryId}
          onPointerDown={(event) => mode === 'compose' && startMove(event, layer.categoryId)}
          className={mode === 'compose' ? 'cursor-move' : 'pointer-events-none'}
          style={{
            position: 'absolute',
            left: layer.box.left * k,
            top: layer.box.top * k,
            width: layer.box.width * k,
            height: layer.box.height * k,
            transform: `rotate(${layer.placement.transform.rotation}deg)`,
            opacity: layer.placement.hidden ? 0.18 : layer.opacity,
          }}
        >
          <img
            src={resolvePartUrl(layer.part, layer.placement.colorVariant)}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-contain"
          />
        </div>
      ))}

      {guides.centerX ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px"
          // Inline colour, not a `/70` utility: the consuming app's Tailwind
          // only generates classes it finds in its own scanned sources, so an
          // alpha modifier used nowhere else silently paints nothing.
          style={{ backgroundColor: 'color-mix(in oklab, var(--color-primary) 70%, transparent)' }}
        />
      ) : null}

      {mode === 'compose' && selectedBox && selectedCategoryId ? (
        <div
          className="pointer-events-none absolute border-2 border-primary"
          style={{
            left: selectedBox.left * k,
            top: selectedBox.top * k,
            width: selectedBox.width * k,
            height: selectedBox.height * k,
            transform: `rotate(${selectedBox.rotation}deg)`,
          }}
        >
          {CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              aria-label={`Scale from ${corner}`}
              onPointerDown={(event) => startScale(event, selectedCategoryId)}
              className="pointer-events-auto absolute size-3 cursor-nwse-resize rounded-full border-2 border-primary bg-surface"
              style={cornerStyle(corner)}
            />
          ))}
          <button
            type="button"
            aria-label="Rotate"
            onPointerDown={(event) => startRotate(event, selectedCategoryId)}
            className="pointer-events-auto absolute -top-7 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border-2 border-primary bg-surface"
          />
          <span className="absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-primary" />
        </div>
      ) : null}

      {mode === 'headFraming' ? (
        <>
          {/* Everything outside the head frame dims, so the crop reads at a glance. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: 'color-mix(in oklab, var(--color-bg) 72%, transparent)' }}
          />
          {/* The framed region, repainted at full strength through the dim. */}
          <div
            className="pointer-events-none absolute overflow-hidden"
            style={{
              left: viewport.x * k,
              top: viewport.y * k,
              width: viewport.width * k,
              height: viewport.height * k,
            }}
          >
            <div
              className="absolute"
              style={{ left: -viewport.x * k, top: -viewport.y * k, width, height }}
            >
              {layers
                .filter((layer) => !layer.placement.hidden)
                .map((layer) => (
                  <div
                    key={layer.categoryId}
                    style={{
                      position: 'absolute',
                      left: layer.box.left * k,
                      top: layer.box.top * k,
                      width: layer.box.width * k,
                      height: layer.box.height * k,
                      transform: `rotate(${layer.placement.transform.rotation}deg)`,
                      opacity: layer.opacity,
                    }}
                  >
                    <img
                      src={resolvePartUrl(layer.part, layer.placement.colorVariant)}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </div>
                ))}
            </div>
          </div>
          <div
            onPointerDown={startViewportMove}
            className="absolute cursor-move border-2 border-primary"
            style={{
              left: viewport.x * k,
              top: viewport.y * k,
              width: viewport.width * k,
              height: viewport.height * k,
            }}
          >
            {CORNERS.map((corner) => (
              <button
                key={corner}
                type="button"
                aria-label={`Resize head frame from ${corner}`}
                onPointerDown={(event) => startViewportResize(event, corner)}
                className={`absolute size-3.5 rounded-full border-2 border-primary bg-surface ${
                  corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                }`}
                style={cornerStyle(corner, 7)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

/** Centre a handle on its corner: half the handle's own size. */
function cornerStyle(corner: Corner, offset = 6): React.CSSProperties {
  return {
    left: corner === 'nw' || corner === 'sw' ? -offset : undefined,
    right: corner === 'ne' || corner === 'se' ? -offset : undefined,
    top: corner === 'nw' || corner === 'ne' ? -offset : undefined,
    bottom: corner === 'sw' || corner === 'se' ? -offset : undefined,
  }
}
