import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  OrgChart,
  buildOrgTree,
  canReparent,
  orgChartDescendantIds,
  type OrgChartNode,
} from './org-chart'

const roster: OrgChartNode[] = [
  { id: 'owner', name: 'Rae Okonjo', subtitle: 'Owner' },
  { id: 'ops', parentId: 'owner', name: 'Dana Reyes', subtitle: 'Operations Manager' },
  { id: 'admin', parentId: 'ops', name: 'Mo Delacroix', subtitle: 'Office Administrator' },
  { id: 'sales', parentId: 'owner', name: 'Kit Alvarez', subtitle: 'Sales Lead' },
]

test('buildOrgTree nests reports under their manager', () => {
  const forest = buildOrgTree(roster)
  assert.equal(forest.length, 1)
  const [owner] = forest
  assert.equal(owner?.id, 'owner')
  assert.equal(owner?.depth, 0)
  assert.deepEqual(owner?.children.map((child) => child.id), ['ops', 'sales'])
  assert.deepEqual(owner?.children[0]?.children.map((child) => child.id), ['admin'])
  assert.equal(owner?.children[0]?.children[0]?.depth, 2)
})

test('buildOrgTree promotes records whose manager is missing or is themselves', () => {
  const forest = buildOrgTree([
    { id: 'a', parentId: 'ghost', name: 'A' },
    { id: 'b', parentId: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ])
  assert.deepEqual(forest.map((node) => node.id), ['a', 'b', 'c'])
})

test('buildOrgTree keeps every record exactly once when the data holds a cycle', () => {
  const forest = buildOrgTree([
    { id: 'a', parentId: 'c', name: 'A' },
    { id: 'b', parentId: 'a', name: 'B' },
    { id: 'c', parentId: 'b', name: 'C' },
    { id: 'd', name: 'D' },
  ])
  const flat: string[] = []
  const walk = (nodes: ReturnType<typeof buildOrgTree>): void => {
    for (const node of nodes) {
      flat.push(node.id)
      walk(node.children)
    }
  }
  walk(forest)
  assert.deepEqual([...flat].sort(), ['a', 'b', 'c', 'd'])
  assert.equal(flat.length, 4)
})

test('orgChartDescendantIds collects the whole branch', () => {
  assert.deepEqual([...orgChartDescendantIds(roster, 'owner')].sort(), ['admin', 'ops', 'sales'])
  assert.deepEqual([...orgChartDescendantIds(roster, 'admin')], [])
})

test('canReparent refuses self, no-ops, unknown managers, and cycles', () => {
  assert.equal(canReparent(roster, 'admin', 'owner'), true)
  assert.equal(canReparent(roster, 'admin', 'admin'), false)
  assert.equal(canReparent(roster, 'admin', 'ops'), false, 'already reports there')
  assert.equal(canReparent(roster, 'owner', 'admin'), false, 'would put a manager under its own report')
  assert.equal(canReparent(roster, 'admin', 'ghost'), false)
  assert.equal(canReparent(roster, 'ghost', 'owner'), false)
  assert.equal(canReparent(roster, 'ops', null), true, 'promoting to top level is allowed')
  assert.equal(canReparent(roster, 'owner', null), false, 'already top level')
})

test('OrgChart renders the hierarchy without a client pass', () => {
  const markup = renderToStaticMarkup(React.createElement(OrgChart, { nodes: roster }))
  for (const node of roster) assert.match(markup, new RegExp(node.name))
  assert.match(markup, /appkit-org-children appkit-org-roots/)
  assert.match(markup, /appkit-org-stem/)
})

test('OrgChart shows its empty state rather than an empty canvas', () => {
  const markup = renderToStaticMarkup(React.createElement(OrgChart, { nodes: [] }))
  assert.doesNotMatch(markup, /appkit-org-canvas/)
  assert.match(markup, /Nothing to chart yet/)
})
