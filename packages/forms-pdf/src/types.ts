export type FormPdfField = { key: string; label: string; value: string }
export type FormPdfSection = {
  label: string
  columns: { key: string; label: string }[]
  rows: Record<string, string>[]
  moreRows?: number
}
export type FormPdfPhoto = { url: string; caption?: string }
export type FormPdfInput = {
  tenantName: string
  title: string
  reference?: string
  subtitle?: string
  fields: FormPdfField[]
  sections?: FormPdfSection[]
  photos?: FormPdfPhoto[]
  page?: { paperSize?: 'letter' | 'a4' | 'legal'; orientation?: 'portrait' | 'landscape'; marginMm?: number }
}

export type AuthoredFormPdfInput = {
  sourceHtml: string
  values: Record<string, unknown>
  paperSize?: 'letter' | 'a4' | 'legal'
  orientation?: 'portrait' | 'landscape'
  marginMm?: number
  headerHtml?: string | null
  footerHtml?: string | null
  allowRawValues?: boolean
}
