'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Palette, Trash2 } from 'lucide-react'
import { Slider } from '@appkit/ui'
import { resolvePartUrl, type AvatarComposition, type AvatarPart, type AvatarPartCategory } from '../composition'

/**
 * The layer stack — the composer's right rail.
 *
 * Ported from OpenStudio's `LayerPanel`: top layer first, thumbnail, name and
 * slot, a colour-variant tray with an opacity slider, and per-layer remove.
 * Drag-to-reorder is replaced by explicit up/down controls — the same
 * operation, but keyboard-reachable and unambiguous on touch, which HTML5
 * drag-and-drop reordering is not.
 */
export function LayerPanel({
  composition,
  orderedCategoryIds,
  categories,
  parts,
  selectedCategoryId,
  onSelect,
  onRemove,
  onReorder,
  onSetColorVariant,
  onSetOpacity,
  onSetHidden,
}: {
  composition: AvatarComposition
  orderedCategoryIds: readonly string[]
  categories: readonly AvatarPartCategory[]
  parts: readonly AvatarPart[]
  selectedCategoryId: string | null
  onSelect: (categoryId: string | null) => void
  onRemove: (categoryId: string) => void
  onReorder: (categoryId: string, direction: 'up' | 'down') => void
  onSetColorVariant: (categoryId: string, variant: string | null) => void
  onSetOpacity: (categoryId: string, opacity: number, commit?: boolean) => void
  onSetHidden: (categoryId: string, hidden: boolean) => void
}) {
  const [openVariants, setOpenVariants] = React.useState<string | null>(null)
  const categoriesById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const partsById = React.useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])

  // Top of the stack reads first, as in every layer list.
  const rows = [...orderedCategoryIds].reverse()

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium text-fg">Layers</h3>
        <span className="text-xs text-fg-muted">{rows.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">
            Nothing placed yet. Pick a part from the library to start the figure.
          </p>
        ) : (
          rows.map((categoryId, index) => {
            const placement = composition.parts[categoryId]!
            const category = categoriesById.get(categoryId)
            const part = partsById.get(placement.partId)
            const selected = selectedCategoryId === categoryId
            const variants = part?.colorVariants ? Object.keys(part.colorVariants) : []

            return (
              <div key={categoryId} className="border-b border-border last:border-b-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(selected ? null : categoryId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(selected ? null : categoryId)
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2 p-2 transition-colors ${
                    selected ? 'bg-primary-subtle' : 'hover:bg-bg-subtle'
                  }`}
                >
                  <div className="size-9 shrink-0 overflow-hidden rounded border border-border bg-bg-subtle">
                    {part ? (
                      <img
                        src={resolvePartUrl(part, placement.colorVariant)}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {part?.name ?? 'Part no longer in the library'}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{category?.label ?? categoryId}</p>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <IconButton
                      label="Move up"
                      disabled={index === 0}
                      onClick={() => onReorder(categoryId, 'up')}
                    >
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={index === rows.length - 1}
                      onClick={() => onReorder(categoryId, 'down')}
                    >
                      <ChevronDown className="size-4" />
                    </IconButton>
                    <IconButton
                      label={placement.hidden ? 'Show layer' : 'Hide layer'}
                      onClick={() => onSetHidden(categoryId, !placement.hidden)}
                    >
                      {placement.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </IconButton>
                    {variants.length > 0 ? (
                      <IconButton
                        label="Colour"
                        active={openVariants === categoryId}
                        onClick={() => setOpenVariants((v) => (v === categoryId ? null : categoryId))}
                      >
                        <Palette className="size-4" />
                      </IconButton>
                    ) : null}
                    <IconButton label="Remove layer" tone="danger" onClick={() => onRemove(categoryId)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>

                {openVariants === categoryId ? (
                  <div className="space-y-3 border-t border-border bg-bg-subtle p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <VariantChip
                        label="Original"
                        active={!placement.colorVariant}
                        onClick={() => onSetColorVariant(categoryId, null)}
                      />
                      {variants.map((variant) => (
                        <VariantChip
                          key={variant}
                          label={variant}
                          active={placement.colorVariant === variant}
                          onClick={() => onSetColorVariant(categoryId, variant)}
                        />
                      ))}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-fg-muted">
                        Opacity {Math.round((placement.opacity ?? 1) * 100)}%
                      </label>
                      <Slider
                        min={0}
                        max={100}
                        value={Math.round((placement.opacity ?? 1) * 100)}
                        onChange={(event) =>
                          onSetOpacity(categoryId, Number(event.target.value) / 100, false)
                        }
                        onPointerUp={() =>
                          onSetOpacity(categoryId, placement.opacity ?? 1, true)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  active,
  tone,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
  tone?: 'danger'
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`rounded p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-primary-subtle text-primary'
          : tone === 'danger'
            ? 'text-fg-muted hover:bg-danger-subtle hover:text-danger'
            : 'text-fg-muted hover:bg-bg-subtle hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

function VariantChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
        active
          ? 'border-primary bg-primary-subtle text-primary'
          : 'border-border text-fg-muted hover:border-primary hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}
