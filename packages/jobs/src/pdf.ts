import { randomUUID } from 'node:crypto'
import { QueueEvents, type JobsOptions, type Processor, type Queue } from 'bullmq'
import type { EmailAttachment } from './email'
import type { Jobs } from './index'
import { createProfileQueue, createProfileWorker, type QueueProfileOverrides } from './profile'
import {
  assertIdentifier,
  assertJsonBytes,
  assertOptionalString,
  assertQueueJobId,
  assertString,
  assertUuid,
} from './validation'

export const PDF_QUEUE = 'pdfs'

export const PDF_QUEUE_PROFILE = {
  name: PDF_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { age: 3 * 24 * 3_600 },
    removeOnFail: { age: 30 * 24 * 3_600 },
  },
  workerConcurrency: 3,
} as const

export type PdfEmailPayload = {
  to: string[]
  subject: string
  html: string
  text: string
  filename: string
  category?: string
  tenantId?: string
  attachments?: EmailAttachment[]
}

export type PdfArtifactTarget = { kind: 'form_response'; responseId: string }

export type PdfJobData =
  | {
      kind: 'record_summary'
      tenantId: string
      subjectId: string
      entityType: string
      heading: string
      reference?: string | null
      subtitle?: string | null
      fields: { label: string; value: string }[]
      sections?: {
        label: string
        columns: { key: string; label: string }[]
        rows: Record<string, string>[]
        moreRows?: number
      }[]
      photos?: { url: string; caption?: string }[]
      filename?: string
      artifactTarget?: PdfArtifactTarget
      email?: PdfEmailPayload
    }
  | {
      kind: 'template_pdf'
      tenantId: string
      html: string
      paperSize: 'letter' | 'a4' | 'legal'
      orientation: 'portrait' | 'landscape'
      marginMm: number
      headerHtml?: string | null
      footerHtml?: string | null
      entityType: string
      entityId: string
      filename?: string
      artifactTarget?: PdfArtifactTarget
      email?: PdfEmailPayload
    }
  | { kind: 'document_version_render'; tenantId: string; documentId: string; versionId: string }
  | { kind: 'document_master_pdf'; tenantId: string; documentId: string }
  | { kind: 'document_book'; tenantId: string; bookId: string }
  | {
      kind: 'document_bundle'
      tenantId: string
      parts: {
        html: string
        paperSize: 'letter' | 'a4' | 'legal'
        orientation: 'portrait' | 'landscape'
        marginMm: number
        headerHtml?: string | null
        footerHtml?: string | null
      }[]
      filename: string
      entityType: string
      entityId: string
      email?: PdfEmailPayload
    }

export type RecordSummaryPdfJobData = Omit<
  Extract<PdfJobData, { kind: 'record_summary' }>,
  'artifactTarget' | 'email'
>

type WithoutPdfDelivery<T> = T extends unknown
  ? Omit<T, 'artifactTarget' | 'email'> & { artifactTarget?: never; email?: never }
  : never

export type OnDemandPdfJobData = WithoutPdfDelivery<
  | Extract<PdfJobData, { kind: 'record_summary' }>
  | Extract<PdfJobData, { kind: 'template_pdf' }>
  | Extract<PdfJobData, { kind: 'document_master_pdf' }>
  | Extract<PdfJobData, { kind: 'document_book' }>
  | Extract<PdfJobData, { kind: 'document_bundle' }>
>

export type RenderedPdfArtifact = {
  attachmentId?: string | null
  r2Key: string
  sizeBytes: number
  filename: string
}

const MAX_PDF_JOB_BYTES = 16 * 1024 * 1024
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_RECORD_FIELDS = 500
const MAX_RECORD_SECTIONS = 50
const MAX_SECTION_COLUMNS = 20
const MAX_SECTION_ROWS = 5_000
const MAX_RECORD_PHOTOS = 100
const MAX_BUNDLE_PARTS = 50

function assertFilename(value: string | undefined, label: string): void {
  if (value === undefined) return
  assertString(value, label, { min: 1, max: 200 })
  if (/[\\/\r\n\u0000]/.test(value)) throw new Error(`${label} contains unsafe characters.`)
}

function assertPageSetup(data: { paperSize: string; orientation: string; marginMm: number }): void {
  if (!['letter', 'a4', 'legal'].includes(data.paperSize)) throw new Error('PDF paperSize is invalid.')
  if (!['portrait', 'landscape'].includes(data.orientation)) throw new Error('PDF orientation is invalid.')
  if (!Number.isFinite(data.marginMm) || data.marginMm < 0 || data.marginMm > 50) {
    throw new Error('PDF marginMm must be between 0 and 50.')
  }
}

function assertArtifactTarget(
  data: Extract<PdfJobData, { kind: 'record_summary' | 'template_pdf' }>,
): void {
  const target = data.artifactTarget
  if (!target) return
  if (data.email) throw new Error('A PDF email job cannot also persist a durable artifact.')
  if (target.kind !== 'form_response') throw new Error('PDF artifact target is invalid.')
  assertUuid(target.responseId, 'PDF artifact target responseId')
  const entityId = data.kind === 'record_summary' ? data.subjectId : data.entityId
  if (data.entityType !== 'form_response' || entityId !== target.responseId) {
    throw new Error('PDF artifact target identity does not match the rendered entity.')
  }
}

export function assertPdfJobData(data: PdfJobData): void {
  assertJsonBytes(data, 'PDF job', MAX_PDF_JOB_BYTES)
  assertUuid(data.tenantId, 'PDF tenantId')
  switch (data.kind) {
    case 'record_summary': {
      assertUuid(data.subjectId, 'PDF subjectId')
      assertIdentifier(data.entityType, 'PDF entityType', 100)
      assertString(data.heading, 'PDF heading', { min: 1, max: 300 })
      if (data.reference !== null) assertOptionalString(data.reference, 'PDF reference', 300)
      if (data.subtitle !== null) assertOptionalString(data.subtitle, 'PDF subtitle', 1_000)
      assertFilename(data.filename, 'PDF filename')
      if (!Array.isArray(data.fields) || data.fields.length > MAX_RECORD_FIELDS) {
        throw new Error(`PDF fields may contain at most ${MAX_RECORD_FIELDS} entries.`)
      }
      for (const field of data.fields) {
        assertString(field.label, 'PDF field label', { min: 1, max: 300 })
        assertString(field.value, 'PDF field value', { max: 20_000 })
      }
      if ((data.sections?.length ?? 0) > MAX_RECORD_SECTIONS) {
        throw new Error(`PDF sections may contain at most ${MAX_RECORD_SECTIONS} entries.`)
      }
      let rowCount = 0
      for (const section of data.sections ?? []) {
        assertString(section.label, 'PDF section label', { min: 1, max: 300 })
        if (section.columns.length === 0 || section.columns.length > MAX_SECTION_COLUMNS) {
          throw new Error(`PDF section columns must contain 1-${MAX_SECTION_COLUMNS} entries.`)
        }
        for (const column of section.columns) {
          assertIdentifier(column.key, 'PDF section column key', 200)
          assertString(column.label, 'PDF section column label', { min: 1, max: 300 })
        }
        rowCount += section.rows.length
        if (rowCount > MAX_SECTION_ROWS) {
          throw new Error(`PDF sections may contain at most ${MAX_SECTION_ROWS} total rows.`)
        }
        if (section.moreRows !== undefined && (!Number.isSafeInteger(section.moreRows) || section.moreRows < 0)) {
          throw new Error('PDF section moreRows is invalid.')
        }
        for (const row of section.rows) {
          for (const value of Object.values(row)) assertString(value, 'PDF section cell', { max: 20_000 })
        }
      }
      if ((data.photos?.length ?? 0) > MAX_RECORD_PHOTOS) {
        throw new Error(`PDF photos may contain at most ${MAX_RECORD_PHOTOS} entries.`)
      }
      for (const photo of data.photos ?? []) {
        assertString(photo.url, 'PDF photo URL', { min: 1, max: 4_096 })
        assertOptionalString(photo.caption, 'PDF photo caption', 1_000)
      }
      assertArtifactTarget(data)
      break
    }
    case 'template_pdf':
      assertString(data.html, 'PDF HTML', { max: MAX_HTML_BYTES })
      if (Buffer.byteLength(data.html) > MAX_HTML_BYTES) throw new Error('PDF HTML is too large.')
      assertPageSetup(data)
      if (data.headerHtml !== null) assertOptionalString(data.headerHtml, 'PDF header HTML', 262_144)
      if (data.footerHtml !== null) assertOptionalString(data.footerHtml, 'PDF footer HTML', 262_144)
      assertIdentifier(data.entityType, 'PDF entityType', 100)
      assertUuid(data.entityId, 'PDF entityId')
      assertFilename(data.filename, 'PDF filename')
      assertArtifactTarget(data)
      break
    case 'document_version_render':
      assertUuid(data.documentId, 'PDF documentId')
      assertUuid(data.versionId, 'PDF versionId')
      break
    case 'document_master_pdf':
      assertUuid(data.documentId, 'PDF documentId')
      break
    case 'document_book':
      assertUuid(data.bookId, 'PDF bookId')
      break
    case 'document_bundle':
      assertUuid(data.entityId, 'PDF entityId')
      assertIdentifier(data.entityType, 'PDF entityType', 100)
      assertFilename(data.filename, 'PDF filename')
      if (data.parts.length === 0 || data.parts.length > MAX_BUNDLE_PARTS) {
        throw new Error(`PDF bundle parts must contain 1-${MAX_BUNDLE_PARTS} entries.`)
      }
      for (const part of data.parts) {
        assertString(part.html, 'PDF bundle HTML', { max: MAX_HTML_BYTES })
        if (Buffer.byteLength(part.html) > MAX_HTML_BYTES) throw new Error('PDF bundle HTML is too large.')
        assertPageSetup(part)
        if (part.headerHtml !== null) assertOptionalString(part.headerHtml, 'PDF bundle header HTML', 262_144)
        if (part.footerHtml !== null) assertOptionalString(part.footerHtml, 'PDF bundle footer HTML', 262_144)
      }
      break
  }
}

export function pdfJobId(data: PdfJobData): string {
  switch (data.kind) {
    case 'record_summary': return `pdf|${data.tenantId}|record_summary|${data.subjectId}`
    case 'template_pdf': return `pdf|${data.tenantId}|template_pdf|${data.entityId}`
    case 'document_version_render': return `pdf|${data.tenantId}|document_version_render|${data.versionId}`
    case 'document_master_pdf': return `pdf|${data.tenantId}|document_master_pdf|${data.documentId}`
    case 'document_book': return `pdf|${data.tenantId}|document_book|${data.bookId}`
    case 'document_bundle': return `pdf|${data.tenantId}|document_bundle|${data.entityId}`
  }
}

function isRenderedPdfArtifact(value: unknown): value is RenderedPdfArtifact {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<RenderedPdfArtifact>
  return (
    (result.attachmentId === undefined || result.attachmentId === null || typeof result.attachmentId === 'string') &&
    typeof result.r2Key === 'string' &&
    typeof result.sizeBytes === 'number' &&
    typeof result.filename === 'string'
  )
}

type WithoutArtifactTarget<T> = T extends unknown
  ? Omit<T, 'artifactTarget'> & { artifactTarget?: never }
  : never

export type PdfEmailableJobData = WithoutArtifactTarget<
  Extract<PdfJobData, { kind: 'record_summary' | 'template_pdf' | 'document_bundle' }>
>

export function createPdfQueue(jobs: Jobs, overrides: QueueProfileOverrides = {}) {
  let queue: Queue<PdfJobData, unknown> | undefined
  const getQueue = () => queue ??= createProfileQueue<PdfJobData>(jobs, PDF_QUEUE_PROFILE, overrides)

  async function addPdfJob(data: PdfJobData, opts?: JobsOptions) {
    assertPdfJobData(data)
    const target = getQueue()
    const jobId = pdfJobId(data)
    const existing = await target.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state !== 'completed' && state !== 'failed') return existing
      await existing.remove()
    }
    return target.add(data.kind, data, { ...opts, jobId })
  }

  async function enqueuePdf(data: PdfJobData, deterministicJobId?: string) {
    assertPdfJobData(data)
    assertQueueJobId(deterministicJobId, 'PDF deterministic jobId')
    const target = getQueue()
    if (deterministicJobId) {
      const existing = await target.getJob(deterministicJobId)
      if (existing) {
        const state = await existing.getState()
        if (state !== 'failed') return
        await existing.remove()
      }
      await target.add(data.kind, data, { jobId: deterministicJobId })
      return
    }
    await addPdfJob(data)
  }

  async function renderPdfOnDemand(
    data: OnDemandPdfJobData,
    opts: { timeoutMs?: number } = {},
  ): Promise<RenderedPdfArtifact> {
    if (data.artifactTarget || data.email) throw new Error('On-demand PDF jobs must use transient artifact delivery.')
    if (opts.timeoutMs !== undefined && (!Number.isSafeInteger(opts.timeoutMs) || opts.timeoutMs < 1_000 || opts.timeoutMs > 120_000)) {
      throw new Error('On-demand PDF timeout must be between 1,000 and 120,000 milliseconds.')
    }
    const job = await addPdfJob(data, {
      attempts: 1,
      removeOnComplete: { age: 3_600 },
      removeOnFail: { age: 24 * 3_600 },
    })
    const events = new QueueEvents(overrides.name ?? PDF_QUEUE, { connection: jobs.getBlockingConnection() })
    try {
      await events.waitUntilReady()
      const result = await job.waitUntilFinished(events, opts.timeoutMs ?? 60_000)
      if (!isRenderedPdfArtifact(result)) {
        throw new Error(`PDF job ${job.id} completed without a generated PDF artifact`)
      }
      return result
    } finally {
      await events.close()
    }
  }

  async function enqueuePdfEmail(
    pdf: PdfEmailableJobData,
    email: PdfEmailPayload,
    deterministicJobId?: string,
  ) {
    if ('artifactTarget' in pdf && pdf.artifactTarget) {
      throw new Error('A PDF email job cannot also persist a durable artifact.')
    }
    const jobId = deterministicJobId ?? `${pdfJobId(pdf)}|email|${randomUUID()}`
    assertQueueJobId(jobId, 'PDF email jobId')
    const data = { ...pdf, email } as PdfJobData
    assertPdfJobData(data)
    await getQueue().add(pdf.kind, data, { jobId, attempts: 2 })
  }

  async function enqueueDocumentVersionRender(
    data: Extract<PdfJobData, { kind: 'document_version_render' }>,
  ) {
    await addPdfJob(data, { attempts: 2 })
  }

  return {
    getQueue,
    enqueuePdf,
    renderPdfOnDemand,
    enqueuePdfEmail,
    enqueueDocumentVersionRender,
    createWorker<R>(processor: Processor<PdfJobData, R>) {
      return createProfileWorker(jobs, PDF_QUEUE_PROFILE, processor, overrides)
    },
  }
}
