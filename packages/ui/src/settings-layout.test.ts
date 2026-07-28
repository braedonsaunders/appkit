import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { AdminHub, SettingsShell } from './settings-layout'

function render(contentWidth?: 'narrow' | 'wide' | 'full') {
  return renderToStaticMarkup(
    React.createElement(
      SettingsShell,
      {
        title: 'Platform administration',
        nav: [{ label: 'Platform', items: [{ key: 'organizations', label: 'Organizations' }] }],
        activeKey: 'organizations',
        onSelect: () => {},
        contentWidth,
        children: React.createElement('table', null, React.createElement('tbody')),
      },
    ),
  )
}

test('keeps settings panes narrow by default', () => {
  const markup = render()
  if (!markup.includes('max-w-5xl')) throw new Error('Default content width is not narrow')
})

test('supports a full-width administration canvas', () => {
  const markup = render('full')
  if (!markup.includes('max-w-none')) throw new Error('Full-width content class was not rendered')
  if (markup.includes('max-w-5xl')) throw new Error('Narrow width leaked into full-width mode')
})

test('renders an explicit exit path from mode-specific administration', () => {
  const markup = renderToStaticMarkup(
    React.createElement(SettingsShell, {
      title: 'Platform administration',
      back: { href: '/', label: 'Back to Acme' },
      nav: [{ label: 'Platform', items: [{ key: 'organizations', label: 'Organizations' }] }],
      activeKey: 'organizations',
      onSelect: () => {},
      children: React.createElement('div'),
    }),
  )

  if (!markup.includes('href="/"')) throw new Error('Administration exit href was not rendered')
  if (!markup.includes('Back to Acme')) throw new Error('Administration exit label was not rendered')
})

test('renders operational counts on compact admin hub cards', () => {
  const markup = renderToStaticMarkup(
    React.createElement(AdminHub, {
      groups: [{
        label: 'Platform',
        cards: [{
          title: 'Organizations',
          href: '/admin/organizations',
          badge: React.createElement('span', null, '12 tenants'),
        }],
      }],
    }),
  )
  if (!markup.includes('12 tenants')) throw new Error('Compact hub card badge was not rendered')
})
