'use client'

import * as React from 'react'
import { Button, Input, Label, Select } from '@appkitjs/ui'
import type { AvatarPart, AvatarPartCategory } from '../composition'

/**
 * What the application must do for the composer to grow its own library:
 * turn a slot and a description into candidate images, then keep the chosen
 * one. Both are the app's business — it owns the model provider and the
 * store — so the composer only drives them.
 */
export type PartGenerator = {
  generate: (
    categoryId: string,
    description: string,
  ) => Promise<{ ok: true; images: string[]; model: string; prompt: string } | { ok: false; message: string }>
  keep: (input: {
    categoryId: string
    name: string
    dataUri: string
    model: string
    prompt: string
  }) => Promise<{ ok: true; part?: AvatarPart } | { ok: false; message: string }>
}

/**
 * Draw a new part without leaving the figure you are building: pick the slot,
 * say what you want, and keep the take that fits. Kept parts land in the
 * library rail immediately.
 */
export function GeneratePanel({
  categories,
  generator,
  defaultCategoryId,
  onKept,
}: {
  categories: readonly AvatarPartCategory[]
  generator: PartGenerator
  defaultCategoryId?: string | null
  onKept?: (part: AvatarPart | undefined, categoryId: string) => void
}) {
  const [categoryId, setCategoryId] = React.useState(defaultCategoryId ?? categories[0]?.id ?? '')
  const [description, setDescription] = React.useState('')
  const [candidates, setCandidates] = React.useState<string[]>([])
  const [meta, setMeta] = React.useState<{ model: string; prompt: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, startBusy] = React.useTransition()
  const [keptIndex, setKeptIndex] = React.useState<number | null>(null)

  const category = categories.find((entry) => entry.id === categoryId)

  const generate = () =>
    startBusy(async () => {
      setError(null)
      setKeptIndex(null)
      const result = await generator.generate(categoryId, description.trim())
      if (!result.ok) {
        setCandidates([])
        setError(result.message)
        return
      }
      setCandidates(result.images)
      setMeta({ model: result.model, prompt: result.prompt })
    })

  const keep = (dataUri: string, index: number) =>
    startBusy(async () => {
      setError(null)
      if (!meta) return
      const name = description.trim() || `${category?.label ?? categoryId} ${index + 1}`
      const result = await generator.keep({ categoryId, name, dataUri, model: meta.model, prompt: meta.prompt })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setKeptIndex(index)
      onKept?.(result.part, categoryId)
    })

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="space-y-1">
          <Label htmlFor="generate-slot">Slot</Label>
          <Select id="generate-slot" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="generate-description">Describe it</Label>
          <Input
            id="generate-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={category ? `e.g. ${category.label.toLowerCase()} in navy` : 'e.g. round tortoiseshell glasses'}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy) generate()
            }}
          />
        </div>
        <Button type="button" size="sm" className="w-full" disabled={busy} onClick={generate}>
          {busy && candidates.length === 0 ? 'Drawing…' : 'Draw options'}
        </Button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {candidates.length === 0 ? (
          <p className="text-xs text-fg-muted">
            Parts are drawn on a transparent background in the house style, so anything you keep composes with the
            rest of the library.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {candidates.map((uri, index) => (
              <button
                key={index}
                type="button"
                disabled={busy}
                onClick={() => keep(uri, index)}
                title="Keep this one"
                className={
                  keptIndex === index
                    ? 'overflow-hidden rounded-lg border-2 border-primary bg-bg-subtle'
                    : 'overflow-hidden rounded-lg border border-border bg-bg-subtle transition-colors hover:border-primary'
                }
              >
                <img src={uri} alt={`Option ${index + 1}`} className="aspect-square w-full object-contain" />
                <span className="block px-1 pb-1 text-[11px] text-fg-muted">
                  {keptIndex === index ? 'in the library' : 'keep'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
