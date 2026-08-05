import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exec, htmlToPdf, officeDocumentHtml, resolveSoffice } from './index'

test('htmlToPdf does not add a blank first page', async (context) => {
  try {
    await resolveSoffice()
    await exec('pdfinfo', ['-v'], { timeout: 15_000 })
  } catch {
    context.skip('LibreOffice and Poppler are required for the render-level regression test')
    return
  }

  const workDir = await mkdtemp(join(tmpdir(), 'appkit-office-test-'))
  try {
    const output = join(workDir, 'output.pdf')
    const pdf = await htmlToPdf(
      officeDocumentHtml({
        title: 'One-page regression',
        bodyHtml: '<h1>Deposit detail</h1><p>This content belongs on the first page.</p>',
      }),
    )
    await writeFile(output, pdf)
    const { stdout } = await exec('pdfinfo', [output], { timeout: 15_000 })
    assert.match(stdout, /^Pages:\s+1$/m)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
})
