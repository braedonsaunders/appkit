'use client'

// The authoring surface: a block palette on the left, the live canvas on the
// right. GrapesJS runs in plain-HTML mode (no MJML plugin) so every element —
// including generated collection tables — stays a real, editable component and
// the markup on the canvas is the markup that ships.
//
// Client-only: GrapesJS touches `window`, so hosts must mount this behind a
// lazy/dynamic import with SSR disabled.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import GjsEditor, { BlocksProvider, Canvas } from '@grapesjs/react'
import grapesjs, { type Editor } from 'grapesjs'
import type {
  EmailBlock,
  EmailCollection,
  EmailDesignerPreset,
  EmailDesignerTheme,
  EmailMergeField,
} from './types'
import { blocksForPreset, collectionTableBlockHtml, mergeFieldBlockHtml, starterHtml } from './blocks'
import { resolveEmailDesignerCopy, type EmailDesignerCopy } from './copy'
import { EmailBlockPalette } from './palette'
import { EmailTableToolbar } from './table-tools'
import { serializeEmailEditor } from './serialize'

// GrapesJS ships dark chrome; these variables put it in a light key that sits
// closer to a settings page. Hosts can override any of them via `chromeStyle`.
const LIGHT_CHROME: CSSProperties & Record<string, string> = {
  '--gjs-primary-color': '#f1f5f9',
  '--gjs-secondary-color': '#334155',
  '--gjs-tertiary-color': '#0d9488',
  '--gjs-quaternary-color': '#0f766e',
  '--gjs-font-color': '#334155',
  '--gjs-font-color-active': '#0f172a',
  '--gjs-main-dark-color': '#e2e8f0',
}

export type EmailDesignerProps = {
  /** Saved `sourceHtml` to reopen. When empty the preset's starter is seeded. */
  initialHtml?: string | null
  /** Selects the starter document and which block groups the palette offers. */
  preset?: EmailDesignerPreset
  /** Visual defaults baked into newly inserted blocks. */
  theme?: Partial<EmailDesignerTheme>
  /** Scalar tokens offered as draggable blocks. */
  mergeFields?: EmailMergeField[]
  /** Repeating lists offered as draggable editable tables. */
  collections?: EmailCollection[]
  /** Extra host-specific blocks appended to the palette. */
  extraBlocks?: EmailBlock[]
  /** Override any user-visible string. */
  copy?: Partial<EmailDesignerCopy>
  /** Called once the editor exists — keep the ref to snapshot on save. */
  onReady?: (editor: Editor) => void
  /** Called with the serialized design (`<style>` + markup) on every edit. */
  onChange?: (html: string) => void
  className?: string
  /** Merged over the light chrome variables. */
  chromeStyle?: CSSProperties
}

export function EmailDesigner({
  initialHtml,
  preset = 'email',
  theme,
  mergeFields = [],
  collections = [],
  extraBlocks = [],
  copy,
  onReady,
  onChange,
  className,
  chromeStyle,
}: EmailDesignerProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const t = resolveEmailDesignerCopy(copy)

  // Read through refs inside the editor callbacks so a host re-render with new
  // handlers never needs to tear the editor down and lose canvas state.
  const onChangeRef = useRef(onChange)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onChangeRef.current = onChange
    onReadyRef.current = onReady
  }, [onChange, onReady])

  return (
    <div
      className={['ak-ed', className].filter(Boolean).join(' ')}
      style={{ ...LIGHT_CHROME, ...chromeStyle }}
    >
      <GjsEditor
        grapesjs={grapesjs}
        options={{
          height: '100%',
          storageManager: false,
          fromElement: false,
        }}
        onEditor={(instance: Editor) => {
          registerBlocks(instance, { preset, theme, mergeFields, collections, extraBlocks, copy: t })
          seedCanvas(instance, initialHtml, preset, theme)
          instance.on('update', () => onChangeRef.current?.(serializeEmailEditor(instance)))
          setEditor(instance)
          onReadyRef.current?.(instance)
        }}
      >
        <div className="ak-ed__layout">
          <aside className="ak-ed__rail">
            <BlocksProvider>
              {(props) => <EmailBlockPalette {...props} copy={copy} />}
            </BlocksProvider>
          </aside>
          <div className="ak-ed__canvas">
            <EmailTableToolbar editor={editor} copy={copy} />
            <Canvas className="ak-ed__frame" />
          </div>
        </div>
      </GjsEditor>
    </div>
  )
}

function registerBlocks(
  editor: Editor,
  config: {
    preset: EmailDesignerPreset
    theme?: Partial<EmailDesignerTheme>
    mergeFields: EmailMergeField[]
    collections: EmailCollection[]
    extraBlocks: EmailBlock[]
    copy: EmailDesignerCopy
  },
): void {
  const blocks = editor.BlockManager
  for (const block of [...blocksForPreset(config.preset, config.theme), ...config.extraBlocks]) {
    blocks.add(block.id, {
      label: block.label,
      category: block.category,
      content: block.content,
    })
  }
  for (const field of config.mergeFields) {
    const content = mergeFieldBlockHtml(field)
    if (!content) continue
    blocks.add(`token:${field.key}`, {
      label: field.label || field.key,
      category: field.group || config.copy.fieldsCategory,
      content,
    })
  }
  for (const collection of config.collections) {
    const content = collectionTableBlockHtml(collection, config.theme)
    if (!content) continue
    blocks.add(`table:${collection.key}`, {
      label: `${collection.label} table`,
      category: config.copy.tablesCategory,
      content,
    })
  }
}

function seedCanvas(
  editor: Editor,
  initialHtml: string | null | undefined,
  preset: EmailDesignerPreset,
  theme?: Partial<EmailDesignerTheme>,
): void {
  const starter = starterHtml(preset, theme)
  try {
    editor.setComponents(initialHtml?.trim() ? initialHtml : starter)
  } catch {
    // A saved design that no longer parses must not leave a blank editor.
    try {
      editor.setComponents(starter)
    } catch {
      /* nothing further to try */
    }
  }
}
