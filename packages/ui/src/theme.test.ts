import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeProvider, ThemeToggle } from './theme'
import { getThemeScript, type ThemeOptions } from './theme-script'

/** Runs the pre-paint script against a fake document and storage; returns the <html> classes. */
function prepaint(options: ThemeOptions, stored: Record<string, string> = {}, storageThrows = false): string[] {
  const classes = new Set<string>()
  const documentElement = {
    classList: {
      toggle(name: string, force: boolean) {
        if (force) classes.add(name)
        else classes.delete(name)
      },
    },
  }
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error('storage disabled')
      return stored[key] ?? null
    },
  }
  runInNewContext(getThemeScript(options), { document: { documentElement }, localStorage })
  return [...classes].sort()
}

test('pre-paint script leaves system themes to the stylesheet', () => {
  assert.deepEqual(prepaint({}), [])
  assert.deepEqual(prepaint({}, { theme: 'system' }), [])
  assert.deepEqual(prepaint({}, { theme: 'dark' }), ['dark'])
})

test('pre-paint script applies a dark default before any choice is stored', () => {
  assert.deepEqual(prepaint({ storageKey: 'app-theme', defaultTheme: 'dark' }), ['dark'])
  assert.deepEqual(prepaint({ storageKey: 'app-theme', defaultTheme: 'dark' }, { 'app-theme': 'light' }), ['light'])
  assert.deepEqual(prepaint({ storageKey: 'app-theme', defaultTheme: 'dark' }, { 'app-theme': 'bogus' }), ['dark'])
  assert.deepEqual(prepaint({ storageKey: 'app-theme', defaultTheme: 'dark' }, {}, true), ['dark'])
})

test('pre-paint script never honours system in a light/dark-only app', () => {
  const options: ThemeOptions = { storageKey: 'app-theme', defaultTheme: 'dark', enableSystem: false }
  assert.deepEqual(prepaint(options, { 'app-theme': 'system' }), ['dark'])
  assert.deepEqual(prepaint(options, { 'app-theme': 'light' }), ['light'])
})

test('pre-paint script escapes its storage key for inline embedding', () => {
  assert.doesNotMatch(getThemeScript({ storageKey: '</script><script>alert(1)' }), /<\/script>/)
})

function renderToggle(options: ThemeOptions, collapsed = false): string {
  return renderToStaticMarkup(
    React.createElement(ThemeProvider, { ...options, children: React.createElement(ThemeToggle, { collapsed }) }),
  )
}

test('ThemeToggle offers system only when it is enabled', () => {
  assert.equal(renderToggle({}).match(/role="radio"/g)?.length, 3)
  const lightDark = renderToggle({ defaultTheme: 'dark', enableSystem: false })
  assert.equal(lightDark.match(/role="radio"/g)?.length, 2)
  assert.doesNotMatch(lightDark, /title="System"/)
})

test('server render reflects the configured default theme', () => {
  assert.match(renderToggle({ defaultTheme: 'dark', enableSystem: false }, true), /aria-label="Theme: Dark"/)
  assert.match(renderToggle({}, true), /aria-label="Theme: System"/)
})
