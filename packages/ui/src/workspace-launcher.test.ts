import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Box } from 'lucide-react'
import test from 'node:test'
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
