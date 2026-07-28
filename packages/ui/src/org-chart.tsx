'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { Avatar } from './avatar'
import { Badge, type BadgeProps } from './badge'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { cn } from './utils'

/** One record in a reporting hierarchy. `parentId` is the formal manager. */
export type OrgChartNode = {
  id: string
  /** The record this one reports to. Null/undefined/unknown ⇒ top level. */
  parentId?: string | null
  name: string
  /** Job title or role, shown under the name. */
  subtitle?: string
  /** Third line — email, extension, department. */
  meta?: string
  avatarSrc?: string
  /**
   * A rendered avatar to use instead of `avatarSrc` — for records whose
   * likeness is composed at render time rather than stored as one image. It
   * replaces the card's 44px avatar, so size it to match.
   */
  avatar?: React.ReactNode
  badge?: { label: string; variant?: BadgeProps['variant'] }
  /** Render the card muted (inactive, offboarded, archived…). */
  muted?: boolean
}

export type OrgChartTreeNode = OrgChartNode & {
  depth: number
  children: OrgChartTreeNode[]
}

/**
 * Resolve a flat parent-pointer list into a forest.
 *
 * Real hierarchies arrive dirty: dangling parents, self-references, and — when
 * two records are edited concurrently — cycles. None of those may lose a
 * record or hang the renderer, so anything that cannot be reached from a
 * genuine root is promoted to a root itself, in input order. Every input node
 * appears exactly once in the output.
 */
export function buildOrgTree(nodes: OrgChartNode[]): OrgChartTreeNode[] {
  const byId = new Map<string, OrgChartNode>()
  for (const node of nodes) byId.set(node.id, node)

  const childrenOf = new Map<string, OrgChartNode[]>()
  const roots: OrgChartNode[] = []
  for (const node of nodes) {
    const parentId = node.parentId
    const hasParent = typeof parentId === 'string' && parentId !== node.id && byId.has(parentId)
    if (!hasParent) {
      roots.push(node)
      continue
    }
    const siblings = childrenOf.get(parentId as string)
    if (siblings) siblings.push(node)
    else childrenOf.set(parentId as string, [node])
  }

  const placed = new Set<string>()
  const expand = (node: OrgChartNode, depth: number): OrgChartTreeNode => {
    placed.add(node.id)
    const children = (childrenOf.get(node.id) ?? [])
      .filter((child) => !placed.has(child.id))
      .map((child) => expand(child, depth + 1))
    return { ...node, depth, children }
  }

  const forest = roots.map((root) => expand(root, 0))
  // Whatever is left is inside a cycle: promote in input order until drained.
  for (const node of nodes) {
    if (!placed.has(node.id)) forest.push(expand(node, 0))
  }
  return forest
}

/** Every record beneath `id`, exclusive of `id` itself. */
export function orgChartDescendantIds(nodes: OrgChartNode[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const node of nodes) {
    if (typeof node.parentId !== 'string' || node.parentId === node.id) continue
    const siblings = childrenOf.get(node.parentId)
    if (siblings) siblings.push(node.id)
    else childrenOf.set(node.parentId, [node.id])
  }
  const found = new Set<string>()
  const queue = [...(childrenOf.get(id) ?? [])]
  while (queue.length > 0) {
    const next = queue.pop() as string
    if (found.has(next) || next === id) continue
    found.add(next)
    queue.push(...(childrenOf.get(next) ?? []))
  }
  return found
}

/**
 * May `childId` be moved under `parentId` without breaking the tree? Guards
 * self-reference, no-op moves, and the cycle a manager-under-own-report makes.
 * Callers must re-check server-side — this is the UI's fast path, not the rule.
 */
export function canReparent(
  nodes: OrgChartNode[],
  childId: string,
  parentId: string | null,
): boolean {
  const child = nodes.find((node) => node.id === childId)
  if (!child) return false
  const currentParent = typeof child.parentId === 'string' ? child.parentId : null
  if (currentParent === parentId) return false
  if (parentId === null) return true
  if (parentId === childId) return false
  if (!nodes.some((node) => node.id === parentId)) return false
  return !orgChartDescendantIds(nodes, childId).has(parentId)
}

export type OrgChartLabels = {
  collapse?: string
  expand?: string
  zoomIn?: string
  zoomOut?: string
  resetZoom?: string
  topLevel?: string
  topLevelHint?: string
  /** Suffix for the collapsed-branch count, e.g. "4 reports". */
  reports?: string
}

const DEFAULT_LABELS: Required<OrgChartLabels> = {
  collapse: 'Collapse branch',
  expand: 'Expand branch',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetZoom: 'Reset zoom',
  topLevel: 'Top level',
  topLevelHint: 'Drop here to remove the reporting line',
  reports: 'reports',
}

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.15] as const
const DEFAULT_ZOOM_INDEX = 3

export type OrgChartProps = {
  nodes: OrgChartNode[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /**
   * Enables drag-to-reparent. Called with the moved record and its new manager
   * (`null` = top level). Only fired for moves `canReparent` accepts; persist
   * with the same guard on the server.
   */
  onReparent?: (childId: string, parentId: string | null) => void
  /** Extra controls rendered beside the zoom buttons. */
  toolbar?: React.ReactNode
  /** Shown instead of the tree when `nodes` is empty. */
  empty?: React.ReactNode
  labels?: OrgChartLabels
  className?: string
}

/**
 * A formal reporting hierarchy: cards connected top-down, pan by scrolling,
 * branches collapsible, and — when `onReparent` is supplied — records dragged
 * onto a new manager. Connectors are drawn with borders rather than measured
 * geometry, so the chart renders identically on the server and never needs a
 * layout pass.
 */
export function OrgChart({
  nodes,
  selectedId,
  onSelect,
  onReparent,
  toolbar,
  empty,
  labels,
  className,
}: OrgChartProps) {
  const text = { ...DEFAULT_LABELS, ...labels }
  const forest = React.useMemo(() => buildOrgTree(nodes), [nodes])
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set<string>())
  const [zoomIndex, setZoomIndex] = React.useState(DEFAULT_ZOOM_INDEX)
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<string | null>(null)
  const [topDrop, setTopDrop] = React.useState(false)

  // A record removed from the data must not keep a stale branch folded shut.
  React.useEffect(() => {
    setCollapsed((current) => {
      const live = new Set(nodes.map((node) => node.id))
      const next = new Set([...current].filter((id) => live.has(id)))
      return next.size === current.size ? current : next
    })
  }, [nodes])

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const draggable = typeof onReparent === 'function'
  const endDrag = () => {
    setDragging(null)
    setDropTarget(null)
    setTopDrop(false)
  }
  const drop = (parentId: string | null) => {
    if (dragging && canReparent(nodes, dragging, parentId)) onReparent?.(dragging, parentId)
    endDrag()
  }

  if (nodes.length === 0) {
    return (
      <>{empty ?? <EmptyState title="Nothing to chart yet" description="Records appear here once they exist." />}</>
    )
  }

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1

  const renderNode = (node: OrgChartTreeNode, isRoot: boolean): React.ReactNode => {
    const isCollapsed = collapsed.has(node.id)
    const hasChildren = node.children.length > 0
    const isDragging = dragging === node.id
    const isDropTarget = dropTarget === node.id
    const invalidTarget = dragging !== null && !isDragging && !canReparent(nodes, dragging, node.id)

    return (
      <li key={node.id} className={cn('appkit-org-item', isRoot && 'appkit-org-item--root')}>
        {isRoot ? null : <span aria-hidden className="appkit-org-stem" />}
        <div
          className={cn(
            'appkit-org-card reveal group relative flex w-56 flex-col items-center gap-2 rounded-xl border bg-surface px-4 py-3 text-center shadow-sm transition-colors',
            selectedId === node.id ? 'border-primary ring-1 ring-primary' : 'border-border',
            isDropTarget && 'border-primary bg-primary-subtle',
            isDragging && 'opacity-50',
            node.muted && 'opacity-60',
          )}
          draggable={draggable}
          onDragStart={
            draggable
              ? (event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', node.id)
                  setDragging(node.id)
                }
              : undefined
          }
          onDragEnd={draggable ? endDrag : undefined}
          onDragOver={
            draggable
              ? (event) => {
                  if (!dragging || invalidTarget || isDragging) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTarget(node.id)
                }
              : undefined
          }
          onDragLeave={
            draggable ? () => setDropTarget((current) => (current === node.id ? null : current)) : undefined
          }
          onDrop={
            draggable
              ? (event) => {
                  event.preventDefault()
                  drop(node.id)
                }
              : undefined
          }
        >
          <button
            type="button"
            onClick={() => onSelect?.(node.id)}
            className="flex flex-col items-center gap-2 focus-visible:outline-none"
            aria-current={selectedId === node.id ? 'true' : undefined}
          >
            {node.avatar ?? (
              <Avatar name={node.name} size={44} {...(node.avatarSrc ? { src: node.avatarSrc } : {})} />
            )}
            <span className="flex flex-col items-center gap-1">
              <span className="text-sm font-semibold text-fg group-hover:text-primary">{node.name}</span>
              {node.subtitle ? <span className="text-xs text-fg-muted">{node.subtitle}</span> : null}
              {node.badge ? (
                <Badge variant={node.badge.variant ?? 'secondary'}>{node.badge.label}</Badge>
              ) : null}
              {node.meta ? <span className="max-w-full truncate text-[11px] text-fg-subtle">{node.meta}</span> : null}
            </span>
          </button>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? text.expand : text.collapse}
              title={`${node.children.length} ${text.reports}`}
              className="absolute -bottom-3 left-1/2 z-1 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-fg-muted shadow-sm transition-colors hover:border-primary hover:text-primary"
            >
              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
              {node.children.length}
            </button>
          ) : null}
        </div>
        {hasChildren && !isCollapsed ? (
          <ul className="appkit-org-children">{node.children.map((child) => renderNode(child, false))}</ul>
        ) : null}
      </li>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-8 px-0"
            aria-label={text.zoomOut}
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-8 px-0"
            aria-label={text.zoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-8 px-0"
            aria-label={text.resetZoom}
            onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
          >
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-1 text-xs tabular-nums text-fg-subtle">{Math.round(zoom * 100)}%</span>
        </div>
        {toolbar}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-subtle p-6">
        <div className="appkit-org-canvas" style={{ zoom }}>
          {draggable ? (
            <div
              onDragOver={(event) => {
                if (!dragging || !canReparent(nodes, dragging, null)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setTopDrop(true)
              }}
              onDragLeave={() => setTopDrop(false)}
              onDrop={(event) => {
                event.preventDefault()
                drop(null)
              }}
              className={cn(
                'mx-auto mb-4 w-fit rounded-full border border-dashed px-4 py-1.5 text-xs transition-colors',
                topDrop ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-fg-subtle',
              )}
            >
              {dragging ? text.topLevelHint : text.topLevel}
            </div>
          ) : null}
          <ul className="appkit-org-children appkit-org-roots">
            {forest.map((root) => renderNode(root, true))}
          </ul>
        </div>
      </div>
    </div>
  )
}
