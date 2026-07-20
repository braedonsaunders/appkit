'use client'

import * as React from 'react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, addEdge, useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Plus, Trash2, Workflow } from 'lucide-react'
import { Badge, Button, Card, CardContent, cn } from '@appkit/ui'
import { lintWorkflowGraph, removeWorkflowNode, updateWorkflowNode, workflowNodeId, type WorkflowGraph, type WorkflowNodeData, type WorkflowNodeDefinition } from './workflow'

type CanvasData<TData extends WorkflowNodeData> = { workflow: TData; definition: WorkflowNodeDefinition<TData>; selected: boolean }
type CanvasNode<TData extends WorkflowNodeData> = Node<CanvasData<TData>>

export type WorkflowBuilderProps<TData extends WorkflowNodeData> = {
  value: WorkflowGraph<TData>
  onChange: (graph: WorkflowGraph<TData>) => void
  definitions: readonly WorkflowNodeDefinition<TData>[]
  renderInspector: (input: { node: { id: string; data: TData }; update: (data: TData) => void; remove: () => void }) => React.ReactNode
  validate?: (graph: WorkflowGraph<TData>) => string[]
  className?: string
  readOnly?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

function WorkflowCard<TData extends WorkflowNodeData>({ data }: NodeProps<CanvasNode<TData>>) {
  const branches = data.definition.branches ?? ['next']
  return <Card className={cn('min-w-48 border bg-surface shadow-sm', data.selected ? 'border-primary ring-2 ring-ring/20' : 'border-border')}><Handle type="target" position={Position.Top} className="!size-2.5 !border-surface !bg-fg-subtle" /><CardContent className="p-3"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded bg-primary-subtle text-primary"><Workflow className="size-4" /></span><div className="min-w-0"><div className="truncate text-sm font-semibold text-fg">{data.workflow.label || data.definition.label}</div><div className="truncate text-[11px] text-fg-muted">{data.definition.label}</div></div></div></CardContent>{branches.map((branch, index) => <Handle key={branch} id={branch} type="source" position={Position.Bottom} style={{ left: `${((index + 1) / (branches.length + 1)) * 100}%` }} className="!size-2.5 !border-surface !bg-primary" />)}</Card>
}

const nodeTypes = { workflow: WorkflowCard }

export function WorkflowBuilder<TData extends WorkflowNodeData>({ value, onChange, definitions, renderInspector, validate, className, readOnly = false, emptyTitle = 'Build the workflow', emptyDescription = 'Add a trigger or action from the library.' }: WorkflowBuilderProps<TData>) {
  const [selectedId, setSelectedId] = React.useState<string | null>(value.nodes[0]?.id ?? null)
  const definitionMap = React.useMemo(() => new Map(definitions.map((definition) => [definition.kind, definition])), [definitions])
  const makeNodes = React.useCallback((graph: WorkflowGraph<TData>): CanvasNode<TData>[] => graph.nodes.flatMap((node) => { const definition = definitionMap.get(node.data.kind); return definition ? [{ id: node.id, type: 'workflow', position: node.position, data: { workflow: node.data, definition, selected: node.id === selectedId } }] : [] }), [definitionMap, selectedId])
  const makeEdges = React.useCallback((graph: WorkflowGraph<TData>): Edge[] => graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? 'next', label: edge.sourceHandle && edge.sourceHandle !== 'next' ? edge.sourceHandle : undefined })), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode<TData>>(makeNodes(value))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(makeEdges(value))
  React.useEffect(() => setNodes(makeNodes(value)), [makeNodes, setNodes, value])
  React.useEffect(() => setEdges(makeEdges(value)), [makeEdges, setEdges, value])
  const selected = value.nodes.find((node) => node.id === selectedId)
  const errors = (validate ?? ((graph: WorkflowGraph<TData>) => lintWorkflowGraph(graph, definitions)))(value)

  const commitCanvas = React.useCallback((nextNodes: CanvasNode<TData>[], nextEdges: Edge[]) => onChange({ schemaVersion: 1, nodes: nextNodes.map((node) => ({ id: node.id, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) }, data: node.data.workflow })), edges: nextEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? 'next' })) }), [onChange])
  const connect = React.useCallback((connection: Connection) => { if (readOnly) return; const next = addEdge({ ...connection, id: `edge_${globalThis.crypto.randomUUID()}` }, edges); setEdges(next); commitCanvas(nodes, next) }, [commitCanvas, edges, nodes, readOnly, setEdges])
  const add = (definition: WorkflowNodeDefinition<TData>) => { const id = workflowNodeId(String(definition.kind)); const node = { id, position: { x: 140 + (value.nodes.length % 3) * 230, y: 80 + Math.floor(value.nodes.length / 3) * 150 }, data: definition.create() }; onChange({ ...value, nodes: [...value.nodes, node] }); setSelectedId(id) }

  return <div className={cn('flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-bg lg:flex-row', className)}>
    <aside className="flex h-72 min-h-0 w-full shrink-0 flex-col border-b border-border bg-surface lg:h-auto lg:w-1/3 lg:min-w-80 lg:max-w-[26rem] lg:border-r lg:border-b-0">
      <div className="shrink-0 border-b border-border p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-fg">Workflow</h2><p className="text-xs text-fg-muted">Nodes and configuration</p></div><Badge variant={errors.length ? 'warning' : 'success'}>{errors.length ? `${errors.length} issues` : 'Valid'}</Badge></div></div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto">
        {selected ? <div className="p-4">{renderInspector({ node: selected, update: (data) => onChange(updateWorkflowNode(value, selected.id, data)), remove: () => { onChange(removeWorkflowNode(value, selected.id)); setSelectedId(null) } })}<Button type="button" variant="destructive" size="sm" className="mt-4 w-full" disabled={readOnly} onClick={() => { onChange(removeWorkflowNode(value, selected.id)); setSelectedId(null) }}><Trash2 className="size-4" />Remove node</Button></div> : <div className="p-4"><h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Node library</h3><div className="space-y-2">{definitions.map((definition) => <button key={String(definition.kind)} type="button" disabled={readOnly} onClick={() => add(definition)} className="flex w-full items-start gap-3 rounded-md border border-border bg-bg p-3 text-left transition-colors hover:border-primary hover:bg-primary-subtle disabled:opacity-50"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded bg-primary-subtle text-primary"><Plus className="size-4" /></span><span><span className="block text-sm font-medium text-fg">{definition.label}</span>{definition.description ? <span className="mt-0.5 block text-xs text-fg-muted">{definition.description}</span> : null}</span></button>)}</div></div>}
      </div>
      {selected ? <div className="shrink-0 border-t border-border p-3"><Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setSelectedId(null)}><Plus className="size-4" />Add another node</Button></div> : null}
    </aside>
    <section className="relative min-h-[28rem] min-w-0 flex-1 bg-bg-subtle">
      {value.nodes.length === 0 ? <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8"><div className="max-w-sm text-center"><Workflow className="mx-auto mb-3 size-9 text-fg-subtle" /><h3 className="font-semibold text-fg">{emptyTitle}</h3><p className="mt-1 text-sm text-fg-muted">{emptyDescription}</p></div></div> : null}
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onNodeClick={(_, node) => setSelectedId(node.id)} onNodeDragStop={(_, dragged) => { const next = nodes.map((node) => node.id === dragged.id ? { ...node, position: dragged.position } : node); setNodes(next); commitCanvas(next, edges) }} nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable><Background color="var(--color-border-strong)" gap={20} size={1} /><MiniMap pannable zoomable className="!border !border-border !bg-surface" nodeColor="var(--color-primary-subtle)" maskColor="color-mix(in oklab, var(--color-bg) 70%, transparent)" /><Controls className="!border-border !bg-surface !shadow-sm" /></ReactFlow>
      {errors.length ? <div className="absolute right-3 bottom-3 z-10 max-w-sm rounded-md border border-warning bg-warning-subtle p-3 shadow-sm"><div className="flex gap-2 text-xs text-warning"><AlertTriangle className="size-4 shrink-0" /><span>{errors[0]}{errors.length > 1 ? ` and ${errors.length - 1} more` : ''}</span></div></div> : null}
    </section>
  </div>
}
