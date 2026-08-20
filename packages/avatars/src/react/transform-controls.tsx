'use client'

import { RotateCcw } from 'lucide-react'
import { Button, Input, Slider } from '@braedonsaunders/appkit-ui'
import type { AvatarPartCategory, AvatarPartPlacement, AvatarPartTransform } from '../composition'

/**
 * Numeric transform entry for the selected layer. X/Y/rotation are direct;
 * width and height are replaced
 * by a single `scale`, because a part's aspect ratio is a property of the
 * artwork and letting an operator stretch it independently is how a library
 * stops looking like one set.
 */
export function TransformControls({
  categoryId,
  category,
  placement,
  onTransform,
}: {
  categoryId: string | null
  category: AvatarPartCategory | undefined
  placement: AvatarPartPlacement | undefined
  onTransform: (categoryId: string, transform: Partial<AvatarPartTransform>, commit?: boolean) => void
}) {
  if (!categoryId || !category || !placement) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-center text-sm text-fg-muted">
          Select a layer to move, scale, or rotate it.
        </p>
      </div>
    )
  }

  const { transform } = placement
  const set = (field: keyof AvatarPartTransform, value: number, commit = true) =>
    onTransform(categoryId, { [field]: value }, commit)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="X" value={Math.round(transform.x)} onChange={(v) => set('x', v)} />
        <Field label="Y" value={Math.round(transform.y)} onChange={(v) => set('y', v)} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-fg-muted">Scale</label>
          <span className="text-xs tabular-nums text-fg-muted">{transform.scale.toFixed(2)}×</span>
        </div>
        <Slider
          min={20}
          max={300}
          value={Math.round(transform.scale * 100)}
          onChange={(event) => set('scale', Number(event.target.value) / 100, false)}
          onPointerUp={() => set('scale', transform.scale, true)}
          aria-label="Scale"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-fg-muted">Rotation</label>
          <span className="text-xs tabular-nums text-fg-muted">{Math.round(transform.rotation)}°</span>
        </div>
        <div className="flex items-center gap-2">
          <Slider
            min={-180}
            max={180}
            value={Math.round(transform.rotation)}
            onChange={(event) => set('rotation', Number(event.target.value), false)}
            onPointerUp={() => set('rotation', transform.rotation, true)}
            aria-label="Rotation"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Reset rotation"
            onClick={() => set('rotation', 0)}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onTransform(categoryId, { ...category.defaultTransform }, true)}
      >
        Reset to {category.label.toLowerCase()} default
      </Button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-fg-muted">{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)}
      />
    </div>
  )
}
