'use client'

import { lazy, Suspense, useEffect, useState } from 'react'
import { GeneratedText } from './generated-copy'

// The editable scene persisted alongside the rendered PNG. It remains opaque
// to AppKit and is handed back to the drawing engine when the field reopens.
export type SketchScene = {
  elements?: readonly unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

export type SketchPadProps = {
  initialScene?: SketchScene | null
  onChange: (dataUrl: string | null, scene: SketchScene) => void
  height?: number
  readOnly?: boolean
}

// Keep both the browser-only drawing engine and its package stylesheet behind
// the mounted boundary. Importing @appkit/forms therefore stays safe in Node,
// while applications that actually render a sketch receive the complete UI.
const SketchPadClient = lazy(() => import('./sketch-pad-client'))

export function SketchPad(props: SketchPadProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div
      style={{ height: props.height ?? 440 }}
      className="overflow-hidden rounded-md border border-border"
    >
      {mounted ? (
        <Suspense fallback={<SketchLoading />}>
          <SketchPadClient {...props} />
        </Suspense>
      ) : <SketchLoading />}
    </div>
  )
}

function SketchLoading() {
  return <div className="flex h-full w-full items-center justify-center text-sm text-fg-muted"><GeneratedText id="m_0839e554b28c58" /></div>
}
