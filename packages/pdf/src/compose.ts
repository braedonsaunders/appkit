import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { PAPER_PORTRAIT_PT } from './page'
import type { PdfPaperSize } from './types'

// Composition primitives for stitching many source PDFs into one book.
//
// `pdfunite` concatenates bytes and nothing else: every source keeps its own
// page size, so a book assembled from LibreOffice output (A4) plus scanned
// uploads (Letter) plus an HTML cover (Letter) physically changes paper size as
// you page through it. These helpers impose every page onto one geometry and
// can stamp page furniture afterwards, which byte concatenation cannot do at
// all.

export type PageGeometry = { width: number; height: number }

/**
 * Geometry for a paper size, in points. Reuses the renderer's own paper table
 * so a composed book and a generated page cannot disagree about what "letter"
 * means.
 */
export function pageGeometry(
  size: PdfPaperSize,
  orientation: 'portrait' | 'landscape',
): PageGeometry {
  const base = PAPER_PORTRAIT_PT[size]
  return orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : { width: base.width, height: base.height }
}

function normalizeAngle(angle: number): number {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360
}

/**
 * Append every page of `source` to `out`, each centred on a page of exactly
 * `geometry` and scaled to fit without distortion.
 *
 * Honours `/Rotate`. A scanner that writes a landscape MediaBox with
 * `/Rotate 270` is displaying a portrait page, so the VISUAL box drives both
 * the fit and the placement — using the raw MediaBox would letterbox a
 * perfectly ordinary portrait scan into a sideways strip.
 *
 * Pages are never enlarged beyond 1:1 by default: blowing a small page up to
 * fill Letter magnifies scan artefacts and looks worse than honest margins.
 */
export async function imposePages(
  out: PDFDocument,
  sourceBytes: Uint8Array,
  geometry: PageGeometry,
  options: { allowUpscale?: boolean; pages?: readonly number[]; margin?: number } = {},
): Promise<number> {
  const src = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  const available = src.getPageIndices()
  // A caller may want specific pages: rendering many small sheets as ONE
  // multi-page document and slicing it is dramatically cheaper than paying
  // browser startup per sheet.
  const indices = options.pages
    ? options.pages.filter((i) => Number.isInteger(i) && i >= 0 && i < available.length)
    : available
  if (indices.length === 0) return 0

  // A page with no content stream — a truly blank sheet, which scanners do
  // emit — cannot be embedded. It still occupies a page in the original, so
  // reproduce it as a blank page rather than failing the whole book.
  const drawable: number[] = []
  const blank = new Set<number>()
  for (const index of indices) {
    if (src.getPage(index).node.Contents()) drawable.push(index)
    else blank.add(index)
  }
  const embeddedByIndex = new Map<number, Awaited<ReturnType<typeof out.embedPdf>>[number]>()
  if (drawable.length > 0) {
    const embeds = await out.embedPdf(src, drawable)
    drawable.forEach((index, i) => embeddedByIndex.set(index, embeds[i]!))
  }

  indices.forEach((index) => {
    drawImposed(
      out,
      src,
      blank.has(index) ? undefined : embeddedByIndex.get(index),
      index,
      geometry,
      options,
    )
  })

  return indices.length
}

type EmbeddedPage = Awaited<ReturnType<PDFDocument['embedPdf']>>[number]

/**
 * Place one already-embedded page onto a fresh page of `geometry`.
 *
 * Shared by both entry points so the fit, the rotation handling and the
 * blank-page fallback cannot drift apart between them.
 */
function drawImposed(
  out: PDFDocument,
  src: PDFDocument,
  page: EmbeddedPage | undefined,
  index: number,
  geometry: PageGeometry,
  options: { allowUpscale?: boolean; margin?: number; reserveTopPt?: number },
): void {
  if (!page) {
    out.addPage([geometry.width, geometry.height])
    return
  }
  // The box the content may occupy: the sheet, less a uniform inset, less any
  // band reserved at the top for a letterhead.
  const margin = Math.max(0, options.margin ?? 0)
  const reserveTop = Math.max(0, options.reserveTopPt ?? 0)
  const boxWidth = Math.max(1, geometry.width - margin * 2)
  const boxHeight = Math.max(1, geometry.height - margin * 2 - reserveTop)
  const boxBottom = margin
  const rotation = normalizeAngle(src.getPage(index).getRotation().angle)
  const quarterTurned = rotation === 90 || rotation === 270
  // Visual dimensions after the viewer applies /Rotate.
  const visualWidth = quarterTurned ? page.height : page.width
  const visualHeight = quarterTurned ? page.width : page.height

  const fit = Math.min(boxWidth / visualWidth, boxHeight / visualHeight)
  const scale = options.allowUpscale ? fit : Math.min(fit, 1)
  const drawnWidth = visualWidth * scale
  const drawnHeight = visualHeight * scale
  const left = margin + (boxWidth - drawnWidth) / 2
  const bottom = boxBottom + (boxHeight - drawnHeight) / 2

  // drawPage rotates about the anchor point, which moves the box out of the
  // slot just measured. Shift the anchor to the corner the rotation sweeps the
  // content away from.
  const anchor =
    rotation === 90
      ? { x: left + drawnWidth, y: bottom }
      : rotation === 180
        ? { x: left + drawnWidth, y: bottom + drawnHeight }
        : rotation === 270
          ? { x: left, y: bottom + drawnHeight }
          : { x: left, y: bottom }

  out.addPage([geometry.width, geometry.height]).drawPage(page, {
    xScale: scale,
    yScale: scale,
    x: anchor.x,
    y: anchor.y,
    rotate: degrees(rotation),
  })
}

export type FooterCell = { left: string; center: string; right: string }

export type StampFooterOptions = {
  /** Called per page (1-based) with the total, returning the three columns. */
  cells: (pageNumber: number, pageCount: number) => FooterCell | null
  /** Optional second line, centred — typically the company name. */
  subline?: (pageNumber: number, pageCount: number) => string | null
  marginPt?: number
  fontSize?: number
}

/**
 * Draw a three-column footer onto every page.
 *
 * Returning `null` from `cells` skips a page, which is how the cover stays
 * clean while the body is numbered.
 */
export async function stampFooter(doc: PDFDocument, options: StampFooterOptions): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = options.fontSize ?? 7.5
  const margin = options.marginPt ?? 28
  const grey = rgb(0.42, 0.45, 0.5)
  const pages = doc.getPages()

  pages.forEach((page, index) => {
    const cells = options.cells(index + 1, pages.length)
    if (!cells) return
    drawRow(page, font, size, margin, grey, cells)
    const sub = options.subline?.(index + 1, pages.length)
    if (sub) {
      const width = font.widthOfTextAtSize(sub, size)
      page.drawText(sub, {
        x: (page.getWidth() - width) / 2,
        y: margin - size - 2,
        size,
        font,
        color: grey,
      })
    }
  })
}

function drawRow(
  page: PDFPage,
  font: PDFFont,
  size: number,
  margin: number,
  color: ReturnType<typeof rgb>,
  cells: FooterCell,
): void {
  const y = margin
  if (cells.left) page.drawText(cells.left, { x: margin, y, size, font, color })
  if (cells.center) {
    const width = font.widthOfTextAtSize(cells.center, size)
    page.drawText(cells.center, { x: (page.getWidth() - width) / 2, y, size, font, color })
  }
  if (cells.right) {
    const width = font.widthOfTextAtSize(cells.right, size)
    page.drawText(cells.right, { x: page.getWidth() - margin - width, y, size, font, color })
  }
}

/** Page count without imposing anything — used to number a table of contents. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

export type ComposePart = {
  bytes: Uint8Array
  /** Excluded from footer stamping — used for covers and section dividers. */
  unnumbered?: boolean
  /** Zero-based subset of the source's pages, in the order given. */
  pages?: readonly number[]
  /** Inset for this part's content, overriding the document default. */
  marginPt?: number
  /**
   * A band drawn across the top of this part's FIRST page, with the page's own
   * content fitted beneath it.
   *
   * This is how a control block or letterhead sits ON a document rather than
   * consuming a sheet of its own. The source page here is already rendered, so
   * its content cannot reflow to make room — it is scaled to the reduced box
   * instead, which is why only the first page carries the band.
   */
  letterhead?: {
    bytes: Uint8Array
    /** Page within `bytes`. Defaults to 0. */
    page?: number
    /** Height of the band, in points. */
    heightPt: number
  }
}

export type ComposePdfInput = {
  geometry: PageGeometry
  parts: ComposePart[]
  /** Inset applied to every part's content, in points. Defaults to 0. */
  marginPt?: number
  footer?: Omit<StampFooterOptions, 'cells'> & {
    cells: (pageNumber: number, pageCount: number) => FooterCell | null
  }
  allowUpscale?: boolean
  title?: string
  author?: string
  /** Written to the PDF's Producer field; defaults to the package name. */
  producer?: string
}

/**
 * Impose an ordered list of PDFs onto one geometry and return the result.
 *
 * This is the whole reason the book pipeline no longer shells out to
 * `pdfunite`: concatenation cannot normalise page size, cannot number pages
 * across documents, and cannot stamp a footer. Keeping pdf-lib behind this
 * function also keeps it a dependency of one package rather than three.
 *
 * Footer numbering counts only numbered pages, so a cover does not consume
 * "page 1" and the printed numbers match what a reader would count.
 */
export async function composePdf(input: ComposePdfInput): Promise<Buffer> {
  const out = await PDFDocument.create()
  const numbered: boolean[] = []

  // Parts frequently share a source: one multi-page document of generated
  // sheets contributes a single page to each member. Parsing and embedding that
  // source once per part is quadratic — on a 196-document book it turned a 12
  // second render into 35 and inflated the output by 5 MB through duplicated
  // resources. Each distinct source is loaded once and every page it
  // contributes is embedded in a single call.
  const sources = new Map<Uint8Array, { doc: PDFDocument; embedded: Map<number, EmbeddedPage> }>()
  const register = async (bytes: Uint8Array) => {
    if (sources.has(bytes)) return
    sources.set(bytes, {
      doc: await PDFDocument.load(bytes, { ignoreEncryption: true }),
      embedded: new Map(),
    })
  }
  for (const part of input.parts) {
    await register(part.bytes)
    if (part.letterhead) await register(part.letterhead.bytes)
  }
  for (const [bytes, source] of sources) {
    const available = source.doc.getPageIndices()
    const wanted = new Set<number>()
    for (const part of input.parts) {
      if (part.letterhead?.bytes === bytes) {
        const page = part.letterhead.page ?? 0
        if (page < available.length && source.doc.getPage(page).node.Contents()) wanted.add(page)
      }
      if (part.bytes !== bytes) continue
      const indices = part.pages
        ? part.pages.filter((i) => Number.isInteger(i) && i >= 0 && i < available.length)
        : available
      for (const index of indices) {
        if (source.doc.getPage(index).node.Contents()) wanted.add(index)
      }
    }
    const order = [...wanted]
    if (order.length === 0) continue
    const embeds = await out.embedPdf(source.doc, order)
    order.forEach((index, i) => source.embedded.set(index, embeds[i]!))
  }

  for (const part of input.parts) {
    const source = sources.get(part.bytes)!
    const available = source.doc.getPageIndices()
    const indices = part.pages
      ? part.pages.filter((i) => Number.isInteger(i) && i >= 0 && i < available.length)
      : available
    const margin = Math.max(0, part.marginPt ?? input.marginPt ?? 0)
    indices.forEach((index, position) => {
      // The band belongs to the first page of the part only: later pages have
      // no header in a controlled document, and reserving space on all of them
      // would waste a strip on every sheet.
      const band = position === 0 ? part.letterhead : undefined
      const reserved = band ? Math.max(0, band.heightPt) : 0
      drawImposed(out, source.doc, source.embedded.get(index), index, input.geometry, {
        allowUpscale: input.allowUpscale,
        margin,
        reserveTopPt: reserved,
      })
      if (band) {
        const bandSource = sources.get(band.bytes)!
        const bandPage = bandSource.embedded.get(band.page ?? 0)
        if (bandPage) {
          const page = out.getPage(out.getPageCount() - 1)
          const usable = input.geometry.width - margin * 2
          const scale = Math.min(usable / bandPage.width, reserved / bandPage.height, 1)
          page.drawPage(bandPage, {
            xScale: scale,
            yScale: scale,
            x: margin + (usable - bandPage.width * scale) / 2,
            y: input.geometry.height - margin - bandPage.height * scale,
          })
        }
      }
      numbered.push(!part.unnumbered)
    })
  }

  if (input.footer) {
    const total = numbered.filter(Boolean).length
    let seen = 0
    const { cells, ...rest } = input.footer
    await stampFooter(out, {
      ...rest,
      cells: (page) => {
        if (!numbered[page - 1]) return null
        seen += 1
        return cells(seen, total)
      },
    })
  }

  if (input.title) out.setTitle(input.title)
  if (input.author) out.setAuthor(input.author)
  out.setProducer(input.producer?.trim() || 'appkit-pdf')
  out.setCreationDate(new Date())

  return Buffer.from(await out.save())
}
