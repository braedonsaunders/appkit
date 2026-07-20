export type WorkflowNodeData = { kind: string; label?: string; [key: string]: unknown }
export type WorkflowNode<TData extends WorkflowNodeData = WorkflowNodeData> = { id: string; position: { x: number; y: number }; data: TData }
export type WorkflowEdge = { id: string; source: string; target: string; sourceHandle?: string }
export type WorkflowGraph<TData extends WorkflowNodeData = WorkflowNodeData> = { schemaVersion: 1; nodes: WorkflowNode<TData>[]; edges: WorkflowEdge[] }

export type WorkflowNodeDefinition<TData extends WorkflowNodeData = WorkflowNodeData> = {
  kind: TData['kind']
  label: string
  description?: string
  group?: string
  branches?: string[]
  create: () => TData
}

export const emptyWorkflowGraph = <TData extends WorkflowNodeData>(): WorkflowGraph<TData> => ({ schemaVersion: 1, nodes: [], edges: [] })
export const workflowNodeId = (kind: string) => `${kind}_${globalThis.crypto.randomUUID()}`

export function lintWorkflowGraph<TData extends WorkflowNodeData>(graph: WorkflowGraph<TData>, definitions: readonly WorkflowNodeDefinition<TData>[]): string[] {
  const errors: string[] = []
  const definitionMap = new Map(definitions.map((definition) => [definition.kind, definition]))
  const ids = new Set<string>()
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`)
    ids.add(node.id)
    if (!definitionMap.has(node.data.kind)) errors.push(`Node ${node.id} has unknown kind "${node.data.kind}"`)
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) errors.push(`Node ${node.id} has an invalid position`)
  }
  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate edge id: ${edge.id}`)
    edgeIds.add(edge.id)
    if (!ids.has(edge.source)) errors.push(`Edge ${edge.id} has an unknown source`)
    if (!ids.has(edge.target)) errors.push(`Edge ${edge.id} has an unknown target`)
    const source = graph.nodes.find((node) => node.id === edge.source)
    const branches = source ? definitionMap.get(source.data.kind)?.branches : undefined
    if (edge.sourceHandle && branches?.length && !branches.includes(edge.sourceHandle)) errors.push(`Edge ${edge.id} has an invalid source branch`)
  }
  if (hasCycle(graph)) errors.push('Workflow contains a cycle')
  return errors
}

export function hasCycle(graph: WorkflowGraph): boolean {
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  const visiting = new Set<string>(); const visited = new Set<string>()
  const walk = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of outgoing.get(id) ?? []) if (walk(next)) return true; visiting.delete(id); visited.add(id); return false }
  return graph.nodes.some((node) => walk(node.id))
}

export function removeWorkflowNode<TData extends WorkflowNodeData>(graph: WorkflowGraph<TData>, id: string): WorkflowGraph<TData> { return { ...graph, nodes: graph.nodes.filter((node) => node.id !== id), edges: graph.edges.filter((edge) => edge.source !== id && edge.target !== id) } }

export function updateWorkflowNode<TData extends WorkflowNodeData>(graph: WorkflowGraph<TData>, id: string, data: TData): WorkflowGraph<TData> { return { ...graph, nodes: graph.nodes.map((node) => node.id === id ? { ...node, data } : node) } }
