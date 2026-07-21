'use client'

import { GeneratedText } from './generated-copy'

// SketchPad — a comprehensive freehand drawing / diagram canvas built on
// Excalidraw (shapes, arrows, text, freehand, images). Used by the form
// `sketch` element (e.g. a lift-plan diagram). Outputs a PNG data-url plus the
// editable Excalidraw scene so the drawing can be re-opened and amended.
//
// Excalidraw touches `window` at module scope, so it is mounted lazily on the
// client. The heavy bundle only downloads when a sketch element renders.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ExcalidrawInitialDataState, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'

const Excalidraw = lazy(async () => ({ default: (await import('@excalidraw/excalidraw')).Excalidraw }))

// The editable scene we persist alongside the rendered PNG. Opaque JSON —
// handed straight back to Excalidraw's `initialData` to re-hydrate.
export type SketchScene = {
  elements?: readonly unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

export type SketchPadProps = {
  /** Previously-saved scene to re-open, or null for a blank canvas. */
  initialScene?: SketchScene | null
  /**
   * Called (debounced) after edits settle. `dataUrl` is a PNG of the drawing,
   * or null when the canvas is empty; `scene` is the editable Excalidraw state.
   */
  onChange: (dataUrl: string | null, scene: SketchScene) => void
  /** Canvas height in CSS pixels. Default 440. */
  height?: number
  /** When true, the canvas is non-editable (Excalidraw view mode). */
  readOnly?: boolean
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function SketchPad({
  initialScene,
  onChange,
  height = 440,
  readOnly = false,
}: SketchPadProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, appState, files) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        const live = elements.filter((el) => !el.isDeleted)
        const scene: SketchScene = {
          elements: live,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          files,
        }
        if (live.length === 0) {
          onChange(null, scene)
          return
        }
        try {
          const { exportToBlob } = await import('@excalidraw/excalidraw')
          const blob = await exportToBlob({
            elements: live,
            appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
            files,
            mimeType: 'image/png',
            quality: 0.92,
          })
          onChange(await blobToDataUrl(blob), scene)
        } catch (err) {
          console.warn('[sketch] export failed', err)
        }
      }, 700)
    },
    [onChange],
  )

  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-md border border-border"
    >
      {mounted ? <Suspense fallback={<SketchLoading />}><Excalidraw
          initialData={initialScene ? (initialScene as unknown as ExcalidrawInitialDataState) : undefined}
          viewModeEnabled={readOnly}
          onChange={handleChange}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        /></Suspense> : <SketchLoading />}
    </div>
  )
}

function SketchLoading() {
  return <div className="flex h-full w-full items-center justify-center text-sm text-fg-muted"><GeneratedText id="m_0839e554b28c58" /></div>
}
