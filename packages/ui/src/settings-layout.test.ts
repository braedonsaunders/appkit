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

test('collapses the settings rail into a section strip on narrow screens', () => {
  const markup = renderToStaticMarkup(
    React.createElement(SettingsShell, {
      title: 'Settings',
      nav: [
        { label: 'Server', items: [{ key: 'server', label: 'Server' }, { key: 'plex', label: 'Plex' }] },
        { label: 'Media', items: [{ key: 'cache', label: 'Cache' }] },
      ],
      activeKey: 'plex',
      onSelect: () => {},
      children: React.createElement('div'),
    }),
  )
  const aside = /<aside class="([^"]+)"/.exec(markup)?.[1] ?? ''
  if (/(?:^|\s)w-\d/.test(aside)) throw new Error('Settings rail keeps a fixed width on phones')
  if (!/\bmd:w-52\b/.test(aside)) throw new Error('Settings rail lost its desktop width')
  if (!/\bflex-col\b/.test(markup) || !/\bmd:flex-row\b/.test(markup)) throw new Error('Settings body does not stack on phones')
  if ((markup.match(/aria-current="page"/g) ?? []).length !== 1) throw new Error('Settings navigation renders duplicate controls')
  if (!/<h3 class="[^"]*\bhidden md:block\b[^"]*">Server<\/h3>/.test(markup)) throw new Error('Group labels are not collapsed on phones')
})
