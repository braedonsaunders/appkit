'use client'

// The left rail. GrapesJS's own block manager UI is replaced so the palette can
// be styled by the host and grouped by category without pulling in a UI kit.

import type { DragEvent as ReactDragEvent } from 'react'
import type { EmailDesignerCopy } from './copy'
import { resolveEmailDesignerCopy } from './copy'

/** The shape `@grapesjs/react`'s BlocksProvider hands each block. */
export type PaletteBlock = {
  getId: () => string
  getLabel: () => unknown
}

export type EmailBlockPaletteProps<T extends PaletteBlock> = {
  mapCategoryBlocks: Map<string, T[]>
  dragStart: (block: T, event: DragEvent) => void
  dragStop: () => void
  copy?: Partial<EmailDesignerCopy>
}

function blockLabel(block: PaletteBlock): string {
  const value = block.getLabel()
  const label = typeof value === 'string' ? value.trim() : ''
  return label || block.getId()
}

/** Icons are glyphs rather than an icon-library dependency. */
function blockGlyph(id: string): string {
  if (id.startsWith('token:')) return '{ }'
  if (id.startsWith('table:')) return '▤'
  return '◻'
}

export function EmailBlockPalette<T extends PaletteBlock>({
  mapCategoryBlocks,
  dragStart,
  dragStop,
  copy,
}: EmailBlockPaletteProps<T>) {
  const t = resolveEmailDesignerCopy(copy)
  const categories = Array.from(mapCategoryBlocks.entries()).filter(
    ([, blocks]) => blocks.length > 0,
  )

  if (categories.length === 0) {
    return <p className="ak-ed-palette__empty">{t.noBlocks}</p>
  }

  return (
    <div className="ak-ed-palette">
      {categories.map(([category, blocks]) => (
        <div key={category || 'general'} className="ak-ed-palette__group">
          <p className="ak-ed-palette__heading">{category || t.generalCategory}</p>
          <div className="ak-ed-palette__grid">
            {blocks.map((block) => {
              const id = block.getId()
              const label = blockLabel(block)
              return (
                <div
                  key={id}
                  draggable
                  role="button"
                  tabIndex={0}
                  title={label}
                  className="ak-ed-palette__block"
                  onDragStart={(event: ReactDragEvent<HTMLDivElement>) =>
                    dragStart(block, event.nativeEvent)
                  }
                  onDragEnd={dragStop}
                >
                  <span className="ak-ed-palette__glyph" aria-hidden="true">
                    {blockGlyph(id)}
                  </span>
                  <span className="ak-ed-palette__label">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
