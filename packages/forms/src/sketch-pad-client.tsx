'use client'

import '@excalidraw/excalidraw/index.css'

// SketchPad — a comprehensive freehand drawing / diagram canvas built on
// Excalidraw (shapes, arrows, text, freehand, images). Used by the form
// `sketch` element (e.g. a lift-plan diagram). Outputs a PNG data-url plus the
// editable Excalidraw scene so the drawing can be re-opened and amended.
//
// Excalidraw touches `window` at module scope, so it is mounted lazily on the
// client. The heavy bundle only downloads when a sketch element renders.

import { useCallback, useRef } from 'react'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import type { ExcalidrawInitialDataState, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import type { SketchPadProps, SketchScene } from './sketch-pad'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function SketchPadClient({
  initialScene,
  onChange,
  readOnly = false,
}: SketchPadProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  return <Excalidraw
    initialData={initialScene ? (initialScene as unknown as ExcalidrawInitialDataState) : undefined}
    viewModeEnabled={readOnly}
    onChange={handleChange}
    UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
  />
}
