import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Box } from 'lucide-react'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WorkspaceLauncher } from './workspace-launcher'

test('renders live metrics, summaries, and composition data', () => {
  const markup = renderToStaticMarkup(React.createElement(WorkspaceLauncher, {
    title: 'Libraries',
    description: 'Live catalog coverage',
    itemCountLabel: '1',
    items: [{
      id: 'resources',
      title: 'Resources',
      description: 'Materials, labor, and equipment',
      icon: Box,
      metric: '12,450',
      metricLabel: 'items',
      tone: 'indigo',
      summary: '3 groups',
      breakdown: {
        label: 'Resource rows',
        segments: [
          { label: 'Material', value: 10_000 },
          { label: 'Labor', value: 2_450 },
        ],
      },
    }],
    onSelect: () => {},
  }))

  for (const value of ['Libraries', 'Resources', '12,450', '3 groups', 'Material: 10000 (80%)']) {
    if (!markup.includes(value)) throw new Error(`Missing ${value}`)
  }
})

test('supports a compact fit-to-height mode without rendering optional detail', () => {
  const markup = renderToStaticMarkup(React.createElement(WorkspaceLauncher, {
    layout: 'fit',
    showBreakdowns: false,
    showSummaries: false,
    items: [{
      id: 'takeoff',
      title: 'Takeoff',
      description: 'Open drawings',
      icon: Box,
      metric: '4',
      metricLabel: 'sources',
      tone: 'sky',
      summary: '2 groups',
      breakdown: { label: 'Formats', segments: [{ label: 'PDF', value: 4 }] },
    }],
    onSelect: () => {},
  }))

  if (!markup.includes('auto-rows-fr') || !markup.includes('overflow-y-hidden')) {
    throw new Error('Fit layout classes were not rendered')
  }
  if (markup.includes('2 groups') || markup.includes('Formats')) {
    throw new Error('Optional summary or breakdown rendered while disabled')
  }
})

test('every tone renders a distinct colour', () => {
  const source = readFileSync(new URL('./workspace-launcher.tsx', import.meta.url), 'utf8')

  const tones = source.slice(source.indexOf('const toneClasses'), source.indexOf('const segmentPalette'))
  const accents = [...tones.matchAll(/(\w+):\s*\{\s*accent:\s*'text-([\w-]+)'/g)]
  assert.ok(accents.length >= 9, `expected every tone, found ${accents.length}`)

  // A launcher exists to tell peers apart, so two tones sharing a colour is a
  // defect: nine names once collapsed onto five semantic colours.
  const byColour = new Map<string, string[]>()
  for (const match of accents) {
    const tone = match[1] ?? ''
    const colour = match[2] ?? ''
    byColour.set(colour, [...(byColour.get(colour) ?? []), tone])
  }
  const collisions = [...byColour.entries()].filter(([, list]) => list.length > 1)
  assert.deepEqual(collisions, [], `tones share a colour: ${collisions.map(([c, t]) => `${c} <- ${t.join(', ')}`).join('; ')}`)

  // Status colours carry meaning; identity must not borrow them.
  for (const match of accents) {
    const colour = match[2] ?? ''
    assert.ok(
      !['danger', 'warning', 'success', 'info', 'primary'].includes(colour),
      `tone ${match[1]} reuses the semantic colour ${colour}`,
    )
  }
})
