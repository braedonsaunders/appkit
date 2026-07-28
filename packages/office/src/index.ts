// LibreOffice + poppler helpers for office-document pipelines: HTML-authored
// .docx/.pdf renders, draft text extraction, precision plain-text edits inside
// .docx (via the Flat ODT round trip in fodt.ts), and PDF concatenation. Both
// binaries ship in a production worker image; locally
// `brew install --cask libreoffice` + `brew install poppler`.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replaceTextInFodt, type FodtEdit, type FodtEditResult } from './fodt'
import { MAX_DOCX_CONVERSION_BYTES } from './limits'

export const exec = promisify(execFile)

const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_PATH,
  'soffice',
  '/usr/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter((p): p is string => !!p)

export async function resolveSoffice(): Promise<string> {
  for (const candidate of SOFFICE_CANDIDATES) {
    if (candidate.includes('/')) {
      try {
        await access(candidate)
        return candidate
      } catch {
        continue
      }
    } else {
      try {
        await exec(candidate, ['--version'], { timeout: 15_000 })
        return candidate
      } catch {
        continue
      }
    }
  }
  throw new Error(
    'LibreOffice (soffice) is not installed on the worker — install libreoffice (mac: brew install --cask libreoffice) or set SOFFICE_PATH.',
  )
}

/**
 * Convert one office file with LibreOffice headless. `convertTo` is soffice's
 * --convert-to argument (e.g. 'pdf', 'txt:Text'); returns the converted bytes.
 */
export async function sofficeConvert(
  input: Buffer,
  inputName: string,
  convertTo: string,
): Promise<Buffer> {
  const soffice = await resolveSoffice()
  const workDir = await mkdtemp(join(tmpdir(), 'appkit-office-'))
  try {
    const srcPath = join(workDir, inputName)
    await writeFile(srcPath, input)
    await exec(soffice, ['--headless', '--convert-to', convertTo, '--outdir', workDir, srcPath], {
      timeout: 180_000,
      env: { ...process.env, HOME: workDir }, // soffice needs a writable profile dir
    })
    const outExt = convertTo.split(':')[0]!
    const outPath = srcPath.replace(/\.[^.]+$/, `.${outExt}`)
    try {
      // Read directly: checking access and then reopening creates a needless
      // time-of-check/time-of-use window. The private random work directory is
      // cleaned in finally regardless of whether LibreOffice produced output.
      return await readFile(outPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`LibreOffice did not produce a .${outExt} from ${inputName}`)
      }
      throw error
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Concatenate PDFs in order with poppler's pdfunite. */
export async function pdfUnite(pdfs: Buffer[]): Promise<Buffer> {
  if (pdfs.length === 0) throw new Error('pdfUnite needs at least one PDF')
  if (pdfs.length === 1) return pdfs[0]!
  const workDir = await mkdtemp(join(tmpdir(), 'appkit-pdfunite-'))
  try {
    const inputs: string[] = []
    for (let i = 0; i < pdfs.length; i++) {
      const p = join(workDir, `in-${String(i).padStart(4, '0')}.pdf`)
      await writeFile(p, pdfs[i]!)
      inputs.push(p)
    }
    const outPath = join(workDir, 'out.pdf')
    await exec('pdfunite', [...inputs, outPath], { timeout: 180_000 })
    return await readFile(outPath)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function assertConvertibleBytes(byteLength: number, what: string): void {
  if (byteLength > MAX_DOCX_CONVERSION_BYTES) {
    throw new Error(
      `${what} is ${byteLength} bytes, above the ${MAX_DOCX_CONVERSION_BYTES}-byte conversion ceiling`,
    )
  }
}

/** Render a full HTML document (see `officeDocumentHtml`) to a .docx. */
export async function htmlToDocx(html: string): Promise<Buffer> {
  const input = Buffer.from(html, 'utf8')
  assertConvertibleBytes(input.byteLength, 'The HTML document')
  return sofficeConvert(input, 'document.html', 'docx:MS Word 2007 XML')
}

/** Render a full HTML document (see `officeDocumentHtml`) straight to a PDF. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const input = Buffer.from(html, 'utf8')
  assertConvertibleBytes(input.byteLength, 'The HTML document')
  return sofficeConvert(input, 'document.html', 'pdf')
}

/** Render an existing .docx to a PDF. */
export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  assertConvertibleBytes(docx.byteLength, 'The .docx document')
  return sofficeConvert(docx, 'document.docx', 'pdf')
}

/** Extract the plain text of a .docx (the read side of the edit loop). */
export async function docxToText(docx: Buffer): Promise<string> {
  assertConvertibleBytes(docx.byteLength, 'The .docx document')
  return (await sofficeConvert(docx, 'document.docx', 'txt:Text')).toString('utf8')
}

/**
 * Apply exact-match plain-text edits inside a .docx without disturbing its
 * formatting: the document round-trips docx → Flat ODT → `replaceTextInFodt`
 * → docx, so character styles, lists, tables and images all survive. Each
 * result carries the occurrence count (0 = the find string was not present).
 */
export async function replaceTextInDocx(
  docx: Buffer,
  edits: FodtEdit[],
): Promise<{ docx: Buffer; results: FodtEditResult[] }> {
  assertConvertibleBytes(docx.byteLength, 'The .docx document')
  const fodt = (await sofficeConvert(docx, 'document.docx', 'fodt')).toString('utf8')
  const { fodt: edited, results } = replaceTextInFodt(fodt, edits)
  if (!results.some((result) => result.count > 0)) return { docx, results }
  const next = await sofficeConvert(
    Buffer.from(edited, 'utf8'),
    'document.fodt',
    'docx:MS Word 2007 XML',
  )
  return { docx: next, results }
}

export * from './fodt'
export * from './html'
export * from './limits'
export * from './xlsx'
