'use client'

import * as React from 'react'
import {
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  Badge,
  Button,
  FilterChips,
  Pagination,
  SearchInput,
  cn,
  toast,
  useListNav,
} from '@appkit/ui'
import {
  attachmentGroup,
  formatAttachmentSize,
  isPreviewableAttachment,
  type AttachedFile,
  type AttachmentAdapter,
  type AttachmentTarget,
} from './attachments'

export const DEFAULT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
export const DEFAULT_ATTACHMENT_PAGE_SIZE = 12
export const DEFAULT_ATTACHMENT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.csv,.xlsx,.docx,.txt,' +
  'application/pdf,image/png,image/jpeg,image/gif,text/csv,text/plain,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface AttachmentPanelLabels {
  title: string
  fileCount: (count: number) => string
  addFiles: string
  searchPlaceholder: string
  searchLabel: string
  typeFilter: string
  allTypes: string
  types: Record<'pdf' | 'image' | 'other', string>
  loading: string
  empty: string
  noMatches: string
  tooLarge: (name: string, maximum: string) => string
  attached: (name: string) => string
  attachFailed: (name: string) => string
  removed: (name: string) => string
  removeFailed: (name: string) => string
  downloadAria: (name: string) => string
  removeAria: (name: string) => string
  uploading: (count: number) => string
  dropShort: string
  openAria: (name: string) => string
  restorePreviewAria: string
  expandPreviewAria: string
  previewTitle: (name: string) => string
  previewEmptyTitle: string
  previewUnavailable: string
  previewEmptyDescription: string
}

const DEFAULT_LABELS: AttachmentPanelLabels = {
  title: 'Attachments',
  fileCount: (count) => `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`,
  addFiles: 'Add files',
  searchPlaceholder: 'Search files…',
  searchLabel: 'Search attachments',
  typeFilter: 'Type',
  allTypes: 'All types',
  types: { pdf: 'PDF', image: 'Image', other: 'Other' },
  loading: 'Loading…',
  empty: 'No files are attached.',
  noMatches: 'No attachments match these filters.',
  tooLarge: (name, maximum) => `${name} exceeds the ${maximum} limit.`,
  attached: (name) => `${name} attached.`,
  attachFailed: (name) => `Could not attach ${name}.`,
  removed: (name) => `${name} removed.`,
  removeFailed: (name) => `Could not remove ${name}.`,
  downloadAria: (name) => `Download ${name}`,
  removeAria: (name) => `Remove ${name}`,
  uploading: (count) => `Uploading ${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}…`,
  dropShort: 'Drop files here or choose files',
  openAria: (name) => `Open ${name}`,
  restorePreviewAria: 'Restore attachment browser',
  expandPreviewAria: 'Expand attachment preview',
  previewTitle: (name) => `Preview ${name}`,
  previewEmptyTitle: 'Select a file to preview',
  previewUnavailable: 'This file type can be downloaded but not previewed here.',
  previewEmptyDescription: 'PDFs and images open in the preview pane.',
}

export type AttachmentPanelFeedback = (event: {
  tone: 'success' | 'error'
  message: string
  error?: unknown
}) => void

export interface AttachmentPanelProps {
  targetTable: string
  targetId: string
  canEdit: boolean
  adapter: AttachmentAdapter
  labels?: Partial<Omit<AttachmentPanelLabels, 'types'>> & { types?: Partial<AttachmentPanelLabels['types']> }
  maxBytes?: number
  pageSize?: number
  accept?: string
  /** Prefix for URL-backed search, type, and page parameters. Defaults to `att`. */
  paramPrefix?: string
  locale?: string
  initialSelectedId?: string | null
  feedback?: AttachmentPanelFeedback
  className?: string
}

/**
 * The complete production attachment workspace: upload, URL-backed search and
 * type filters, paging, preview, download, expansion, and removal. Host apps
 * inject the tenant/authorization-aware storage adapter.
 */
export function AttachmentPanel({
  targetTable,
  targetId,
  canEdit,
  adapter,
  labels: labelOverrides,
  maxBytes = DEFAULT_ATTACHMENT_MAX_BYTES,
  pageSize = DEFAULT_ATTACHMENT_PAGE_SIZE,
  accept = DEFAULT_ATTACHMENT_ACCEPT,
  paramPrefix = 'att',
  locale,
  initialSelectedId = null,
  feedback = defaultFeedback,
  className,
}: AttachmentPanelProps) {
  const labels = React.useMemo<AttachmentPanelLabels>(() => ({
    ...DEFAULT_LABELS,
    ...labelOverrides,
    types: { ...DEFAULT_LABELS.types, ...labelOverrides?.types },
  }), [labelOverrides])
  const target = React.useMemo<AttachmentTarget>(() => ({ targetTable, targetId }), [targetId, targetTable])
  const nav = useListNav()
  const searchParams = React.useMemo(() => new URLSearchParams(nav?.search ?? ''), [nav?.search])
  const currentParams = React.useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])
  const searchKey = `${paramPrefix}q`
  const typeKey = `${paramPrefix}type`
  const pageKey = `${paramPrefix}page`
  const query = (searchParams.get(searchKey) ?? '').trim().toLocaleLowerCase()
  const group = searchParams.get(typeKey) ?? ''
  const parsedPage = Number.parseInt(searchParams.get(pageKey) ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const boundedPageSize = Math.max(1, Math.trunc(pageSize))

  const [items, setItems] = React.useState<AttachedFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(0)
  const [dragOver, setDragOver] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId)
  const [previewExpanded, setPreviewExpanded] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const attachments = await adapter.list(target, signal)
      if (signal?.aborted) return
      setItems(attachments)
      setSelectedId((current) => {
        if (current && attachments.some((item) => item.id === current)) return current
        return attachments.find(isPreviewableAttachment)?.id ?? attachments[0]?.id ?? null
      })
    } catch (error) {
      if (!signal?.aborted) feedback({ tone: 'error', message: errorMessage(error, 'Unable to load attachments.'), error })
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [adapter, feedback, target])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const counts = React.useMemo(() => ({
    pdf: items.filter((item) => attachmentGroup(item) === 'pdf').length,
    image: items.filter((item) => attachmentGroup(item) === 'image').length,
    other: items.filter((item) => attachmentGroup(item) === 'other').length,
  }), [items])
  const filtered = React.useMemo(() => items.filter((item) => {
    if (group && attachmentGroup(item) !== group) return false
    return !query || item.name.toLocaleLowerCase().includes(query)
  }), [group, items, query])
  const pageItems = filtered.slice((page - 1) * boundedPageSize, page * boundedPageSize)
  const selected = items.find((item) => item.id === selectedId) ?? null

  const uploadOne = React.useCallback(async (file: File) => {
    if (file.size > maxBytes) {
      feedback({ tone: 'error', message: labels.tooLarge(file.name, formatAttachmentSize(maxBytes)) })
      return
    }
    setUploading((count) => count + 1)
    try {
      const attachment = await adapter.upload(target, file)
      setItems((current) => [attachment, ...current.filter((item) => item.id !== attachment.id)])
      setSelectedId(attachment.id)
      setPreviewExpanded(false)
      feedback({ tone: 'success', message: labels.attached(file.name) })
    } catch (error) {
      feedback({ tone: 'error', message: errorMessage(error, labels.attachFailed(file.name)), error })
    } finally {
      setUploading((count) => Math.max(0, count - 1))
    }
  }, [adapter, feedback, labels, maxBytes, target])

  const handleFiles = React.useCallback((files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) void uploadOne(file)
  }, [uploadOne])

  const remove = React.useCallback(async (attachment: AttachedFile) => {
    const previousItems = items
    const previousSelectedId = selectedId
    const previousPreviewExpanded = previewExpanded
    const remaining = items.filter((item) => item.attachmentId !== attachment.attachmentId)
    setDeleting(attachment.attachmentId)
    setItems(remaining)
    if (selectedId === attachment.id) {
      setSelectedId(remaining.find(isPreviewableAttachment)?.id ?? remaining[0]?.id ?? null)
      setPreviewExpanded(false)
    }
    try {
      await adapter.remove(target, attachment)
      feedback({ tone: 'success', message: labels.removed(attachment.name) })
    } catch (error) {
      setItems(previousItems)
      setSelectedId(previousSelectedId)
      setPreviewExpanded(previousPreviewExpanded)
      feedback({ tone: 'error', message: errorMessage(error, labels.removeFailed(attachment.name)), error })
    } finally {
      setDeleting(null)
    }
  }, [adapter, feedback, items, labels, previewExpanded, selectedId, target])

  return <div className={cn('min-h-[36rem] p-1', className)}>
    <div className={cn('grid gap-4', !previewExpanded && 'xl:grid-cols-[24rem_minmax(0,1fr)]')}>
      {!previewExpanded ? <aside className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary-subtle text-primary"><Paperclip className="size-4" /></span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg">{labels.title}</h3>
              <p className="text-xs text-fg-muted">{labels.fileCount(items.length)}</p>
            </div>
          </div>
          {canEdit ? <Button size="sm" className="h-8 gap-1.5" onClick={() => inputRef.current?.click()}>
            <UploadCloud className="size-3.5" />{labels.addFiles}
          </Button> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SearchInput
            className="min-w-0 sm:w-full"
            placeholder={labels.searchPlaceholder}
            searchLabel={labels.searchLabel}
            paramKey={searchKey}
            pageParamKey={pageKey}
          />
          <FilterChips
            basePath={nav?.pathname ?? ''}
            currentParams={currentParams}
            paramKey={typeKey}
            pageParamKey={pageKey}
            label={labels.typeFilter}
            allLabel={labels.allTypes}
            options={([
              ['pdf', labels.types.pdf, counts.pdf],
              ['image', labels.types.image, counts.image],
              ['other', labels.types.other, counts.other],
            ] as const).map(([value, label, count]) => ({ value, label, count }))}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" />{labels.loading}
          </div> : pageItems.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
            <Paperclip className="size-7 text-fg-subtle" />
            <p className="text-sm text-fg-muted">{items.length === 0 ? labels.empty : labels.noMatches}</p>
          </div> : <div className="divide-y divide-border-subtle">{pageItems.map((item) => {
            const active = item.id === selectedId
            const canPreview = isPreviewableAttachment(item)
            const Icon = item.contentType.startsWith('image/') ? FileImage : FileText
            return <div key={item.id} className={cn('group flex items-center gap-2.5 px-2 py-2 transition-colors', active ? 'bg-primary-subtle' : 'hover:bg-surface-hover')}>
              <button
                type="button"
                disabled={!canPreview}
                onClick={() => { setSelectedId(item.id); setPreviewExpanded(false) }}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', active ? 'bg-surface text-primary shadow-sm' : 'bg-bg-subtle text-fg-muted')}><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg" title={item.name}>{item.name}</span>
                  <span className="block truncate text-xs text-fg-muted">{formatAttachmentSize(item.sizeBytes)} · {formatCreatedAt(item.createdAt, locale)}</span>
                </span>
              </button>
              <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
                <a href={adapter.url(item, 'download')} download aria-label={labels.downloadAria(item.name)}><Download className="size-4" /></a>
              </Button>
              {canEdit ? <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-fg-subtle hover:text-danger"
                disabled={deleting === item.attachmentId}
                onClick={() => void remove(item)}
                aria-label={labels.removeAria(item.name)}
              >{deleting === item.attachmentId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button> : null}
            </div>
          })}</div>}
          {!loading && filtered.length > 0 ? <Pagination
            basePath={nav?.pathname ?? ''}
            currentParams={currentParams}
            total={filtered.length}
            page={page}
            perPage={boundedPageSize}
            pageParamKey={pageKey}
          /> : null}
        </div>

        {canEdit ? <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); handleFiles(event.dataTransfer.files) }}
          className={cn(
            'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragOver ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong bg-bg-subtle text-fg-muted hover:border-fg-subtle',
          )}
        >{uploading > 0 ? <><Loader2 className="size-4 animate-spin" />{labels.uploading(uploading)}</> : <><UploadCloud className="size-4" />{labels.dropShort}</>}</button> : null}
      </aside> : null}

      <section className={cn(
        'overflow-hidden rounded-xl border border-border bg-bg-subtle shadow-sm',
        previewExpanded ? 'h-[calc(100dvh-12rem)]' : 'min-h-[36rem] xl:h-[calc(100dvh-15rem)]',
      )}>
        {selected && isPreviewableAttachment(selected) ? <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{selected.name}</p>
              <p className="text-xs text-fg-muted">{formatAttachmentSize(selected.sizeBytes)}</p>
            </div>
            <Badge variant="outline">{labels.types[attachmentGroup(selected)]}</Badge>
            <Button asChild variant="ghost" size="icon" className="size-8">
              <a href={adapter.url(selected, 'open')} target="_blank" rel="noopener noreferrer" aria-label={labels.openAria(selected.name)}><ExternalLink className="size-4" /></a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPreviewExpanded((value) => !value)}
              aria-label={previewExpanded ? labels.restorePreviewAria : labels.expandPreviewAria}
            >{previewExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
          </div>
          <div className="min-h-0 flex-1 bg-surface-hover p-2">
            {selected.contentType === 'application/pdf' ? <iframe
              src={pdfPreviewUrl(adapter.url(selected, 'preview'))}
              title={labels.previewTitle(selected.name)}
              className="h-full min-h-[30rem] w-full rounded-lg bg-surface shadow-inner"
            /> : <div className="grid h-full min-h-[30rem] place-items-center overflow-auto rounded-lg bg-bg p-4">
              <img src={adapter.url(selected, 'preview')} alt={selected.name} className="max-h-full max-w-full rounded-md object-contain shadow-xl" />
            </div>}
          </div>
        </div> : <div className="flex h-full min-h-[36rem] flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface text-fg-subtle shadow-sm"><FileText className="size-6" /></span>
          <div>
            <p className="text-sm font-semibold text-fg">{labels.previewEmptyTitle}</p>
            <p className="mt-1 max-w-sm text-sm text-fg-muted">{selected ? labels.previewUnavailable : labels.previewEmptyDescription}</p>
          </div>
        </div>}
      </section>
    </div>

    <input
      ref={inputRef}
      type="file"
      multiple
      accept={accept}
      className="hidden"
      onChange={(event) => { handleFiles(event.target.files); event.target.value = '' }}
    />
  </div>
}

function defaultFeedback(event: Parameters<AttachmentPanelFeedback>[0]): void {
  if (event.tone === 'success') toast.success(event.message)
  else toast.error(event.message)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function formatCreatedAt(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function pdfPreviewUrl(url: string): string {
  return `${url.split('#')[0]}#view=FitH`
}
