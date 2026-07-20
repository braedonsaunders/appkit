import assert from 'node:assert/strict'
import test from 'node:test'
import { hasCycle, lintWorkflowGraph, removeWorkflowNode, type WorkflowGraph, type WorkflowNodeDefinition } from './index'

type Data = { kind: 'trigger' | 'action'; label: string }
const definitions: WorkflowNodeDefinition<Data>[] = [{ kind: 'trigger', label: 'Trigger', branches: ['next'], create: () => ({ kind: 'trigger', label: 'Trigger' }) }, { kind: 'action', label: 'Action', branches: [], create: () => ({ kind: 'action', label: 'Action' }) }]
const graph: WorkflowGraph<Data> = { schemaVersion: 1, nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } }, { id: 'b', position: { x: 0, y: 100 }, data: { kind: 'action', label: 'Send' } }], edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'next' }] }

test('valid graph round-trips and node removal also removes attached edges', () => { assert.deepEqual(lintWorkflowGraph(graph, definitions), []); assert.deepEqual(removeWorkflowNode(graph, 'a'), { schemaVersion: 1, nodes: [graph.nodes[1]], edges: [] }) })
test('cycle detection fails closed', () => { const cyclic = { ...graph, edges: [...graph.edges, { id: 'back', source: 'b', target: 'a' }] }; assert.equal(hasCycle(cyclic), true); assert.match(lintWorkflowGraph(cyclic, definitions).join(' '), /cycle/) })
