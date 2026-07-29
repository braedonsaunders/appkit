import { describe, expect, it } from 'vitest'
import {
  baseEmailBlocks,
  blocksForPreset,
  collectionTableBlockHtml,
  mergeFieldBlockHtml,
  safeTemplateKey,
  signatureEmailBlocks,
  starterHtml,
} from './blocks'

describe('safeTemplateKey', () => {
  it('accepts dotted and dashed keys', () => {
    expect(safeTemplateKey('agent.name')).toBe('agent.name')
    expect(safeTemplateKey('  company_legal-name  ')).toBe('company_legal-name')
  })

  it('rejects keys that could break out of markup', () => {
    for (const key of ['', '.leading', 'a"b', "a'b", 'a<b', 'a b', '{{x}}', '-dash']) {
      expect(safeTemplateKey(key), key).toBeNull()
    }
  })
})

describe('mergeFieldBlockHtml', () => {
  it('emits a token span for a safe key', () => {
    expect(mergeFieldBlockHtml({ key: 'agent.name' })).toBe('<span>{{agent.name}}</span>')
  })

  it('returns null rather than emitting an unsafe key', () => {
    expect(mergeFieldBlockHtml({ key: '"><img src=x onerror=alert(1)>' })).toBeNull()
  })
})

describe('collectionTableBlockHtml', () => {
  const collection = {
    key: 'hazards',
    label: 'Hazards',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'level', label: 'Level' },
    ],
  }

  it('marks the body row for repeat expansion and leaves the header static', () => {
    const html = collectionTableBlockHtml(collection)!
    expect(html).toContain('data-each="hazards"')
    expect(html).toContain('{{name}}')
    expect(html.match(/data-each/g)).toHaveLength(1)
    expect(html.indexOf('<th')).toBeLessThan(html.indexOf('data-each'))
  })

  it('escapes column labels', () => {
    const html = collectionTableBlockHtml({
      key: 'rows',
      label: 'Rows',
      fields: [{ key: 'a', label: '<script>x</script>' }],
    })!
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('refuses the whole table when any column key is unsafe', () => {
    expect(
      collectionTableBlockHtml({
        key: 'rows',
        label: 'Rows',
        fields: [{ key: 'ok', label: 'Ok' }, { key: 'not ok', label: 'Bad' }],
      }),
    ).toBeNull()
  })

  it('refuses an empty collection', () => {
    expect(collectionTableBlockHtml({ key: 'rows', label: 'Rows', fields: [] })).toBeNull()
  })
})

describe('theme application', () => {
  it('bakes the accent into generated blocks', () => {
    const button = baseEmailBlocks({ accent: '#ff0000' }).find((b) => b.id === 'button')!
    expect(button.content).toContain('#ff0000')
  })

  it('falls back to the default when a color is not a plain hex literal', () => {
    const button = baseEmailBlocks({ accent: 'red;} body{display:none' }).find(
      (b) => b.id === 'button',
    )!
    expect(button.content).not.toContain('display:none')
    expect(button.content).toContain('#0d9488')
  })

  it('clamps an out-of-range content width', () => {
    expect(starterHtml('email', { maxWidth: 99_999 })).toContain('max-width:1200px')
  })
})

describe('presets', () => {
  it('offers only signature blocks in the signature preset', () => {
    const ids = blocksForPreset('signature').map((b) => b.id)
    expect(ids).toEqual(signatureEmailBlocks().map((b) => b.id))
    expect(ids.every((id) => id.startsWith('sig-'))).toBe(true)
  })

  it('offers content and signature blocks in the email preset', () => {
    const ids = blocksForPreset('email').map((b) => b.id)
    expect(ids).toContain('heading')
    expect(ids).toContain('sig-identity')
  })

  it('gives every block a unique id', () => {
    const ids = blocksForPreset('email').map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts a signature without page chrome', () => {
    const signature = starterHtml('signature')
    expect(signature).toContain('{{agent.name}}')
    expect(signature).not.toContain('max-width')
  })
})
