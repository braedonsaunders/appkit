import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppShell } from './app-shell'
import type { SidebarNavGroup } from './sidebar-nav'

const groups: SidebarNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { href: '/', label: 'Home', iconKey: 'gauge', mobile: true },
      { href: '/settings', label: 'Settings', iconKey: 'settings', mobile: true },
    ],
  },
]

test('AppShell uses dynamic viewport height with h-screen fallback and keeps mobile tab safe-area inset', () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppShell, {
      groups,
      pathname: '/',
      children: React.createElement('div', null, 'Content'),
    }),
  )

  const rootClass = /^<div class="([^"]+)"/.exec(markup)?.[1] ?? ''
  assert.match(rootClass, /\bh-screen\b/, 'AppShell must keep h-screen as a fallback for browsers without dvh')
  assert.match(
    rootClass,
    /\bsupports-\[height:100dvh\]:h-dvh\b/,
    'AppShell must upgrade to dynamic viewport height so mobile toolbars do not cover the bottom tab bar',
  )
  assert.match(
    markup,
    /<nav[^>]*class="[^"]*\bpb-\[env\(safe-area-inset-bottom\)\][^"]*"/,
    'MobileTabBar must preserve safe-area bottom inset padding',
  )
})
