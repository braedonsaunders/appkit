'use client'

import * as React from 'react'
import { Input, Label, Select, Textarea } from '@appkit/ui'
import { WorkflowBuilder, type WorkflowGraph, type WorkflowNodeDefinition } from '@appkit/workflows'

type DemoNode = { kind: 'trigger' | 'condition' | 'gate' | 'action'; label: string; event?: string; expression?: string; assignee?: string; action?: string; message?: string }
const definitions: WorkflowNodeDefinition<DemoNode>[] = [
  { kind: 'trigger', label: 'Trigger', description: 'Start from a record or schedule event.', branches: ['next'], create: () => ({ kind: 'trigger', label: 'Project submitted', event: 'project.submitted' }) },
  { kind: 'condition', label: 'Condition', description: 'Route records using a governed rule.', branches: ['then', 'else'], create: () => ({ kind: 'condition', label: 'Value over $500k', expression: 'contractValue > 500000' }) },
  { kind: 'gate', label: 'Approval gate', description: 'Pause until an assignee approves or rejects.', branches: ['approve', 'reject'], create: () => ({ kind: 'gate', label: 'Executive approval', assignee: 'Executive team' }) },
  { kind: 'action', label: 'Action', description: 'Notify, update, export, or invoke an app adapter.', branches: ['next'], create: () => ({ kind: 'action', label: 'Notify project team', action: 'notify', message: 'The project was approved.' }) },
]

const initial: WorkflowGraph<DemoNode> = { schemaVersion: 1, nodes: [
  { id: 'trigger', position: { x: 120, y: 40 }, data: { kind: 'trigger', label: 'Project submitted', event: 'project.submitted' } },
  { id: 'condition', position: { x: 120, y: 190 }, data: { kind: 'condition', label: 'Value over $500k', expression: 'contractValue > 500000' } },
  { id: 'gate', position: { x: 20, y: 350 }, data: { kind: 'gate', label: 'Executive approval', assignee: 'Executive team' } },
  { id: 'action', position: { x: 300, y: 350 }, data: { kind: 'action', label: 'Notify project team', action: 'notify', message: 'The project can proceed.' } },
], edges: [{ id: 'e1', source: 'trigger', target: 'condition', sourceHandle: 'next' }, { id: 'e2', source: 'condition', target: 'gate', sourceHandle: 'then' }, { id: 'e3', source: 'condition', target: 'action', sourceHandle: 'else' }, { id: 'e4', source: 'gate', target: 'action', sourceHandle: 'approve' }] }

export function WorkflowWorkbench() {
  const [graph, setGraph] = React.useState(initial)
  return <WorkflowBuilder value={graph} onChange={setGraph} definitions={definitions} className="h-full" renderInspector={({ node, update }) => <div className="space-y-4"><div><Label htmlFor="node-label">Label</Label><Input id="node-label" value={node.data.label} onChange={(event) => update({ ...node.data, label: event.target.value })} /></div>{node.data.kind === 'trigger' ? <div><Label htmlFor="event">Event</Label><Select id="event" value={node.data.event} onChange={(event) => update({ ...node.data, event: event.target.value })}><option value="project.submitted">Project submitted</option><option value="project.updated">Project updated</option><option value="scheduled">Scheduled</option></Select></div> : null}{node.data.kind === 'condition' ? <div><Label htmlFor="expression">Rule</Label><Input id="expression" value={node.data.expression} onChange={(event) => update({ ...node.data, expression: event.target.value })} /></div> : null}{node.data.kind === 'gate' ? <div><Label htmlFor="assignee">Assignee</Label><Select id="assignee" value={node.data.assignee} onChange={(event) => update({ ...node.data, assignee: event.target.value })}><option>Executive team</option><option>Project managers</option><option>Record owner</option></Select></div> : null}{node.data.kind === 'action' ? <><div><Label htmlFor="action">Action</Label><Select id="action" value={node.data.action} onChange={(event) => update({ ...node.data, action: event.target.value })}><option value="notify">Send notification</option><option value="set_field">Update field</option><option value="export_pdf">Create PDF</option></Select></div><div><Label htmlFor="message">Message</Label><Textarea id="message" value={node.data.message} onChange={(event) => update({ ...node.data, message: event.target.value })} /></div></> : null}</div>} />
}
