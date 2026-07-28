import { docxToText, htmlToDocx, htmlToPdf, officeDocumentHtml, pdfUnite, replaceTextInDocx } from './src/index'

const html = officeDocumentHtml({
  bodyHtml: '<h1>Smoke test</h1><p>Wear a hard hat on site.</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
  title: 'Smoke test',
  branding: { companyName: 'AppKit', accentColor: '#1a4f8a', footerText: 'Confidential' },
})
const docx = await htmlToDocx(html)
console.log('docx bytes:', docx.byteLength, 'magic:', docx.subarray(0, 2).toString())
const { docx: edited, results } = await replaceTextInDocx(docx, [{ find: 'hard hat', replace: 'Type II hard hat' }])
console.log('edit results:', JSON.stringify(results))
const text = await docxToText(edited)
console.log('edited text contains replacement:', text.includes('Type II hard hat'))
const pdf = await htmlToPdf(html)
console.log('pdf bytes:', pdf.byteLength, 'magic:', pdf.subarray(0, 5).toString())
const united = await pdfUnite([pdf, pdf])
console.log('united pdf bytes:', united.byteLength, 'magic:', united.subarray(0, 5).toString())
