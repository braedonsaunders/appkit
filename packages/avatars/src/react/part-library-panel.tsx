'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Badge, Input } from '@appkit/ui'
import { resolvePartUrl, type AvatarPart, type AvatarPartCategory } from '../composition'

/**
 * The parts library — the composer's left rail.
 *
 * Ported from OpenStudio's `AssetLibraryPanel`: search across names and tags,
 * collapsible category groups with a count, and a thumbnail grid where a click
 * places the part. The lock/rarity overlay went with the unlock economy; what
 * replaces it is a "placed" marker, because a category holds one part and
 * clicking a second one replaces the first.
 */
export function PartLibraryPanel({
  categories,
  parts,
  placedPartIds,
  activeCategoryId,
  onPlace,
}: {
  categories: readonly AvatarPartCategory[]
  parts: readonly AvatarPart[]
  placedPartIds: ReadonlySet<string>
  activeCategoryId: string | null
  onPlace: (part: AvatarPart, category: AvatarPartCategory) => void
}) {
  const [query, setQuery] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set())

  const filtered = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return parts
    return parts.filter(
      (part) =>
        part.name.toLowerCase().includes(trimmed) ||
        part.tags?.some((tag) => tag.toLowerCase().includes(trimmed)),
    )
  }, [parts, query])

  const byCategory = React.useMemo(() => {
    const grouped = new Map<string, AvatarPart[]>()
    for (const part of filtered) {
      const list = grouped.get(part.categoryId)
      if (list) list.push(part)
      else grouped.set(part.categoryId, [part])
    }
    return grouped
  }, [filtered])

  const toggle = (categoryId: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })

  const visible = categories.filter((category) => (byCategory.get(category.id)?.length ?? 0) > 0)

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search parts"
            aria-label="Search parts"
            className="pl-8"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">
            {parts.length === 0
              ? 'No parts in the library yet. Generate a set under Settings → Avatar parts.'
              : 'No parts match that search.'}
          </p>
        ) : (
          visible.map((category) => {
            const categoryParts = byCategory.get(category.id) ?? []
            const open = !collapsed.has(category.id)
            return (
              <div key={category.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(category.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-bg-subtle ${
                    activeCategoryId === category.id ? 'bg-primary-subtle' : ''
                  }`}
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                    {open ? (
                      <ChevronDown className="size-4 text-fg-muted" />
                    ) : (
                      <ChevronRight className="size-4 text-fg-muted" />
                    )}
                    {category.label}
                    {category.required ? (
                      <Badge variant="outline" className="text-[10px]">
                        required
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-fg-muted">{categoryParts.length}</span>
                </button>

                {open ? (
                  <div className="grid grid-cols-3 gap-1.5 p-2">
                    {categoryParts.map((part) => {
                      const placed = placedPartIds.has(part.id)
                      return (
                        <button
                          key={part.id}
                          type="button"
                          onClick={() => onPlace(part, category)}
                          title={part.name}
                          className={`group relative aspect-square overflow-hidden rounded-md border transition-colors ${
                            placed
                              ? 'border-primary ring-1 ring-primary/40'
                              : 'border-border hover:border-primary'
                          }`}
                        >
                          <img
                            src={resolvePartUrl(part)}
                            alt={part.name}
                            loading="lazy"
                            draggable={false}
                            className="h-full w-full bg-bg-subtle object-contain"
                          />
                          {placed ? (
                            <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
                          ) : null}
                        </button>
                      )
                    })}
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
