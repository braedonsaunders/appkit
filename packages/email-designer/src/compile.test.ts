import { describe, expect, it } from 'vitest'
import { compileEmailDesign } from './compile'
import { renderEmailDesign, sampleMergeValues } from './preview'
import { serializeEmailEditor } from './serialize'

const upperCase = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('serializeEmailEditor', () => {
  it('keeps authored rules with the markup', () => {
    expect(
      serializeEmailEditor({ getHtml: () => '<p>hi</p>', getCss: () => '#a{color:red}' }),
    ).toBe('<style>#a{color:red}</style><p>hi</p>')
  })

  it('omits an empty style block', () => {
    expect(serializeEmailEditor({ getHtml: () => '<p>hi</p>', getCss: () => '' })).toBe('<p>hi</p>')
  })
})

describe('compileEmailDesign', () => {
  it('returns empty output for empty input', () => {
    expect(compileEmailDesign('   ')).toEqual({ sourceHtml: '', compiledHtml: '', errors: [] })
  })

  it('strips active markup from both halves', () => {
    const result = compileEmailDesign('<p>ok</p><script>alert(1)</script>')
    expect(result.errors).toEqual([])
    expect(result.sourceHtml).not.toContain('script')
    expect(result.compiledHtml).not.toContain('script')
    expect(result.compiledHtml).toContain('ok')
  })

  it('expands a repeat marker in the compiled half only', () => {
    const source = '<table><tr data-each="rows"><td>{{name}}</td></tr></table>'
    const result = compileEmailDesign(source)
    expect(result.sourceHtml).toContain('data-each="rows"')
    expect(result.compiledHtml).toContain('{{#each rows}}')
    expect(result.compiledHtml).toContain('{{/each}}')
    expect(result.compiledHtml).not.toContain('data-each')
  })

  it('runs the inliner before markers are expanded', () => {
    const seen: string[] = []
    const result = compileEmailDesign(
      '<table><tr data-each="rows"><td>{{name}}</td></tr></table>',
      {
        inlineCss: (html) => {
          seen.push(html)
          return html
        },
      },
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('data-each')
    expect(seen[0]).not.toContain('{{#each')
    expect(result.compiledHtml).toContain('{{#each rows}}')
  })

  it('keeps the reopenable source free of document wrappers in fragment mode', () => {
    const result = compileEmailDesign('<p>signature</p>', { fragment: true })
    expect(result.sourceHtml).not.toContain('<html')
    expect(result.sourceHtml).not.toContain('<body')
  })

  it('round-trips authored rules through fragment mode', () => {
    // Sanitizing a fragment drops a top-level <style>, so the rules must already
    // be inline by then or a reopened signature comes back unstyled.
    const raw = '<style>#a{color:#ff0000}</style><p id="a">signature</p>'
    const inlineCss = (html: string) =>
      html.replace('<p id="a">', '<p id="a" style="color:#ff0000;">')
    const result = compileEmailDesign(raw, { fragment: true, inlineCss })
    expect(result.errors).toEqual([])
    expect(result.sourceHtml).toContain('color:#ff0000')
    expect(result.compiledHtml).toContain('color:#ff0000')
  })

  it('keeps the two halves identical apart from marker expansion', () => {
    const result = compileEmailDesign('<p>no markers here</p>')
    expect(result.compiledHtml).toBe(result.sourceHtml)
  })

  it('reports an error instead of throwing on invalid markers', () => {
    const result = compileEmailDesign('<table><tr data-each="bad path"><td>x</td></tr></table>')
    expect(result.errors).toHaveLength(1)
    expect(result.compiledHtml).toBe('')
  })
})

describe('renderEmailDesign', () => {
  it('resolves dotted tokens', () => {
    const { html, text } = renderEmailDesign('<p>Hi {{agent.name}}</p>', {
      agent: { name: 'Dana Reid' },
    })
    expect(html).toBe('<p>Hi Dana Reid</p>')
    expect(text).toContain('Dana Reid')
  })

  it('neutralizes markup in a merge value', () => {
    // Values that look like HTML are reduced to readable text before escaping,
    // so a rich-text field cannot inject markup into a sanitized design.
    const { html } = renderEmailDesign('<p>Hi {{agent.name}}</p>', {
      agent: { name: '<b>Dana</b><script>alert(1)</script>' },
    })
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Dana')
  })

  it('escapes characters that would break out of the surrounding markup', () => {
    const { html } = renderEmailDesign('<p title="{{note}}">x</p>', { note: 'a "quoted" value' })
    expect(html).toContain('&quot;quoted&quot;')
  })

  it('renders an expanded collection loop', () => {
    const { compiledHtml } = compileEmailDesign(
      '<table><tr data-each="rows"><td>{{name}}</td></tr></table>',
    )
    const { html } = renderEmailDesign(compiledHtml, {
      rows: [{ name: 'One' }, { name: 'Two' }],
    })
    expect(upperCase(html)).toContain('One')
    expect(upperCase(html)).toContain('Two')
  })

  it('is empty for an empty design', () => {
    expect(renderEmailDesign('  ', {})).toEqual({ html: '', text: '' })
  })
})

describe('sampleMergeValues', () => {
  it('nests dotted keys and prefers the declared sample', () => {
    const values = sampleMergeValues([
      { key: 'agent.name', label: 'Name', sample: 'Dana Reid' },
      { key: 'agent.title', label: 'Title' },
    ])
    expect(values).toEqual({ agent: { name: 'Dana Reid', title: 'Title' } })
  })

  it('builds rows for each collection', () => {
    const values = sampleMergeValues([], [
      { key: 'rows', label: 'Rows', fields: [{ key: 'name', label: 'Name' }] },
    ])
    expect(values.rows).toEqual([{ name: 'Name 1' }, { name: 'Name 2' }])
  })

  it('skips unsafe keys', () => {
    expect(sampleMergeValues([{ key: 'not ok' }])).toEqual({})
  })
})
