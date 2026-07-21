'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Grid3X3, Layers3, Printer, Shapes, SlidersHorizontal } from 'lucide-react'
import { Select, cn } from '@appkit/ui'
import type { DesignArtboard, DesignData, DesignDocument, DesignElement, DesignFieldCatalog } from './schema'
import { DEFAULT_DESIGN_STUDIO_THEME, type DesignStudioTheme } from './defaults'
import {
  ArtboardCanvas,
  CanvasZoomControls,
  createDesignElement,
  InsertPanel,
  InspectorPanel,
  LayersPanel,
  PrintPanel,
  RailLabel,
  RailTabButton,
  uniqueElementId,
  useDesignZoom,
  type DesignFieldCatalog as EditorFieldCatalog,
} from './editor'

type StudioTab = 'inspector' | 'insert' | 'layers' | 'print'

export type DesignStudioEditorLabels = {
  inspector: string
  insert: string
  layers: string
  print: string
  artboards: string
}

const DEFAULT_LABELS: DesignStudioEditorLabels = {
  inspector: 'Inspector',
  insert: 'Insert',
  layers: 'Layers',
  print: 'Print',
  artboards: 'Artboards',
}

export type DesignStudioEditorProps = {
  document: DesignDocument
  onChange: (document: DesignDocument) => void
  catalog: DesignFieldCatalog
  data?: DesignData
  theme?: Partial<DesignStudioTheme>
  locale?: string
  labels?: Partial<DesignStudioEditorLabels>
  actions?: ReactNode
  className?: string
}

/**
 * Controlled document studio composed from the production Fabric artboard,
 * rail, layer, inspector, and print implementations. Applications retain
 * persistence ownership and provide only a field catalogue and sample data.
 */
export function DesignStudioEditor({
  document,
  onChange,
  catalog,
  data = {},
  theme: themeOverrides,
  labels: labelOverrides,
  actions,
  className,
}: DesignStudioEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const theme = { ...DEFAULT_DESIGN_STUDIO_THEME, ...themeOverrides }
  const documentRef = useRef(document)
  useEffect(() => { documentRef.current = document }, [document])
  const [activeArtboardId, setActiveArtboardId] = useState(document.artboards[0]?.id ?? '')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [tab, setTab] = useState<StudioTab>('layers')
  const artboard = document.artboards.find((item) => item.id === activeArtboardId) ?? document.artboards[0] ?? null
  const activeId = artboard?.id ?? ''
  const selectedElement = artboard?.elements.find((item) => item.id === selectedElementId) ?? null
  const { viewportRef, zoom, ...zoomControls } = useDesignZoom({ artboard, reattachKey: activeId })

  useEffect(() => {
    if (!artboard && document.artboards[0]) setActiveArtboardId(document.artboards[0].id)
  }, [artboard, document.artboards])

  const editorCatalog = useMemo<EditorFieldCatalog>(() => {
    const fields = catalog.fields
    const defaultField = fields[0]?.key ?? 'record.name'
    const sample = Object.fromEntries(fields.map((field) => [field.key, displayValue(data, field.key, field.example)]))
    return {
      options: fields.map((field) => ({ value: field.key, label: field.group ? `${field.group} · ${field.label}` : field.label })),
      sample,
      defaultField,
      imageSources: [
        ...fields.filter((field) => field.semanticType === 'image').map((field) => ({ value: 'field' as const, label: field.label })),
        { value: 'url' as const, label: 'Image URL' },
        { value: 'upload' as const, label: 'Uploaded image' },
      ],
    }
  }, [catalog.fields, data])

  function commit(mutator: (current: DesignDocument) => DesignDocument) {
    const next = mutator(documentRef.current)
    documentRef.current = next
    onChange(next)
  }

  function patchArtboard(patch: Partial<DesignArtboard>) {
    if (!activeId) return
    commit((current) => ({
      ...current,
      artboards: current.artboards.map((item) => item.id === activeId ? { ...item, ...patch } : item),
    }))
  }

  function patchElement(id: string, patch: Partial<DesignElement>) {
    if (!activeId) return
    commit((current) => ({
      ...current,
      artboards: current.artboards.map((item) => item.id === activeId
        ? { ...item, elements: item.elements.map((element) => element.id === id ? { ...element, ...patch } as DesignElement : element) }
        : item),
    }))
  }

  function addElement(kind: DesignElement['kind']) {
    if (!artboard) return
    const element = createDesignElement(kind, artboard.elements, catalog, theme)
    patchArtboard({ elements: [...artboard.elements, element] })
    setSelectedElementId(element.id)
    setTab('inspector')
  }

  function deleteSelected() {
    if (!artboard || !selectedElementId) return
    patchArtboard({ elements: artboard.elements.filter((element) => element.id !== selectedElementId) })
    setSelectedElementId(null)
  }

  function duplicateSelected() {
    if (!artboard || !selectedElement) return
    const copy = {
      ...selectedElement,
      id: uniqueElementId(selectedElement.id, artboard.elements),
      name: `${selectedElement.name} copy`,
      x: selectedElement.x + 0.08,
      y: selectedElement.y + 0.08,
    } as DesignElement
    patchArtboard({ elements: [...artboard.elements, copy] })
    setSelectedElementId(copy.id)
  }

  function moveSelected(edge: 'front' | 'back') {
    if (!artboard || !selectedElementId) return
    const selected = artboard.elements.find((element) => element.id === selectedElementId)
    if (!selected) return
    const rest = artboard.elements.filter((element) => element.id !== selectedElementId)
    patchArtboard({ elements: edge === 'front' ? [...rest, selected] : [selected, ...rest] })
  }

  if (!artboard) return null

  return (
    <div className={cn('grid min-h-[70vh] grid-cols-[minmax(260px,300px)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <aside className="flex min-h-0 flex-col border-r border-border">
        <div className="shrink-0 space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <RailLabel icon={<Grid3X3 size={13} />} label={document.name} />
            {actions}
          </div>
          {document.artboards.length > 1 ? (
            <Select value={activeId} onChange={(event) => { setActiveArtboardId(event.currentTarget.value); setSelectedElementId(null) }} aria-label={labels.artboards}>
              {document.artboards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          ) : null}
          <div className="grid grid-cols-4 gap-1.5">
            <RailTabButton active={tab === 'inspector'} label={labels.inspector} icon={<SlidersHorizontal size={14} />} onClick={() => setTab('inspector')} />
            <RailTabButton active={tab === 'insert'} label={labels.insert} icon={<Shapes size={14} />} onClick={() => setTab('insert')} />
            <RailTabButton active={tab === 'layers'} label={labels.layers} icon={<Layers3 size={14} />} onClick={() => setTab('layers')} />
            <RailTabButton active={tab === 'print'} label={labels.print} icon={<Printer size={14} />} onClick={() => setTab('print')} />
          </div>
        </div>
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'insert' ? <InsertPanel onAdd={addElement} /> : null}
          {tab === 'layers' ? <LayersPanel artboard={artboard} selectedElementId={selectedElementId} onSelect={(id) => { setSelectedElementId(id); setTab('inspector') }} onDuplicate={duplicateSelected} onDelete={deleteSelected} onFront={() => moveSelected('front')} onBack={() => moveSelected('back')} /> : null}
          {tab === 'inspector' ? <InspectorPanel artboard={artboard} selectedElement={selectedElement} catalog={editorCatalog} onPatchArtboard={patchArtboard} onPatchElement={(patch) => selectedElement && patchElement(selectedElement.id, patch)} onDelete={deleteSelected} /> : null}
          {tab === 'print' ? <PrintPanel artboard={artboard} onPatchArtboard={patchArtboard} /> : null}
        </div>
      </aside>
      <section ref={viewportRef} className="relative grid min-h-0 min-w-0 place-items-center overflow-auto bg-surface-muted p-5">
        <div className="rounded-lg bg-surface-subtle p-8 shadow-inner">
          <ArtboardCanvas artboard={artboard} zoom={zoom} sample={editorCatalog.sample} selectedElementId={selectedElementId} onSelect={(id, userInitiated) => { setSelectedElementId(id); if (userInitiated && id) setTab('inspector') }} onModify={patchElement} />
        </div>
        <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-border bg-surface/95 px-1.5 py-1 shadow-sm">
          <CanvasZoomControls zoom={zoom} {...zoomControls} />
        </div>
      </section>
    </div>
  )
}

function displayValue(data: DesignData, key: string, fallback = ''): string {
  let current: unknown = data
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object') return fallback
    current = (current as Record<string, unknown>)[segment]
  }
  return current == null ? fallback : String(current)
}
