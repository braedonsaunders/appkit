'use client'

import * as React from 'react'
import { Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, SubtabNav } from '@appkit/ui'
import {
  missingRequiredCategories,
  type AvatarComposition,
  type AvatarPart,
  type AvatarPartCategory,
} from '../composition'
import { ComposedAvatar } from './composed-avatar'
import { ComposerStage, type StageMode } from './composer-stage'
import { LayerPanel } from './layer-panel'
import { PartLibraryPanel } from './part-library-panel'
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
}) {
  const state = useCompositionState(initialComposition, categories)
  const [mode, setMode] = React.useState<StageMode>('compose')

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>The parts library is empty — generate a set of parts and the figure builds from them.</span>
            {generateAction}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[36rem]">
          <PartLibraryPanel
            categories={categories}
            parts={parts}
            placedPartIds={placedPartIds}
            activeCategoryId={state.selectedCategoryId}
            onPlace={state.place}
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <ComposerStage
            composition={composition}
            parts={parts}
            categories={categories}
            selectedCategoryId={state.selectedCategoryId}
            mode={mode}
            width={stageWidth}
            onSelect={state.select}
            onTransform={state.transform}
            onHeadViewport={state.setHeadViewport}
          />
          <p className="max-w-[22rem] text-center text-xs text-fg-muted">
            {mode === 'compose'
              ? 'Drag a part to move it, the corners to scale, the top handle to rotate. Hold Shift to bypass snapping.'
              : 'Drag the frame over the face. Every portrait in the app is this crop of the figure — there is no second image.'}
          </p>
        </div>

        <div className="flex min-h-0 flex-col gap-3 xl:h-[36rem]">
          <div className="min-h-0 flex-1">
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
          </div>
          <TransformControls
            categoryId={state.selectedCategoryId}
            category={selectedCategory}
            placement={state.selectedCategoryId ? composition.parts[state.selectedCategoryId] : undefined}
            onTransform={state.transform}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <ComposedAvatar
            composition={composition}
            parts={parts}
            categories={categories}
            variant="head"
            size={56}
            rounded
            {...(subjectName ? { name: subjectName } : {})}
          />
          <div>
            <p className="text-sm font-medium text-fg">Portrait</p>
            <p className="text-xs text-fg-muted">Directory rows, record headers, calls.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ComposedAvatar
            composition={composition}
            parts={parts}
            categories={categories}
            variant="full"
            size={56}
            animate="idle"
            {...(subjectName ? { name: subjectName } : {})}
          />
          <div>
            <p className="text-sm font-medium text-fg">Standing</p>
            <p className="text-xs text-fg-muted">The lobby and any scene.</p>
          </div>
        </div>
        {missing.length > 0 ? (
          <Badge variant="outline" className="ml-auto">
            still to place: {missing.map((category) => category.label.toLowerCase()).join(', ')}
          </Badge>
        ) : null}
      </div>
    </div>
  )
}
