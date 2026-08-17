'use client'

import * as React from 'react'
import { Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, SubtabNav } from '@braedonsaunders/ui'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  missingRequiredCategories,
  type AvatarComposition,
  type AvatarPart,
  type AvatarPartCategory,
} from '../composition'
import { ComposedAvatar } from './composed-avatar'
import { ComposerStage, type StageMode } from './composer-stage'
import { LayerPanel } from './layer-panel'
import { PartLibraryPanel } from './part-library-panel'
import { GeneratePanel, type PartGenerator } from './generate-panel'
import { TransformControls } from './transform-controls'
import { useCompositionState } from './use-composition-state'

/**
 * The avatar composer — library on the left, stage in the middle, layer stack
 * and transform on the right.
 *
 * Ported from OpenStudio's `AvatarCanvasEditor`, which owned its own data
 * fetching, its own save endpoint, and a Konva export step. Here the component
 * is pure: it takes the library and the composition, and reports every edit
 * through `onChange`. Persistence, generation, and authorization belong to the
 * application.
 */
/** The left rail holds one panel at a time so both columns stay on screen. */
type RailTab = 'parts' | 'layers' | 'generate'

export function AvatarComposer({
  composition: initialComposition,
  parts,
  categories,
  onChange,
  onSave,
  saving,
  saveLabel = 'Save avatar',
  stageWidth = 340,
  subjectName,
  generateAction,
  generator,
}: {
  composition: AvatarComposition
  parts: readonly AvatarPart[]
  categories: readonly AvatarPartCategory[]
  /** Fires on every committed edit — the caller holds the current document. */
  onChange?: (composition: AvatarComposition) => void
  /** When given, the composer shows a save button and hands back the document. */
  onSave?: (composition: AvatarComposition) => void
  saving?: boolean
  saveLabel?: string
  stageWidth?: number
  subjectName?: string
  /** A route into part generation, shown when the library is thin. */
  generateAction?: React.ReactNode
  /** Supply this and the rail grows a Draw tab that fills the library in place. */
  generator?: PartGenerator
}) {
  const state = useCompositionState(initialComposition, categories)
  const [mode, setMode] = React.useState<StageMode>('compose')
  const [rail, setRail] = React.useState<RailTab>('parts')

  const { composition } = state
  const changeRef = React.useRef(onChange)
  changeRef.current = onChange
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    changeRef.current?.(composition)
  }, [composition])

  const placedPartIds = React.useMemo(
    () => new Set(Object.values(composition.parts).map((placement) => placement.partId)),
    [composition],
  )
  const missing = React.useMemo(
    () => missingRequiredCategories(composition, categories),
    [composition, categories],
  )
  const selectedCategory = categories.find((category) => category.id === state.selectedCategoryId)

  // The stage fills its column: as wide as fits, but never taller than the
  // panel, so the whole figure stays on screen at any window height.
  const stageAreaRef = React.useRef<HTMLDivElement>(null)
  const [stageArea, setStageArea] = React.useState({ width: 0, height: 0 })
  React.useEffect(() => {
    const element = stageAreaRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setStageArea({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // Room for the caption and preview strip under the figure.
  const availableHeight = Math.max(240, stageArea.height - 84)
  const fittedStageWidth = Math.max(
    220,
    Math.min(stageArea.width || stageWidth, (availableHeight * CANVAS_WIDTH) / CANVAS_HEIGHT),
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <SubtabNav
          tabs={[
            { key: 'compose', label: 'Compose' },
            { key: 'headFraming', label: 'Head framing' },
          ]}
          active={mode}
          onSelect={(key) => {
            setMode(key as StageMode)
            state.select(null)
          }}
          ariaLabel="Composer mode"
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Undo"
            disabled={!state.canUndo}
            onClick={state.undo}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Redo"
            disabled={!state.canRedo}
            onClick={state.redo}
          >
            <Redo2 className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" title="Clear the figure" onClick={state.reset}>
            <RotateCcw className="mr-1.5 size-4" /> Clear
          </Button>
          {onSave ? (
            <Button type="button" disabled={saving} onClick={() => onSave(composition)}>
              {saving ? 'Saving…' : saveLabel}
            </Button>
          ) : null}
        </div>
      </div>

      {parts.length === 0 ? (
        <Alert className="shrink-0">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>The parts library is empty — generate a set of parts and the figure builds from them.</span>
            {generateAction}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A workbench, not a page: the library rail and the stage are both
          always on screen, each scrolling within its own column. */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-2 md:col-span-1">
          <SubtabNav
            tabs={[
              { key: 'parts', label: 'Parts' },
              { key: 'layers', label: 'Layers', count: state.orderedCategoryIds.length },
              ...(generator ? [{ key: 'generate', label: 'Draw' }] : []),
            ]}
            active={rail}
            onSelect={(key) => setRail(key as RailTab)}
            ariaLabel="Composer panel"
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {rail === 'parts' ? (
              <PartLibraryPanel
                categories={categories}
                parts={parts}
                placedPartIds={placedPartIds}
                activeCategoryId={state.selectedCategoryId}
                onPlace={state.place}
              />
            ) : rail === 'generate' && generator ? (
              <GeneratePanel
                categories={categories}
                generator={generator}
                defaultCategoryId={state.selectedCategoryId}
                onKept={(part, categoryId) => {
                  // Straight onto the figure: drawing a part is only useful if
                  // you can see it on the person you are building.
                  const category = categories.find((entry) => entry.id === categoryId)
                  if (part && category) state.place(part, category)
                }}
              />
            ) : (
              <LayerPanel
                composition={composition}
                orderedCategoryIds={state.orderedCategoryIds}
                categories={categories}
                parts={parts}
                selectedCategoryId={state.selectedCategoryId}
                onSelect={state.select}
                onRemove={state.remove}
                onReorder={state.reorder}
                onSetColorVariant={state.setColorVariant}
                onSetOpacity={state.setOpacity}
                onSetHidden={state.setHidden}
              />
            )}
          </div>
          <div className="shrink-0">
            <TransformControls
              categoryId={state.selectedCategoryId}
              category={selectedCategory}
              placement={state.selectedCategoryId ? composition.parts[state.selectedCategoryId] : undefined}
              onTransform={state.transform}
            />
          </div>
        </div>

        <div
          ref={stageAreaRef}
          className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface p-3 md:col-span-2"
        >
          <ComposerStage
            composition={composition}
            parts={parts}
            categories={categories}
            selectedCategoryId={state.selectedCategoryId}
            mode={mode}
            width={fittedStageWidth}
            onSelect={state.select}
            onTransform={state.transform}
            onHeadViewport={state.setHeadViewport}
          />
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-2">
              <ComposedAvatar
                composition={composition}
                parts={parts}
                categories={categories}
                variant="head"
                size={32}
                rounded
                {...(subjectName ? { name: subjectName } : {})}
              />
              <span className="text-xs text-fg-muted">Portrait everywhere else</span>
            </span>
            {missing.length > 0 ? (
              <Badge variant="outline">
                still to place: {missing.map((category) => category.label.toLowerCase()).join(', ')}
              </Badge>
            ) : null}
          </div>
          <p className="shrink-0 text-center text-xs text-fg-muted">
            {mode === 'compose'
              ? 'Drag a part to move it, the corners to scale, the top handle to rotate. Hold Shift to bypass snapping.'
              : 'Drag the frame over the face. Every portrait in the app is this crop of the figure — there is no second image.'}
          </p>
        </div>
      </div>
    </div>
  )
}
