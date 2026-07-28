import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceTextInFodt } from './fodt'

const wrap = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><office:document><office:body><office:text>${body}</office:text></office:body></office:document>`

test('replaces a match inside a single text run', () => {
  const fodt = wrap('<text:p>Wear a hard hat on site.</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'hard hat', replace: 'Type II hard hat' },
  ])
  assert.deepEqual(results, [{ find: 'hard hat', count: 1 }])
  assert.ok(out.includes('Wear a Type II hard hat on site.'))
})

test('replaces a match spanning formatting runs and keeps the markup', () => {
  const fodt = wrap(
    '<text:p>Contact the <text:span text:style-name="T1">safety</text:span> office today.</text:p>',
  )
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'Contact the safety office', replace: 'Call the HSE coordinator' },
  ])
  assert.deepEqual(results[0], { find: 'Contact the safety office', count: 1 })
  assert.ok(out.includes('Call the HSE coordinator'))
  // The emptied span stays structurally valid.
  assert.ok(out.includes('<text:span text:style-name="T1">'))
  assert.ok(out.includes(' today.'))
})

test('replaces every occurrence and reports the count', () => {
  const fodt = wrap('<text:p>site check</text:p><text:p>Another site check here.</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'site check', replace: 'site inspection' },
  ])
  assert.equal(results[0]!.count, 2)
  assert.ok(!out.includes('site check'))
  assert.equal(out.match(/site inspection/g)?.length, 2)
})

test('does not cross paragraph boundaries', () => {
  const fodt = wrap('<text:p>end of one</text:p><text:p>start of two</text:p>')
  const { results } = replaceTextInFodt(fodt, [{ find: 'one start', replace: 'x' }])
  assert.equal(results[0]!.count, 0)
})

test('reports 0 for text that is not in the document', () => {
  const fodt = wrap('<text:p>Hello world.</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [{ find: 'missing', replace: 'x' }])
  assert.equal(results[0]!.count, 0)
  assert.equal(out, fodt)
})

test('matches through <text:s/>, <text:tab/> and <text:line-break/> whitespace', () => {
  const fodt = wrap(
    '<text:p>Column A<text:tab/>Column B<text:s text:c="2"/>end<text:line-break/>next line</text:p>',
  )
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'Column A\tColumn B', replace: 'Merged header' },
    { find: 'end\nnext', replace: 'end continued' },
  ])
  assert.deepEqual(results, [
    { find: 'Column A\tColumn B', count: 1 },
    { find: 'end\nnext', count: 1 },
  ])
  assert.ok(out.includes('Merged header'))
  assert.ok(out.includes('end continued'))
  assert.ok(!out.includes('<text:tab/>'))
  assert.ok(!out.includes('<text:line-break/>'))
})

test('decodes entities in the source and re-encodes the replacement', () => {
  const fodt = wrap('<text:p>Safety &amp; Health rules</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'Safety & Health', replace: 'Health & Safety <priority>' },
  ])
  assert.equal(results[0]!.count, 1)
  assert.ok(out.includes('Health &amp; Safety &lt;priority&gt; rules'))
})

test('does not loop when the replacement contains the find string', () => {
  const fodt = wrap('<text:p>rule rule</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'rule', replace: 'rule (updated)' },
  ])
  assert.equal(results[0]!.count, 2)
  assert.ok(out.includes('rule (updated) rule (updated)'))
})

test('applies sequential edits where a later find matches earlier output', () => {
  const fodt = wrap('<text:p>alpha beta</text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [
    { find: 'alpha', replace: 'gamma' },
    { find: 'gamma beta', replace: 'delta' },
  ])
  assert.deepEqual(results.map((result) => result.count), [1, 1])
  assert.ok(out.includes('<text:p>delta</text:p>'))
})

test('preserves a legal greater-than character inside a quoted XML attribute', () => {
  const fodt = wrap('<text:p><text:span text:style-name="a>b">HELLO</text:span></text:p>')
  const { fodt: out, results } = replaceTextInFodt(fodt, [{ find: 'HELLO', replace: 'NEW' }])
  assert.deepEqual(results, [{ find: 'HELLO', count: 1 }])
  assert.ok(out.includes('<text:span text:style-name="a>b">NEW</text:span>'))
})

test('preserves processing instructions, comments, and doctype subsets while scanning', () => {
  const fodt =
    '<?xml version="1.0"?><!DOCTYPE office:document [<!ENTITY gt ">">]><!-- a > b -->' +
    '<office:document><text:p>HELLO</text:p></office:document>'
  const { fodt: out } = replaceTextInFodt(fodt, [{ find: 'HELLO', replace: 'NEW' }])
  assert.equal(
    out,
    '<?xml version="1.0"?><!DOCTYPE office:document [<!ENTITY gt ">">]><!-- a > b -->' +
      '<office:document><text:p>NEW</text:p></office:document>',
  )
})

test('ignores empty find strings', () => {
  const fodt = wrap('<text:p>text</text:p>')
  const { results } = replaceTextInFodt(fodt, [{ find: '', replace: 'x' }])
  assert.equal(results[0]!.count, 0)
})
