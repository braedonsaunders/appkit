'use client'

import * as React from 'react'
import { Alert, AlertDescription, Button } from '@appkit/ui'
import { Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { hexColor } from '@appkit/tokens'
import type { DesignArtboard, DesignData, DesignElement } from './schema'
import { loadFabric } from './fabric'

const PPI = 96
const ZOOM_MIN = 0.1
const ZOOM_MAX = 4

const clampZoom = (zoom: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom * 1000) / 1000))

export type DesignZoom = {
  viewportRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  fitMode: boolean
  fullscreen: boolean
  setFullscreen: React.Dispatch<React.SetStateAction<boolean>>
  zoomBy: (factor: number) => void
  zoomTo: (value: number) => void
  fitToWindow: () => void
}

/** Fabric zoom and viewport behavior shared by the design-document editor. */
export function useDesignZoom({
  artboard,
  reattachKey,
}: {
  artboard: Pick<DesignArtboard, 'width' | 'height'> | null
  reattachKey: unknown
}): DesignZoom {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [fitMode, setFitMode] = React.useState(true)
  const [fullscreen, setFullscreen] = React.useState(false)
  const artboardWidth = artboard?.width
  const artboardHeight = artboard?.height

  const computeFit = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !artboardWidth || !artboardHeight) return 1
    const availableWidth = Math.max(viewport.clientWidth - 120, 80)
    const availableHeight = Math.max(viewport.clientHeight - 120, 80)
    return clampZoom(Math.min(
      availableWidth / (artboardWidth * PPI),
      availableHeight / (artboardHeight * PPI),
    ))
  }, [artboardHeight, artboardWidth])

  React.useEffect(() => {
    if (!fitMode) return
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => setZoom(computeFit()))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [computeFit, fitMode, fullscreen])

  const zoomBy = React.useCallback((factor: number) => {
    setFitMode(false)
    setZoom((current) => clampZoom(current * factor))
  }, [])
  const zoomTo = React.useCallback((value: number) => {
    setFitMode(false)
    setZoom(clampZoom(value))
  }, [])
  const fitToWindow = React.useCallback(() => setFitMode(true), [])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setFitMode(false)
      setZoom((current) => clampZoom(current * (event.deltaY < 0 ? 1.08 : 1 / 1.08)))
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [reattachKey])

  React.useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  return { viewportRef, zoom, fitMode, fullscreen, setFullscreen, zoomBy, zoomTo, fitToWindow }
}

export function CanvasZoomControls({
  zoom,
  fitMode,
  fullscreen,
  zoomBy,
  zoomTo,
  fitToWindow,
  setFullscreen,
}: Omit<DesignZoom, 'viewportRef'>) {
  return <div className="flex items-center gap-1" aria-label="Canvas zoom controls">
    <Button type="button" variant="ghost" size="sm" onClick={() => zoomBy(1 / 1.2)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out"><ZoomOut size={14} /></Button>
    <button type="button" onClick={() => zoomTo(1)} title="Reset zoom to 100%" className="w-12 rounded px-1 py-1 text-center text-xs font-medium tabular-nums text-fg-muted hover:bg-surface-hover">{Math.round(zoom * 100)}%</button>
    <Button type="button" variant="ghost" size="sm" onClick={() => zoomBy(1.2)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in"><ZoomIn size={14} /></Button>
    <Button type="button" variant={fitMode ? 'secondary' : 'ghost'} size="sm" onClick={fitToWindow} aria-label="Fit artboard"><Scan size={14} /></Button>
    <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen(!fullscreen)} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Button>
  </div>
}

export type ArtboardCanvasProps = {
  artboard: DesignArtboard
  zoom: number
  data?: DesignData
  locale?: string
  selectedElementId: string | null
  onSelect: (id: string | null, userInitiated: boolean) => void
  onModify: (id: string, patch: Partial<DesignElement>) => void
}

/** Interactive Fabric canvas for the design-document editor. */
export function ArtboardCanvas({
  artboard,
  zoom,
  data = {},
  locale,
  selectedElementId,
  onSelect,
  onModify,
}: ArtboardCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const fabricRef = React.useRef<Awaited<ReturnType<typeof loadFabric>> | null>(null)
  const canvasInstanceRef = React.useRef<any>(null)
  const zoomRef = React.useRef(zoom)
  const [loadError, setLoadError] = React.useState(false)
  React.useEffect(() => { zoomRef.current = zoom }, [zoom])

  const imageCacheRef = React.useRef<Map<string, HTMLImageElement>>(new Map())
  const imageLoadingRef = React.useRef<Set<string>>(new Set())
  const [imageRevision, setImageRevision] = React.useState(0)
  const getImage = React.useCallback((source: string): HTMLImageElement | undefined => {
    const cached = imageCacheRef.current.get(source)
    if (cached) return cached
    if (!imageLoadingRef.current.has(source)) {
      imageLoadingRef.current.add(source)
      const image = new Image()
      image.onload = () => {
        imageCacheRef.current.set(source, image)
        imageLoadingRef.current.delete(source)
        setImageRevision((current) => current + 1)
      }
      image.onerror = () => imageLoadingRef.current.delete(source)
      image.src = source
    }
    return undefined
  }, [])

  const onSelectRef = React.useRef(onSelect)
  const onModifyRef = React.useRef(onModify)
  const initialRenderRef = React.useRef({ artboard, data, locale, selectedElementId, getImage })
  React.useEffect(() => {
    onSelectRef.current = onSelect
    onModifyRef.current = onModify
    initialRenderRef.current = { artboard, data, locale, selectedElementId, getImage }
  }, [artboard, data, getImage, locale, onModify, onSelect, selectedElementId])

  React.useEffect(() => {
    let disposed = false
    setLoadError(false)
    loadFabric().then((fabric) => {
      if (disposed || !canvasRef.current) return
      fabricRef.current = fabric
      const initial = initialRenderRef.current
      const canvas = new fabric.Canvas(canvasRef.current, {
        preserveObjectStacking: true,
        backgroundColor: initial.artboard.background,
        selection: true,
      })
      canvasInstanceRef.current = canvas
      canvas.on('selection:created', (event: any) => onSelectRef.current(idForObject(event.selected?.[0]), Boolean(event.e)))
      canvas.on('selection:updated', (event: any) => onSelectRef.current(idForObject(event.selected?.[0]), Boolean(event.e)))
      canvas.on('selection:cleared', (event: any) => onSelectRef.current(null, Boolean(event.e)))
      canvas.on('object:modified', (event: any) => {
        const object = event.target
        const id = idForObject(object)
        if (id && object) onModifyRef.current(id, objectPatch(object, PPI * zoomRef.current))
      })
      canvas.on('text:editing:exited', (event: any) => {
        const object = event.target
        const id = idForObject(object)
        if (!id || !object) return
        onModifyRef.current(id, {
          ...objectPatch(object, PPI * zoomRef.current),
          text: object.text ?? '',
        } as Partial<DesignElement>)
      })
      renderFabricArtboard(fabric, canvas, initial.artboard, initial.data, initial.locale, initial.selectedElementId, zoomRef.current, initial.getImage)
    }).catch(() => setLoadError(true))
    return () => {
      disposed = true
      canvasInstanceRef.current?.dispose()
      canvasInstanceRef.current = null
    }
  }, [artboard.id])

  React.useEffect(() => {
    const fabric = fabricRef.current
    const canvas = canvasInstanceRef.current
    if (!fabric || !canvas) return
    renderFabricArtboard(fabric, canvas, artboard, data, locale, selectedElementId, zoom, getImage)
  }, [artboard, data, getImage, imageRevision, locale, selectedElementId, zoom])

  if (loadError) return <Alert variant="destructive"><AlertDescription>The interactive canvas could not load. Install the optional Fabric peer to use this editor.</AlertDescription></Alert>

  return <div className="rounded-lg bg-border-subtle p-8 shadow-inner">
    <div className="overflow-hidden bg-surface shadow-lg ring-1 ring-border-strong">
      <canvas ref={canvasRef} aria-label={`${artboard.name} design canvas`} />
    </div>
  </div>
}

function renderFabricArtboard(
  fabric: Awaited<ReturnType<typeof loadFabric>>,
  canvas: any,
  artboard: DesignArtboard,
  data: DesignData,
  locale: string | undefined,
  selectedElementId: string | null,
  zoom: number,
  getImage: (source: string) => HTMLImageElement | undefined,
) {
  const scale = PPI * zoom
  canvas.clear()
  canvas.setDimensions({ width: artboard.width * scale, height: artboard.height * scale })
  canvas.backgroundColor = artboard.background
  for (const element of artboard.elements) {
    if (element.visible === false) continue
    const object = fabricObject(fabric, element, data, locale, scale, getImage)
    if (!object) continue
    object.set('appkitElementId', element.id)
    object.set({
      lockMovementX: element.locked,
      lockMovementY: element.locked,
      lockScalingX: element.locked,
      lockScalingY: element.locked,
      lockRotation: element.locked,
      selectable: !element.locked,
      evented: !element.locked,
    })
    canvas.add(object)
  }
  const active = canvas.getObjects().find((object: any) => idForObject(object) === selectedElementId)
  if (active) canvas.setActiveObject(active)
  canvas.requestRenderAll()
}

function fabricObject(
  fabric: Awaited<ReturnType<typeof loadFabric>>,
  element: DesignElement,
  data: DesignData,
  locale: string | undefined,
  scale: number,
  getImage: (source: string) => HTMLImageElement | undefined,
) {
  const base = {
    left: element.x * scale,
    top: element.y * scale,
    originX: 'left' as const,
    originY: 'top' as const,
    angle: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
  }
  const width = element.width * scale
  const height = element.height * scale
  if (element.kind === 'text' || element.kind === 'field') {
    return new fabric.Textbox(displayTextForElement(element, data, locale), {
      ...base,
      width,
      height,
      fontFamily: element.fontFamily ?? 'Arial, sans-serif',
      fontSize: (element.fontSize ?? 12) * (scale / 72),
      fontWeight: element.fontWeight ?? '600',
      fontStyle: element.fontStyle ?? 'normal',
      fill: element.color ?? hexColor('fg'),
      textAlign: element.align ?? 'left',
      editable: element.kind === 'text',
    })
  }
  if (element.kind === 'ellipse') return new fabric.Ellipse({ ...base, rx: width / 2, ry: height / 2, fill: element.fill ?? 'transparent', stroke: element.stroke ?? hexColor('border-strong'), strokeWidth: (element.strokeWidth ?? 0.01) * scale })
  if (element.kind === 'line') return new fabric.Line([0, 0, width, 0], { ...base, stroke: element.stroke ?? hexColor('fg'), strokeWidth: Math.max(1, (element.strokeWidth ?? 0.01) * scale) })
  if (element.kind === 'qr') {
    const value = resolveData(data, element.field)
    const source = typeof value === 'string' && value ? value : null
    const loaded = source ? getImage(source) : undefined
    if (loaded && loaded.naturalWidth > 0) {
      const FabricImage = (fabric as any).FabricImage ?? (fabric as any).Image
      return new FabricImage(loaded, { ...base, scaleX: width / loaded.naturalWidth, scaleY: height / loaded.naturalHeight })
    }
    const background = new fabric.Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width, height, fill: element.background ?? hexColor('surface'), stroke: hexColor('border-strong'), strokeWidth: 1 })
    const label = new fabric.Text('QR', { left: width / 2, top: height / 2, originX: 'center', originY: 'center', fill: element.foreground ?? hexColor('fg'), fontSize: Math.max(10, Math.min(width, height) / 4), fontWeight: '700' })
    return new fabric.Group([background, label], base)
  }
  if (element.kind === 'seal') {
    const diameter = Math.min(width, height)
    const circle = new fabric.Circle({ left: 0, top: 0, originX: 'left', originY: 'top', radius: diameter / 2, fill: element.fill ?? hexColor('primary'), stroke: element.stroke ?? hexColor('primary-active'), strokeWidth: 2 })
    const organization = resolveData(data, 'organization.name') ?? resolveData(data, 'tenant.name')
    const initials = String(organization ?? '').split(/\s+/).filter(Boolean).map((word) => word[0]?.toUpperCase()).slice(0, 2).join('')
    const label = new fabric.Text(element.text || initials || 'OK', { left: diameter / 2, top: diameter / 2, originX: 'center', originY: 'center', fill: hexColor('primary-fg'), fontSize: Math.max(10, diameter / 3.2), fontWeight: '800' })
    return new fabric.Group([circle, label], base)
  }
  if (element.kind === 'image') {
    const value = element.url?.trim() || (element.field ? resolveData(data, element.field) : null)
    const source = typeof value === 'string' && value ? value : null
    const loaded = source ? getImage(source) : undefined
    if (loaded && loaded.naturalWidth > 0) {
      const FabricImage = (fabric as any).FabricImage ?? (fabric as any).Image
      return new FabricImage(loaded, { ...base, scaleX: width / loaded.naturalWidth, scaleY: height / loaded.naturalHeight })
    }
    return new fabric.Rect({ ...base, width, height, fill: hexColor('bg-subtle'), stroke: hexColor('border-strong'), strokeDashArray: [6, 4], strokeWidth: 1, rx: (element.radius ?? 0) * scale, ry: (element.radius ?? 0) * scale })
  }
  return new fabric.Rect({ ...base, width, height, fill: element.fill ?? 'transparent', stroke: element.stroke ?? hexColor('border-strong'), strokeWidth: (element.strokeWidth ?? 0.01) * scale, rx: (element.radius ?? 0) * scale, ry: (element.radius ?? 0) * scale })
}

function objectPatch(object: any, scale: number): Partial<DesignElement> {
  return {
    x: roundInches((object.left ?? 0) / scale),
    y: roundInches((object.top ?? 0) / scale),
    width: roundInches(object.getScaledWidth() / scale),
    height: roundInches(object.getScaledHeight() / scale),
    rotation: Math.round(object.angle ?? 0),
  }
}

function idForObject(object: any): string | null {
  return object?.appkitElementId ?? object?.get?.('appkitElementId') ?? null
}

function displayTextForElement(element: Extract<DesignElement, { kind: 'text' | 'field' }>, data: DesignData, locale?: string): string {
  if (element.kind === 'text') return element.text
  const raw = resolveData(data, element.field) ?? element.fallback ?? element.field
  let value = String(raw)
  if (element.transform === 'uppercase') value = value.toLocaleUpperCase(locale)
  if (element.transform === 'date-long' || element.transform === 'date-short') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) value = new Intl.DateTimeFormat(locale, element.transform === 'date-long' ? { dateStyle: 'long' } : { dateStyle: 'medium' }).format(date)
  }
  return `${element.prefix ?? ''}${value}${element.suffix ?? ''}`
}

function resolveData(data: DesignData, field: string): unknown {
  return field.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, data)
}

function roundInches(value: number): number {
  return Math.round(value * 1000) / 1000
}
