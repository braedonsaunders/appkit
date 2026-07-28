import assert from 'node:assert/strict'
import test from 'node:test'
import { officeDocumentHtml, sanitizeOfficeHtml } from './html'

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('keeps the allowlisted document structure intact', () => {
  const input =
    '<h1>Title</h1><p>Body with <strong>bold</strong>, <em>italic</em> and <u>underline</u>.</p>' +
    '<ul><li>One</li><li>Two</li></ul>' +
    '<table><thead><tr><th colspan="2">Head</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>' +
    '<blockquote>Quoted</blockquote><hr><p>After<br>the break</p>'
  assert.equal(sanitizeOfficeHtml(input), input)
})

test('drops script-like elements together with their content', () => {
  const out = sanitizeOfficeHtml(
    '<p>before</p><script>alert("x")</script><style>p{color:red}</style><p>after</p>',
  )
  assert.equal(out, '<p>before</p><p>after</p>')
})

test('unwraps disallowed wrappers but keeps their text', () => {
  const out = sanitizeOfficeHtml('<div><span>kept text</span></div><p onclick="x()">safe</p>')
  assert.equal(out, 'kept text<p>safe</p>')
})

test('strips event handlers, styles, and unknown attributes', () => {
  const out = sanitizeOfficeHtml('<p style="color:red" onmouseover="x()" data-a="1">text</p>')
  assert.equal(out, '<p>text</p>')
})

test('keeps only http, https, and mailto links', () => {
  assert.equal(
    sanitizeOfficeHtml('<a href="https://example.com/a?b=1">ok</a>'),
    '<a href="https://example.com/a?b=1">ok</a>',
  )
  assert.equal(sanitizeOfficeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(sanitizeOfficeHtml('<a href="java\tscript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(sanitizeOfficeHtml('<a href="mailto:a@example.com">m</a>'), '<a href="mailto:a@example.com">m</a>')
})

test('allows data: raster images and removes every other image', () => {
  assert.equal(
    sanitizeOfficeHtml(`<img src="${PNG_DATA_URI}" alt="dot" width="1" height="1">`),
    `<img src="${PNG_DATA_URI}" alt="dot" width="1" height="1">`,
  )
  assert.equal(sanitizeOfficeHtml('<img src="https://example.com/x.png">'), '')
  assert.equal(sanitizeOfficeHtml('<img src="data:text/html;base64,PHA+">'), '')
})

test('removes comments, doctypes, and processing instructions', () => {
  const out = sanitizeOfficeHtml('<!doctype html><!-- hidden --><?php echo 1 ?><p>kept</p>')
  assert.equal(out, '<p>kept</p>')
})

test('escapes stray angle brackets and closes unbalanced elements', () => {
  assert.equal(sanitizeOfficeHtml('1 < 2 and <p>open'), '1 &lt; 2 and <p>open</p>')
  assert.equal(sanitizeOfficeHtml('<p>outer<em>inner</p>'), '<p>outer<em>inner</em></p>')
})

test('re-encodes attribute entities without double escaping', () => {
  assert.equal(
    sanitizeOfficeHtml('<a href="https://example.com/?a=1&amp;b=2">x</a>'),
    '<a href="https://example.com/?a=1&amp;b=2">x</a>',
  )
})

test('officeDocumentHtml wraps the body in a printable letter document', () => {
  const html = officeDocumentHtml({
    bodyHtml: '<h1>Quarterly review</h1><p>All clear.</p>',
    title: 'Q3 review',
    branding: {
      companyName: 'Rassaun Services',
      accentColor: '#1a4f8a',
      footerText: 'Confidential',
    },
  })
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('<title>Q3 review</title>'))
  assert.ok(html.includes('margin: 0.75in'))
  assert.ok(html.includes('class="appkit-letterhead">Rassaun Services<'))
  assert.ok(html.includes('class="appkit-document-footer">Confidential<'))
  assert.ok(html.includes('<h1>Quarterly review</h1>'))
})

test('officeDocumentHtml escapes branding text and validates the accent color', () => {
  const html = officeDocumentHtml({
    bodyHtml: '<p>x</p>',
    branding: { companyName: 'A <&> Co' },
  })
  assert.ok(html.includes('A &lt;&amp;&gt; Co'))
  assert.throws(
    () => officeDocumentHtml({ bodyHtml: '<p>x</p>', branding: { accentColor: 'red; } body { x:' } }),
    /accentColor/,
  )
})

test('officeDocumentHtml refuses remote images but accepts data: images', () => {
  assert.throws(
    () => officeDocumentHtml({ bodyHtml: '<p><img src="https://example.com/logo.png"></p>' }),
    /refuses <img>/,
  )
  const html = officeDocumentHtml({ bodyHtml: `<p><img src="${PNG_DATA_URI}"></p>` })
  assert.ok(html.includes(PNG_DATA_URI))
})
