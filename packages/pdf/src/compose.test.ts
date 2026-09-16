import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, degrees } from 'pdf-lib'
import { composePdf, countPages, imposePages, pageGeometry, stampFooter } from './compose'

const LETTER = pageGeometry('letter', 'portrait')

async function makePdf(
  pages: { width: number; height: number; rotate?: number; blank?: boolean }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const spec of pages) {
    const page = doc.addPage([spec.width, spec.height])
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    // A page needs a content stream to be embeddable; `blank: true`
    // deliberately omits one to exercise the empty-sheet path.
    if (!spec.blank) page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 })
  }
  return doc.save()
}

async function sizesOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc
    .getPages()
    .map((p) => ({ width: Math.round(p.getWidth()), height: Math.round(p.getHeight()) }))
}

test('imposePages normalises mixed page sizes onto one geometry', async () => {
  // The failure this exists for: a word processor emits A4, scans arrive as
  // Letter, and the cover is Letter — so the assembled book physically changed
  // paper size as you paged through it.
  const out = await PDFDocument.create()
  await imposePages(out, await makePdf([{ width: 595.28, height: 841.89 }]), LETTER)
  await imposePages(out, await makePdf([{ width: 612, height: 792 }]), LETTER)
  await imposePages(out, await makePdf([{ width: 1224, height: 792 }]), LETTER)

  assert.deepEqual(await sizesOf(await out.save()), [
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ])
})

test('imposePages treats a rotated landscape scan as the portrait page it displays as', async () => {
  // Copiers commonly write a landscape MediaBox with /Rotate 270. Fitting the
  // raw box would squeeze a portrait scan into a sideways letterboxed strip.
  const out = await PDFDocument.create()
  await imposePages(out, await makePdf([{ width: 792, height: 612, rotate: 270 }]), LETTER)
  assert.deepEqual((await sizesOf(await out.save()))[0], { width: 612, height: 792 })
})

test('imposePages handles every quarter rotation', async () => {
  for (const rotate of [0, 90, 180, 270]) {
    const out = await PDFDocument.create()
    const count = await imposePages(out, await makePdf([{ width: 792, height: 612, rotate }]), LETTER)
    assert.equal(count, 1)
    assert.equal(out.getPageCount(), 1)
  }
})

test('imposePages does not enlarge a small page unless asked', async () => {
  // Upscaling a half-letter page to fill Letter magnifies scan artefacts;
  // honest margins read better than a blown-up page.
  const small = await makePdf([{ width: 306, height: 396 }])

  const plain = await PDFDocument.create()
  await imposePages(plain, small, LETTER)
  const upscaled = await PDFDocument.create()
  await imposePages(upscaled, small, LETTER, { allowUpscale: true })

  assert.deepEqual((await sizesOf(await plain.save()))[0], { width: 612, height: 792 })
  assert.deepEqual((await sizesOf(await upscaled.save()))[0], { width: 612, height: 792 })
})

test('imposePages preserves order and count across sources', async () => {
  const out = await PDFDocument.create()
  const a = await imposePages(
    out,
    await makePdf([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]),
    LETTER,
  )
  const b = await imposePages(out, await makePdf([{ width: 595, height: 842 }]), LETTER)
  assert.equal(a, 2)
  assert.equal(b, 1)
  assert.equal(out.getPageCount(), 3)
})

// NB: a zero-page source is not constructible here — pdf-lib cannot round-trip
// one, a saved empty document reads back as a single page. The early return for
// that case stays in the code as a guard against malformed input.

test('imposePages reproduces a content-less page instead of failing the whole book', async () => {
  // Scanners emit genuinely blank sheets, and pdf-lib refuses to embed a page
  // with no content stream. One blank sheet must not take down a 240-page
  // manual, so it keeps its slot in the page order.
  const out = await PDFDocument.create()
  const count = await imposePages(
    out,
    await makePdf([
      { width: 612, height: 792 },
      { width: 612, height: 792, blank: true },
      { width: 612, height: 792 },
    ]),
    LETTER,
  )
  assert.equal(count, 3)
  assert.equal(out.getPageCount(), 3)
})

test('stampFooter numbers body pages and leaves the cover clean', async () => {
  const doc = await PDFDocument.create()
  for (let i = 0; i < 4; i++) doc.addPage([LETTER.width, LETTER.height])

  const seen: string[] = []
  await stampFooter(doc, {
    cells: (page, total) => {
      if (page === 1) return null
      const label = `PAGE ${page - 1} OF ${total - 1}`
      seen.push(label)
      return { left: 'UNCONTROLLED WHEN PRINTED', center: label, right: '' }
    },
  })

  assert.deepEqual(seen, ['PAGE 1 OF 3', 'PAGE 2 OF 3', 'PAGE 3 OF 3'])
  assert.equal(doc.getPageCount(), 4)
})

test('composePdf normalises geometry and numbers only the numbered pages', async () => {
  const labels: string[] = []
  const pdf = await composePdf({
    geometry: LETTER,
    parts: [
      { bytes: await makePdf([{ width: 612, height: 792 }]), unnumbered: true },
      {
        bytes: await makePdf([
          { width: 595.28, height: 841.89 },
          { width: 595.28, height: 841.89 },
        ]),
      },
      { bytes: await makePdf([{ width: 792, height: 612, rotate: 270 }]) },
    ],
    footer: {
      cells: (page, total) => {
        const label = `PAGE ${page} OF ${total}`
        labels.push(label)
        return { left: 'UNCONTROLLED WHEN PRINTED', center: label, right: '' }
      },
      subline: () => 'EXAMPLE COMPANY',
    },
    title: 'Health and Safety Manual',
  })

  // An unnumbered cover must not consume "page 1", so the printed numbers
  // match what a reader counts from the first real page.
  assert.deepEqual(labels, ['PAGE 1 OF 3', 'PAGE 2 OF 3', 'PAGE 3 OF 3'])
  assert.deepEqual(await sizesOf(pdf), [
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ])
})

test('composePdf carries document metadata and works without a footer', async () => {
  const pdf = await composePdf({
    geometry: LETTER,
    parts: [{ bytes: await makePdf([{ width: 612, height: 792 }]) }],
    title: 'Welding Procedures',
    author: 'Example Company',
  })
  const doc = await PDFDocument.load(pdf)
  assert.equal(doc.getTitle(), 'Welding Procedures')
  assert.equal(doc.getAuthor(), 'Example Company')
  assert.equal(await countPages(pdf), 1)
})

test('pageGeometry swaps the axes for landscape', () => {
  assert.deepEqual(pageGeometry('letter', 'portrait'), { width: 612, height: 792 })
  assert.deepEqual(pageGeometry('letter', 'landscape'), { width: 792, height: 612 })
})

test('imposePages can take a subset of a source, in the order given', async () => {
  // Rendering N small sheets as one multi-page document and slicing it avoids
  // paying browser startup N times, which dominates a large assembly.
  const source = await makePdf([
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ])
  const out = await PDFDocument.create()
  const count = await imposePages(out, source, LETTER, { pages: [2, 0] })
  assert.equal(count, 2)
  assert.equal(out.getPageCount(), 2)
})

test('imposePages ignores out-of-range page requests rather than throwing', async () => {
  const out = await PDFDocument.create()
  const count = await imposePages(out, await makePdf([{ width: 612, height: 792 }]), LETTER, {
    pages: [0, 5, -1],
  })
  assert.equal(count, 1)
})

test('composePdf embeds a shared source once, not once per part', async () => {
  // A book with one generated sheet per member passes the SAME multi-page
  // source many times, taking one page from each. Parsing and embedding it per
  // part is quadratic: on a 196-member document it turned a 3.5s compose into
  // 27s and inflated the output from 7MB to 19MB through duplicated resources.
  // Size is the observable proxy for "embedded once".
  const shared = await makePdf(
    Array.from({ length: 40 }, () => ({ width: 612, height: 792 })),
  )
  const oneEach = await composePdf({
    geometry: LETTER,
    parts: Array.from({ length: 40 }, (_, i) => ({ bytes: shared, pages: [i] })),
  })
  const wholeThing = await composePdf({
    geometry: LETTER,
    parts: [{ bytes: shared }],
  })

  assert.equal(await countPages(oneEach), 40)
  assert.equal(await countPages(wholeThing), 40)
  // Taking 40 single pages from one source must not cost dramatically more
  // than taking all 40 at once.
  assert.ok(
    oneEach.length < wholeThing.length * 2,
    `page-at-a-time composition ballooned: ${oneEach.length} vs ${wholeThing.length}`,
  )
})

test('composePdf insets content by a margin without changing page size', async () => {
  const bytes = await makePdf([{ width: 612, height: 792 }])
  const tight = await composePdf({ geometry: LETTER, parts: [{ bytes }] })
  const loose = await composePdf({ geometry: LETTER, parts: [{ bytes }], marginPt: 72 })

  // The sheet is unchanged; only the drawn content shrinks inside it.
  for (const pdf of [tight, loose]) {
    const doc = await PDFDocument.load(pdf)
    assert.equal(Math.round(doc.getPage(0).getWidth()), 612)
    assert.equal(Math.round(doc.getPage(0).getHeight()), 792)
  }
})

test('a per-part margin overrides the document default', async () => {
  const bytes = await makePdf([{ width: 612, height: 792 }])
  const pdf = await composePdf({
    geometry: LETTER,
    marginPt: 72,
    parts: [{ bytes }, { bytes, marginPt: 0 }],
  })
  assert.equal(await countPages(pdf), 2)
})

test('a letterhead band lands on the first page of its part only', async () => {
  // The band is how a control block sits ON a document instead of consuming a
  // sheet of its own; later pages of the same document must not reserve space
  // for a header they do not have.
  const body = await makePdf([
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ])
  const band = await makePdf([{ width: 612, height: 140 }])
  const pdf = await composePdf({
    geometry: LETTER,
    parts: [{ bytes: body, letterhead: { bytes: band, heightPt: 140 } }],
  })
  // Still one page per source page — the band shares page one rather than
  // adding a sheet.
  assert.equal(await countPages(pdf), 3)
})

test('a letterhead with a missing page degrades to a plain page', async () => {
  const body = await makePdf([{ width: 612, height: 792 }])
  const band = await makePdf([{ width: 612, height: 100 }])
  const pdf = await composePdf({
    geometry: LETTER,
    parts: [{ bytes: body, letterhead: { bytes: band, page: 9, heightPt: 100 } }],
  })
  assert.equal(await countPages(pdf), 1)
})

test('a content box normalises where text lands, regardless of source margins', async () => {
  // The failure this exists for: assembled books inherit each source's own
  // margins, so one document's text column sits at 52% of the page in small
  // type beside another's at 80% in larger type. Fitting the CONTENT box puts
  // both in the same place at a comparable size.
  const narrow = await PDFDocument.create()
  const n = narrow.addPage([612, 792])
  n.drawRectangle({ x: 250, y: 380, width: 110, height: 40 }) // small, centred
  const narrowBytes = await narrow.save()

  const pdf = await composePdf({
    geometry: LETTER,
    parts: [{ bytes: narrowBytes, contentBoxes: [{ left: 250, bottom: 380, right: 360, top: 420 }] }],
    marginPt: 36,
  })

  // One page out, same sheet size; the crop is what changed, not the paper.
  assert.equal(await countPages(pdf), 1)
  assert.deepEqual((await sizesOf(pdf))[0], { width: 612, height: 792 })
})

test('a degenerate content box falls back to the whole page', async () => {
  // An inverted or empty box (a page with no extractable text) must not blank
  // the page — it renders whole, as it would have before.
  const bytes = await makePdf([{ width: 612, height: 792 }])
  for (const box of [
    { left: 100, bottom: 100, right: 100, top: 400 },
    { left: 400, bottom: 400, right: 100, top: 100 },
  ]) {
    const pdf = await composePdf({ geometry: LETTER, parts: [{ bytes, contentBoxes: [box] }] })
    assert.equal(await countPages(pdf), 1)
  }
})

test('content boxes index against the selected pages, not the source order', async () => {
  const bytes = await makePdf([
    { width: 612, height: 792 },
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ])
  // Selecting pages [2, 0] means box[0] applies to source page 2.
  const pdf = await composePdf({
    geometry: LETTER,
    parts: [{ bytes, pages: [2, 0], contentBoxes: [{ left: 0, bottom: 0, right: 300, top: 300 }, null] }],
  })
  assert.equal(await countPages(pdf), 2)
})
