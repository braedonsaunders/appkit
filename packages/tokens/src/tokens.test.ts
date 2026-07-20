import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { palette } from './index'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{`, 'm').exec(css)
  assert.ok(match, `missing ${selector}`)
  const open = css.indexOf('{', match.index)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(open + 1, index)
  }
  throw new Error(`unclosed ${selector}`)
}

function channels(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(/--ch-([\w-]+):\s*([0-9]+\s+[0-9]+\s+[0-9]+)/g)].map((match) => [match[1], match[2]]))
}

test('JavaScript and CSS semantic palettes cannot drift', () => {
  const lightCss = channels(block(':root'))
  const darkCss = channels(block('.dark'))
  for (const [token, values] of Object.entries(palette.light)) assert.equal(lightCss[token], values.join(' '), `light ${token}`)
  for (const [token, values] of Object.entries(palette.dark)) assert.equal(darkCss[token], values.join(' '), `dark ${token}`)
})

test('system dark defaults stay identical to the explicit dark theme', () => {
  assert.deepEqual(channels(block(':root:not(.light):not(.dark)')), channels(block('.dark')))
})
