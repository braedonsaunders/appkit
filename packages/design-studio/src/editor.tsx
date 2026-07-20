'use client'

import * as React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BadgeCheck,
  BringToFront,
  Copy,
  FilePlus2,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  Lock,
  MousePointer2,
  Plus,
  Printer,
  QrCode,
  RectangleHorizontal,
  SendToBack,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  Switch,
  Textarea,
  cn,
} from '@appkit/ui'
import { hexColor } from '@appkit/tokens'
import {
  DESIGN_DOCUMENT_LIMITS,
  artboardSizeForFormat,
  validateDesignDocument,
  type ArtboardFormat,
  type DesignArtboard,
  type DesignData,
  type DesignDocument,
  type DesignElement,
  type DesignFieldCatalog,
  type DesignStudioTheme,
  type PrintProfile,
  type PrintProvider,
} from './schema'
import { PRINT_PROVIDERS, defaultPrintProfile } from './print'
import { ArtboardCanvas, CanvasZoomControls, useDesignZoom } from './canvas'

type RailTab = 'design' | 'insert' | 'layers' | 'inspector' | 'print'

export type DesignStudioEditorLabels = {
  design: string
  insert: string
  layers: string
  inspector: string
  print: string
  document: string
  artboards: string
  addArtboard: string
  duplicate: string
  delete: string
  bringToFront: string
  sendToBack: string
  canvasHint: string
  noSelection: string
  elementSettings: string
  printReady: string
  issue: string
  issues: string
}

const DEFAULT_LABELS: DesignStudioEditorLabels = {
  design: 'Design',
  insert: 'Insert',
  layers: 'Layers',
  inspector: 'Inspector',
  print: 'Print',
  document: 'Document',
  artboards: 'Artboards',
  addArtboard: 'Add artboard',
  duplicate: 'Duplicate',
  delete: 'Delete',
  bringToFront: 'Bring to front',
  sendToBack: 'Send to back',
  canvasHint: 'Click an element to edit it. Drag to move, use the handles to resize or rotate, and double-click text to edit inline.',
  noSelection: 'No element selected',
  elementSettings: 'Element settings',
  printReady: 'Print ready',
  issue: 'issue',
  issues: 'issues',
}

export type DesignStudioEditorProps = {
  document: DesignDocument
  onChange: (document: DesignDocument) => void
  catalog: DesignFieldCatalog
  data?: DesignData
  theme?: Partial<DesignStudioTheme>
  locale?: string
  labels?: Partial<DesignStudioEditorLabels>
  actions?: React.ReactNode
  className?: string
}

/**
 * Controlled, application-agnostic design-document workspace.
 * Applications own persistence and data catalogues; AppKit owns this package's
 * Fabric canvas, artboards, insertion, layers, inspector, zoom, and print UI.
 */
export function DesignStudioEditor({
  document,
  onChange,
  catalog,
  data = {},
  theme: themeOverrides,
  locale,
  labels: labelOverrides,
  actions,
  className,
}: DesignStudioEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const theme: DesignStudioTheme = {
    primary: themeOverrides?.primary ?? hexColor('primary'),
    accent: themeOverrides?.accent ?? hexColor('warning'),
    paper: themeOverrides?.paper ?? hexColor('surface'),
    ink: themeOverrides?.ink ?? hexColor('fg'),
    muted: themeOverrides?.muted ?? hexColor('fg-muted'),
    typeface: themeOverrides?.typeface,
  }
  const documentRef = React.useRef(document)
  React.useEffect(() => { documentRef.current = document }, [document])
  const [activeArtboardId, setActiveArtboardId] = React.useState(document.artboards[0]?.id ?? '')
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<RailTab>('layers')
  const activeArtboard = document.artboards.find((item) => item.id === activeArtboardId) ?? document.artboards[0] ?? null
  const activeId = activeArtboard?.id ?? ''
  const selectedElement = activeArtboard?.elements.find((item) => item.id === selectedElementId) ?? null
  const zoomState = useDesignZoom({ artboard: activeArtboard, reattachKey: activeId })
  const errors = validateDesignDocument(document, catalog)

  React.useEffect(() => {
    if (!activeArtboard && document.artboards[0]) setActiveArtboardId(document.artboards[0].id)
  }, [activeArtboard, document.artboards])

  function commit(mutator: (current: DesignDocument) => DesignDocument) {
    const next = mutator(documentRef.current)
    documentRef.current = next
    onChange(next)
  }

  function patchDocument(patch: Partial<DesignDocument>) {
    commit((current) => ({ ...current, ...patch }))
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
    if (!activeArtboard || activeArtboard.elements.length >= DESIGN_DOCUMENT_LIMITS.maxElementsPerArtboard) return
    const element = createDesignElement(kind, activeArtboard.elements, catalog, theme)
    patchArtboard({ elements: [...activeArtboard.elements, element] })
    setSelectedElementId(element.id)
    setTab('inspector')
  }

  function deleteSelected() {
    if (!selectedElement || !activeArtboard) return
    patchArtboard({ elements: activeArtboard.elements.filter((item) => item.id !== selectedElement.id) })
    setSelectedElementId(null)
  }

  function duplicateSelected() {
    if (!selectedElement || !activeArtboard || activeArtboard.elements.length >= DESIGN_DOCUMENT_LIMITS.maxElementsPerArtboard) return
    const clone = {
      ...selectedElement,
      id: uniqueDesignElementId(`${selectedElement.id}-copy`, activeArtboard.elements),
      name: `${selectedElement.name.slice(0, DESIGN_DOCUMENT_LIMITS.elementNameLength - 5).trimEnd()} copy`,
      x: selectedElement.x + 0.12,
      y: selectedElement.y + 0.12,
    } as DesignElement
    patchArtboard({ elements: [...activeArtboard.elements, clone] })
    setSelectedElementId(clone.id)
  }

  function moveSelected(direction: 'front' | 'back') {
    if (!selectedElement || !activeArtboard) return
    const rest = activeArtboard.elements.filter((item) => item.id !== selectedElement.id)
    patchArtboard({ elements: direction === 'front' ? [...rest, selectedElement] : [selectedElement, ...rest] })
  }

  function addArtboard() {
    if (document.artboards.length >= DESIGN_DOCUMENT_LIMITS.maxArtboards) return
    const id = uniqueId('artboard', document.artboards.map((item) => item.id))
    const size = artboardSizeForFormat('letter-landscape')
    const artboard: DesignArtboard = {
      id,
      name: `Artboard ${document.artboards.length + 1}`,
      format: 'letter-landscape',
      ...size,
      background: theme.paper,
      printProfile: defaultPrintProfile('letter'),
      elements: [],
    }
    commit((current) => ({ ...current, artboards: [...current.artboards, artboard] }))
    setActiveArtboardId(id)
    setSelectedElementId(null)
    setTab('design')
  }

  function duplicateArtboard() {
    if (!activeArtboard || document.artboards.length >= DESIGN_DOCUMENT_LIMITS.maxArtboards) return
    const id = uniqueId(`${activeArtboard.id}-copy`, document.artboards.map((item) => item.id))
    const usedElementIds: string[] = []
    const copy: DesignArtboard = {
      ...structuredClone(activeArtboard),
      id,
      name: `${activeArtboard.name.slice(0, DESIGN_DOCUMENT_LIMITS.artboardNameLength - 5).trimEnd()} copy`,
      elements: activeArtboard.elements.map((element) => {
        const nextId = uniqueId(`${id}-${element.id}`, usedElementIds)
        usedElementIds.push(nextId)
        return { ...element, id: nextId }
      }),
    }
    commit((current) => ({ ...current, artboards: [...current.artboards, copy] }))
    setActiveArtboardId(id)
    setSelectedElementId(null)
  }

  function deleteArtboard() {
    if (!activeArtboard || document.artboards.length <= 1) return
    const remaining = document.artboards.filter((item) => item.id !== activeArtboard.id)
    commit((current) => ({ ...current, artboards: current.artboards.filter((item) => item.id !== activeArtboard.id) }))
    setActiveArtboardId(remaining[0]!.id)
    setSelectedElementId(null)
  }

  if (!activeArtboard) return null

  return <div className={cn(
    'grid min-h-[34rem] overflow-hidden border border-border bg-surface lg:grid-cols-[minmax(330px,33%)_1fr]',
    zoomState.fullscreen ? 'fixed inset-0 z-50' : 'h-full rounded-lg shadow-sm',
    className,
  )}>
    <aside className="flex min-h-0 flex-col border-b border-border bg-surface lg:border-r lg:border-b-0">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{document.name}</div>
            <div className="text-xs text-fg-muted">{activeArtboard.width} × {activeArtboard.height} inches</div>
          </div>
          <Badge variant={errors.length ? 'warning' : 'success'}>{errors.length ? `${errors.length} ${errors.length === 1 ? labels.issue : labels.issues}` : labels.printReady}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1">
          <RailTabButton active={tab === 'design'} label={labels.design} onClick={() => setTab('design')} icon={<Settings2 size={14} />} />
          <RailTabButton active={tab === 'insert'} label={labels.insert} onClick={() => setTab('insert')} icon={<Sparkles size={14} />} />
          <RailTabButton active={tab === 'layers'} label={labels.layers} onClick={() => setTab('layers')} icon={<Layers3 size={14} />} />
          <RailTabButton active={tab === 'inspector'} label={labels.inspector} onClick={() => setTab('inspector')} icon={<MousePointer2 size={14} />} />
          <RailTabButton active={tab === 'print'} label={labels.print} onClick={() => setTab('print')} icon={<Printer size={14} />} />
        </div>
      </div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'design' ? <DesignPanel document={document} artboard={activeArtboard} labels={labels} onPatchDocument={patchDocument} onPatchArtboard={patchArtboard} onSelectArtboard={(id) => { setActiveArtboardId(id); setSelectedElementId(null) }} onAddArtboard={addArtboard} onDuplicateArtboard={duplicateArtboard} onDeleteArtboard={deleteArtboard} /> : null}
        {tab === 'insert' ? <InsertPanel onAdd={addElement} hint={labels.canvasHint} /> : null}
        {tab === 'layers' ? <LayersPanel artboard={activeArtboard} selectedElementId={selectedElementId} labels={labels} onSelect={(id) => { setSelectedElementId(id); setTab('inspector') }} onDuplicate={duplicateSelected} onDelete={deleteSelected} onFront={() => moveSelected('front')} onBack={() => moveSelected('back')} /> : null}
        {tab === 'inspector' ? <InspectorPanel artboard={activeArtboard} selectedElement={selectedElement} catalog={catalog} labels={labels} onPatchArtboard={patchArtboard} onPatchElement={(patch) => selectedElement && patchElement(selectedElement.id, patch)} onDelete={deleteSelected} /> : null}
        {tab === 'print' ? <PrintPanel artboard={activeArtboard} onPatchArtboard={patchArtboard} /> : null}
      </div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col bg-bg-subtle">
      <div className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden border-b border-border bg-surface px-4">
        <div className="min-w-0 overflow-hidden">
          <div className="truncate text-sm font-semibold text-fg">{activeArtboard.name}</div>
          <div className="truncate text-xs text-fg-muted">{selectedElement ? `${selectedElement.name} · ${selectedElement.kind}` : labels.noSelection}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button type="button" variant="ghost" size="sm" onClick={() => setTab('insert')}><Plus size={14} />{labels.insert}</Button>
          <CanvasZoomControls zoom={zoomState.zoom} fitMode={zoomState.fitMode} fullscreen={zoomState.fullscreen} zoomBy={zoomState.zoomBy} zoomTo={zoomState.zoomTo} fitToWindow={zoomState.fitToWindow} setFullscreen={zoomState.setFullscreen} />
        </div>
      </div>
      <div ref={zoomState.viewportRef} className="app-scroll min-h-0 flex-1 overflow-auto p-5">
        <div className="flex min-h-full min-w-fit items-center justify-center">
          <ArtboardCanvas
            key={activeArtboard.id}
            artboard={activeArtboard}
            zoom={zoomState.zoom}
            data={data}
            locale={locale}
            selectedElementId={selectedElementId}
            onSelect={(id, userInitiated) => {
              setSelectedElementId(id)
              if (id && userInitiated) setTab('inspector')
            }}
            onModify={patchElement}
          />
        </div>
      </div>
    </section>
  </div>
}

export function DesignPanel({
  document,
  artboard,
  labels,
  onPatchDocument,
  onPatchArtboard,
  onSelectArtboard,
  onAddArtboard,
  onDuplicateArtboard,
  onDeleteArtboard,
}: {
  document: DesignDocument
  artboard: DesignArtboard
  labels: DesignStudioEditorLabels
  onPatchDocument: (patch: Partial<DesignDocument>) => void
  onPatchArtboard: (patch: Partial<DesignArtboard>) => void
  onSelectArtboard: (id: string) => void
  onAddArtboard: () => void
  onDuplicateArtboard: () => void
  onDeleteArtboard: () => void
}) {
  function changeFormat(format: ArtboardFormat) {
    const size = format === 'custom' ? { width: artboard.width, height: artboard.height } : artboardSizeForFormat(format)
    onPatchArtboard({ format, ...size, printProfile: defaultPrintProfile(format.startsWith('cr80') ? 'cr80' : format === 'custom' ? 'custom' : 'letter') })
  }
  return <div className="space-y-4">
    <RailLabel label={labels.document} icon={<Grid3X3 size={14} />} />
    <Field label="Document name"><Input value={document.name} maxLength={DESIGN_DOCUMENT_LIMITS.documentNameLength} onChange={(event) => onPatchDocument({ name: event.currentTarget.value })} /></Field>
    <Field label="DPI"><Input type="number" min={72} max={300} value={document.dpi} onChange={(event) => onPatchDocument({ dpi: Number(event.currentTarget.value) })} /></Field>
    <div className="border-t border-border pt-4">
      <RailLabel label={labels.artboards} icon={<Layers3 size={14} />} />
      <div className="mt-3 space-y-3">
        <Field label="Active artboard"><Select value={artboard.id} onChange={(event) => onSelectArtboard(event.currentTarget.value)}>{document.artboards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <div className="grid grid-cols-3 gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onAddArtboard} disabled={document.artboards.length >= DESIGN_DOCUMENT_LIMITS.maxArtboards} title={labels.addArtboard}><FilePlus2 size={14} /></Button>
          <Button type="button" variant="outline" size="sm" onClick={onDuplicateArtboard} disabled={document.artboards.length >= DESIGN_DOCUMENT_LIMITS.maxArtboards} title={labels.duplicate}><Copy size={14} /></Button>
          <Button type="button" variant="outline" size="sm" onClick={onDeleteArtboard} disabled={document.artboards.length <= 1} title={labels.delete}><Trash2 size={14} /></Button>
        </div>
        <Field label="Artboard name"><Input value={artboard.name} maxLength={DESIGN_DOCUMENT_LIMITS.artboardNameLength} onChange={(event) => onPatchArtboard({ name: event.currentTarget.value })} /></Field>
        <Field label="Format"><Select value={artboard.format} onChange={(event) => changeFormat(event.currentTarget.value as ArtboardFormat)}><option value="letter-landscape">Letter landscape</option><option value="letter-portrait">Letter portrait</option><option value="cr80-front">CR80 front</option><option value="cr80-back">CR80 back</option><option value="label-4x6">4 × 6 label</option><option value="custom">Custom</option></Select></Field>
        <ColorField label="Background" value={artboard.background} onChange={(background) => onPatchArtboard({ background })} />
        <div className="grid grid-cols-2 gap-2"><NumberField label="Width" value={artboard.width} onChange={(width) => onPatchArtboard({ width, format: 'custom' })} /><NumberField label="Height" value={artboard.height} onChange={(height) => onPatchArtboard({ height, format: 'custom' })} /></div>
        <NumberField label="Bleed" value={artboard.bleed ?? 0} step={0.01} onChange={(bleed) => onPatchArtboard({ bleed })} />
      </div>
    </div>
  </div>
}

export function InsertPanel({ onAdd, hint }: { onAdd: (kind: DesignElement['kind']) => void; hint: string }) {
  const buttons: { kind: DesignElement['kind']; label: string; icon: React.ReactNode }[] = [
    { kind: 'text', label: 'Text box', icon: <Type size={15} /> },
    { kind: 'field', label: 'Data field', icon: <BadgeCheck size={15} /> },
    { kind: 'rect', label: 'Rectangle', icon: <RectangleHorizontal size={15} /> },
    { kind: 'ellipse', label: 'Ellipse', icon: <BadgeCheck size={15} /> },
    { kind: 'line', label: 'Line', icon: <RectangleHorizontal size={15} /> },
    { kind: 'image', label: 'Image', icon: <ImageIcon size={15} /> },
    { kind: 'qr', label: 'QR code', icon: <QrCode size={15} /> },
    { kind: 'seal', label: 'Seal', icon: <BadgeCheck size={15} /> },
  ]
  return <div className="space-y-3"><RailLabel label="Insert element" icon={<Sparkles size={14} />} />{buttons.map((item) => <button key={item.kind} type="button" onClick={() => onAdd(item.kind)} className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm font-medium text-fg hover:bg-surface-hover">{item.icon}{item.label}</button>)}<div className="rounded-md border border-border bg-bg-subtle p-3 text-xs leading-5 text-fg-muted">{hint}</div></div>
}

export function LayersPanel({ artboard, selectedElementId, labels, onSelect, onDuplicate, onDelete, onFront, onBack }: { artboard: DesignArtboard; selectedElementId: string | null; labels: DesignStudioEditorLabels; onSelect: (id: string) => void; onDuplicate: () => void; onDelete: () => void; onFront: () => void; onBack: () => void }) {
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><RailLabel label={labels.layers} icon={<Layers3 size={14} />} /><Badge variant="secondary">{artboard.elements.length}</Badge></div>
    <div className="flex gap-1"><Button type="button" variant="outline" size="sm" onClick={onDuplicate} disabled={!selectedElementId} title={labels.duplicate}><Copy size={14} /></Button><Button type="button" variant="outline" size="sm" onClick={onFront} disabled={!selectedElementId} title={labels.bringToFront}><BringToFront size={14} /></Button><Button type="button" variant="outline" size="sm" onClick={onBack} disabled={!selectedElementId} title={labels.sendToBack}><SendToBack size={14} /></Button><Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={!selectedElementId} title={labels.delete}><Trash2 size={14} /></Button></div>
    <div className="space-y-1.5">{[...artboard.elements].reverse().map((element) => <button key={element.id} type="button" onClick={() => onSelect(element.id)} className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm', element.id === selectedElementId ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg hover:bg-surface-hover')}>{iconForElement(element)}<span className="min-w-0 flex-1 truncate">{element.name}</span>{element.visible === false ? <span className="text-xs text-fg-subtle">Hidden</span> : null}{element.locked ? <Lock size={12} className="text-fg-subtle" /> : null}</button>)}</div>
  </div>
}

export function InspectorPanel({ artboard, selectedElement, catalog, labels, onPatchArtboard, onPatchElement, onDelete }: { artboard: DesignArtboard; selectedElement: DesignElement | null; catalog: DesignFieldCatalog; labels: DesignStudioEditorLabels; onPatchArtboard: (patch: Partial<DesignArtboard>) => void; onPatchElement: (patch: Partial<DesignElement>) => void; onDelete: () => void }) {
  if (!selectedElement) return <div className="space-y-3"><div className="flex h-7 items-center justify-between gap-2"><RailLabel label="Artboard settings" icon={<Grid3X3 size={14} />} /><Badge variant="secondary">{labels.noSelection}</Badge></div><Field label="Name"><Input value={artboard.name} onChange={(event) => onPatchArtboard({ name: event.currentTarget.value })} /></Field><ColorField label="Background" value={artboard.background} onChange={(background) => onPatchArtboard({ background })} /></div>
  const fieldOptions = catalog.fields
  const isText = selectedElement.kind === 'text' || selectedElement.kind === 'field'
  return <div className="space-y-4">
    <div className="rounded-md border border-border bg-bg-subtle p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold text-fg">{iconForElement(selectedElement)}{kindLabel(selectedElement.kind)}</span><Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label="Delete element"><Trash2 size={14} className="text-danger" /></Button></div><p className="mt-1 text-xs leading-5 text-fg-muted">{kindHint(selectedElement.kind)}</p></div>
    <Field label="Layer name"><Input value={selectedElement.name} maxLength={DESIGN_DOCUMENT_LIMITS.elementNameLength} onChange={(event) => onPatchElement({ name: event.currentTarget.value })} /></Field>
    {selectedElement.kind === 'text' ? <Field label="Text"><Textarea rows={3} value={selectedElement.text} maxLength={DESIGN_DOCUMENT_LIMITS.textLength} onChange={(event) => onPatchElement({ text: event.currentTarget.value } as Partial<DesignElement>)} /></Field> : null}
    {selectedElement.kind === 'field' ? <><Field label="Data field"><Select value={selectedElement.field} onChange={(event) => onPatchElement({ field: event.currentTarget.value } as Partial<DesignElement>)}>{fieldOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</Select></Field><div className="grid grid-cols-2 gap-2"><Field label="Prefix"><Input value={selectedElement.prefix ?? ''} onChange={(event) => onPatchElement({ prefix: event.currentTarget.value } as Partial<DesignElement>)} /></Field><Field label="Suffix"><Input value={selectedElement.suffix ?? ''} onChange={(event) => onPatchElement({ suffix: event.currentTarget.value } as Partial<DesignElement>)} /></Field><Field label="Fallback"><Input value={selectedElement.fallback ?? ''} onChange={(event) => onPatchElement({ fallback: event.currentTarget.value } as Partial<DesignElement>)} /></Field><Field label="Transform"><Select value={selectedElement.transform ?? 'none'} onChange={(event) => onPatchElement({ transform: event.currentTarget.value as Extract<DesignElement, { kind: 'field' }>['transform'] } as Partial<DesignElement>)}><option value="none">As is</option><option value="uppercase">UPPERCASE</option><option value="date-long">Long date</option><option value="date-short">Short date</option></Select></Field></div></> : null}
    {selectedElement.kind === 'image' ? <><Field label="Image source"><Select value={selectedElement.url ? 'url' : selectedElement.field ?? 'url'} onChange={(event) => event.currentTarget.value === 'url' ? onPatchElement({ field: undefined, url: selectedElement.url ?? '' } as Partial<DesignElement>) : onPatchElement({ field: event.currentTarget.value, url: undefined } as Partial<DesignElement>)}><option value="url">Image URL</option>{fieldOptions.filter((field) => field.semanticType === 'image').map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</Select></Field>{selectedElement.field ? null : <Field label="Image URL"><Input value={selectedElement.url ?? ''} placeholder="https://…" maxLength={DESIGN_DOCUMENT_LIMITS.imageUrlLength} onChange={(event) => onPatchElement({ url: event.currentTarget.value } as Partial<DesignElement>)} /></Field>}<Field label="Fit"><Select value={selectedElement.fit ?? 'contain'} onChange={(event) => onPatchElement({ fit: event.currentTarget.value as 'cover' | 'contain' } as Partial<DesignElement>)}><option value="contain">Contain</option><option value="cover">Cover</option></Select></Field></> : null}
    {selectedElement.kind === 'qr' ? <><Field label="QR data field"><Select value={selectedElement.field} onChange={(event) => onPatchElement({ field: event.currentTarget.value } as Partial<DesignElement>)}>{fieldOptions.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</Select></Field><ColorField label="Foreground" value={selectedElement.foreground ?? hexColor('fg')} onChange={(foreground) => onPatchElement({ foreground } as Partial<DesignElement>)} /><ColorField label="Background" value={selectedElement.background ?? hexColor('surface')} onChange={(background) => onPatchElement({ background } as Partial<DesignElement>)} /></> : null}
    {selectedElement.kind === 'seal' ? <Field label="Seal text"><Input value={selectedElement.text ?? ''} onChange={(event) => onPatchElement({ text: event.currentTarget.value } as Partial<DesignElement>)} /></Field> : null}
    <div className="grid grid-cols-2 gap-2"><NumberField label="X" value={selectedElement.x} onChange={(x) => onPatchElement({ x })} /><NumberField label="Y" value={selectedElement.y} onChange={(y) => onPatchElement({ y })} /><NumberField label="Width" value={selectedElement.width} onChange={(width) => onPatchElement({ width })} /><NumberField label="Height" value={selectedElement.height} onChange={(height) => onPatchElement({ height })} /><NumberField label="Rotation" value={selectedElement.rotation ?? 0} step={1} onChange={(rotation) => onPatchElement({ rotation })} /><NumberField label="Opacity" value={selectedElement.opacity ?? 1} step={0.05} onChange={(opacity) => onPatchElement({ opacity })} /></div>
    {isText ? <><ColorField label="Text color" value={selectedElement.color ?? hexColor('fg')} onChange={(color) => onPatchElement({ color } as Partial<DesignElement>)} /><div className="grid grid-cols-2 gap-2"><NumberField label="Font size" value={selectedElement.fontSize ?? 12} step={1} onChange={(fontSize) => onPatchElement({ fontSize } as Partial<DesignElement>)} /><Field label="Weight"><Select value={selectedElement.fontWeight ?? '600'} onChange={(event) => onPatchElement({ fontWeight: event.currentTarget.value as '400' | '500' | '600' | '700' | '800' } as Partial<DesignElement>)}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></Select></Field></div><div className="grid grid-cols-3 gap-1"><Button type="button" variant={selectedElement.align === 'left' ? 'secondary' : 'outline'} size="sm" onClick={() => onPatchElement({ align: 'left' } as Partial<DesignElement>)}><AlignLeft size={14} /></Button><Button type="button" variant={selectedElement.align === 'center' ? 'secondary' : 'outline'} size="sm" onClick={() => onPatchElement({ align: 'center' } as Partial<DesignElement>)}><AlignCenter size={14} /></Button><Button type="button" variant={selectedElement.align === 'right' ? 'secondary' : 'outline'} size="sm" onClick={() => onPatchElement({ align: 'right' } as Partial<DesignElement>)}><AlignRight size={14} /></Button></div></> : null}
    {'fill' in selectedElement ? <ColorField label="Fill" value={selectedElement.fill ?? hexColor('surface')} onChange={(fill) => onPatchElement({ fill } as Partial<DesignElement>)} /> : null}
    {'stroke' in selectedElement ? <><ColorField label="Stroke" value={selectedElement.stroke ?? hexColor('border-strong')} onChange={(stroke) => onPatchElement({ stroke } as Partial<DesignElement>)} />{'strokeWidth' in selectedElement ? <NumberField label="Stroke width" value={selectedElement.strokeWidth ?? 0.01} step={0.01} onChange={(strokeWidth) => onPatchElement({ strokeWidth } as Partial<DesignElement>)} /> : null}</> : null}
    <LayerToggle checked={selectedElement.visible !== false} label="Visible" onChange={(visible) => onPatchElement({ visible })} />
    <LayerToggle checked={!selectedElement.locked} label={selectedElement.locked ? 'Locked' : 'Unlocked'} onChange={(unlocked) => onPatchElement({ locked: !unlocked })} icon={selectedElement.locked ? <Lock size={14} /> : <Unlock size={14} />} />
  </div>
}

export function PrintPanel({ artboard, onPatchArtboard }: { artboard: DesignArtboard; onPatchArtboard: (patch: Partial<DesignArtboard>) => void }) {
  const profile = artboard.printProfile ?? defaultPrintProfile(artboard.format.startsWith('cr80') ? 'cr80' : artboard.format === 'custom' ? 'custom' : 'letter')
  const patch = (value: Partial<PrintProfile>) => onPatchArtboard({ printProfile: { ...profile, ...value } })
  return <div className="space-y-4"><RailLabel label="Print output" icon={<Printer size={14} />} /><Field label="Provider"><Select value={profile.provider} onChange={(event) => patch({ provider: event.currentTarget.value as PrintProvider })}>{PRINT_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</Select></Field><Field label="Media"><Select value={profile.media} onChange={(event) => patch({ media: event.currentTarget.value as PrintProfile['media'] })}><option value="letter">Letter</option><option value="cr80">CR80 card</option><option value="custom">Custom</option></Select></Field><Field label="Orientation"><Select value={profile.orientation ?? 'landscape'} onChange={(event) => patch({ orientation: event.currentTarget.value as 'portrait' | 'landscape' })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select></Field><LayerToggle checked={profile.duplex === true} label="Duplex" onChange={(duplex) => patch({ duplex })} /><LayerToggle checked={profile.edgeToEdge !== false} label="Edge to edge" onChange={(edgeToEdge) => patch({ edgeToEdge })} /><div className="space-y-2">{PRINT_PROVIDERS.map((provider) => <div key={provider.id} className={cn('rounded-md border p-2 text-xs leading-5', provider.id === profile.provider ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg-muted')}><div className="font-semibold">{provider.label}</div><div>{provider.notes}</div>{provider.requiresLocalBridge ? <div className="mt-1 font-medium">Requires a local printer bridge.</div> : null}</div>)}</div></div>
}

export function RailTabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} title={label} aria-label={label} className={cn('grid h-9 place-items-center rounded-md border text-xs', active ? 'border-primary bg-primary-subtle text-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-hover')}>{icon}</button> }
export function RailLabel({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-fg-muted uppercase">{icon}{label}</div> }
export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-fg-muted">{label}</span>{children}</label> }
export function LayerToggle({ checked, label, onChange, icon }: { checked: boolean; label: string; onChange: (checked: boolean) => void; icon?: React.ReactNode }) { return <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-surface px-2.5 py-2 text-sm"><span className="flex min-w-0 items-center gap-2 text-fg">{icon}<span className="truncate">{label}</span></span><Switch checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const colorValue = /^#[0-9a-f]{6}$/i.test(value) ? value : hexColor('surface'); return <label className="flex items-center gap-2"><span className="w-20 text-xs font-medium text-fg-muted">{label}</span><input type="color" value={colorValue} onChange={(event) => onChange(event.currentTarget.value)} className="h-8 w-10 rounded border border-border bg-surface p-0.5" /><Input value={value} maxLength={32} onChange={(event) => onChange(event.currentTarget.value)} className="h-8" /></label> }
function NumberField({ label, value, step = 0.01, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) { return <Field label={label}><Input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.currentTarget.value))} /></Field> }

function iconForElement(element: DesignElement): React.ReactNode { if (element.kind === 'text') return <Type size={14} />; if (element.kind === 'field') return <BadgeCheck size={14} />; if (element.kind === 'image') return <ImageIcon size={14} />; if (element.kind === 'qr') return <QrCode size={14} />; return <RectangleHorizontal size={14} /> }
function kindLabel(kind: DesignElement['kind']): string { return ({ text: 'Text box', field: 'Data field', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', image: 'Image', qr: 'QR code', seal: 'Seal' })[kind] }
function kindHint(kind: DesignElement['kind']): string { return ({ text: 'Fixed text. Double-click it on the canvas to edit inline.', field: 'A placeholder filled from application data when the document is generated.', rect: 'A decorative frame, band, or panel.', ellipse: 'A decorative circle or oval.', line: 'A divider or signature rule.', image: 'An image loaded from a field or URL.', qr: 'A QR placeholder bound to an application data field.', seal: 'A round badge for issuer or approval marks.' })[kind] }

export function createDesignElement(kind: DesignElement['kind'], existing: DesignElement[], catalog: DesignFieldCatalog, theme: DesignStudioTheme): DesignElement {
  const id = uniqueDesignElementId(kind, existing)
  const defaultField = catalog.fields[0]?.key ?? 'record.name'
  const defaultImage = catalog.fields.find((field) => field.semanticType === 'image')?.key
  const defaultQr = catalog.fields.find((field) => field.semanticType === 'qr')?.key ?? defaultField
  const base = { id, name: kindLabel(kind), x: 0.55, y: 0.55, width: kind === 'qr' || kind === 'seal' ? 0.8 : 2.2, height: kind === 'qr' || kind === 'seal' ? 0.8 : 0.45, visible: true, opacity: 1 }
  if (kind === 'text') return { ...base, kind, text: 'New text', fontFamily: theme.typeface ?? 'Arial, sans-serif', fontSize: 16, fontWeight: '700', color: theme.ink, align: 'left' }
  if (kind === 'field') return { ...base, kind, field: defaultField, fontFamily: theme.typeface ?? 'Arial, sans-serif', fontSize: 16, fontWeight: '700', color: theme.ink, align: 'left', transform: 'none' }
  if (kind === 'image') return { ...base, kind, field: defaultImage, fit: 'contain', radius: 0.04 }
  if (kind === 'qr') return { ...base, kind, field: defaultQr, background: theme.paper, foreground: theme.ink }
  if (kind === 'seal') return { ...base, kind, fill: theme.accent, stroke: theme.primary, text: '' }
  if (kind === 'ellipse') return { ...base, kind, fill: theme.paper, stroke: theme.primary, strokeWidth: 0.01 }
  if (kind === 'line') return { ...base, kind, height: 0.01, fill: 'transparent', stroke: theme.ink, strokeWidth: 0.01 }
  return { ...base, kind: 'rect', fill: theme.paper, stroke: theme.primary, strokeWidth: 0.01, radius: 0.03 }
}

export function uniqueDesignElementId(base: string, elements: DesignElement[]): string {
  return uniqueId(base, elements.map((item) => item.id))
}

function uniqueId(base: string, usedIds: string[]): string {
  const used = new Set(usedIds)
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'item'
  if (!used.has(clean)) return clean
  let index = 2
  while (used.has(`${clean}-${index}`)) index += 1
  return `${clean}-${index}`
}
