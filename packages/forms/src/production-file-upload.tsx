'use client'

import * as React from 'react'
import { Camera, FileUp, Loader2, Trash2 } from 'lucide-react'
import {
  Button,
  uploadReservedFile,
  type FinalizeUploadAction,
  type RequestUploadAction,
} from '@appkit/ui'

export type ProductionAttachedFile = {
  attachmentId: string
  filename: string
  contentType: string
  url: string
}

function kindFromType(mime: string): 'image' | 'document' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || mime.includes('document') || mime.includes('sheet')) {
    return 'document'
  }
  return 'other'
}

export type ProductionFileUploadProps = {
  value: ProductionAttachedFile[]
  onChange: (files: ProductionAttachedFile[]) => void
  requestUpload: RequestUploadAction
  finalizeUpload: FinalizeUploadAction
  accept?: string
  multiple?: boolean
  maxFiles?: number
  onUploadingChange?: (uploading: boolean) => void
  variant?: 'photo' | 'file' | 'video' | 'audio'
}

/**
 * Production form-field uploader: controlled attachments, environment camera
 * capture, bounded counts, reserved upload/finalize protocol, previews, and
 * removal. Storage policy remains an injected application boundary.
 */
export function ProductionFileUpload({
  value,
  onChange,
  requestUpload,
  finalizeUpload,
  accept,
  multiple = true,
  maxFiles,
  onUploadingChange,
  variant = 'file',
}: ProductionFileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const uploadingCallback = React.useRef(onUploadingChange)

  React.useEffect(() => {
    uploadingCallback.current = onUploadingChange
  }, [onUploadingChange])

  React.useEffect(() => {
    uploadingCallback.current?.(pending)
  }, [pending])

  React.useEffect(() => () => uploadingCallback.current?.(false), [])

  async function uploadOne(file: File): Promise<ProductionAttachedFile | null> {
    const request = await requestUpload({
      kind: kindFromType(file.type),
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    })
    if (!request.ok) {
      setError(request.error)
      return null
    }
    let finalizeInput
    try {
      finalizeInput = await uploadReservedFile(request, file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
      return null
    }
    const finalized = await finalizeUpload(finalizeInput)
    if (!finalized.ok) {
      setError(finalized.error)
      return null
    }
    return {
      attachmentId: finalized.attachmentId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      url: finalized.url,
    }
  }

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = maxFiles === undefined ? files.length : Math.max(0, maxFiles - value.length)
    if (remaining === 0) {
      setError(`Maximum ${maxFiles} file${maxFiles === 1 ? '' : 's'}.`)
      return
    }
    setError(null)
    startTransition(async () => {
      const uploaded: ProductionAttachedFile[] = []
      for (const file of Array.from(files).slice(0, remaining)) {
        const result = await uploadOne(file)
        if (result) uploaded.push(result)
      }
      onChange([...value, ...uploaded])
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  const acceptValue = accept ?? (
    variant === 'photo' ? 'image/*'
      : variant === 'video' ? 'video/*'
        : variant === 'audio' ? 'audio/*'
          : undefined
  )
  const atLimit = maxFiles !== undefined && value.length >= maxFiles

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={acceptValue}
        multiple={multiple}
        capture={variant === 'photo' ? 'environment' : undefined}
        className="hidden"
        onChange={(event) => onFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending || atLimit}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-bg-subtle px-3 py-6 text-sm text-fg-muted transition-colors hover:border-primary hover:bg-primary-subtle disabled:opacity-50"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : variant === 'photo' ? <Camera size={16} /> : <FileUp size={16} />}
        {atLimit ? `Maximum ${maxFiles} files` : pending ? 'Uploading…' : variant === 'photo' ? 'Add photo' : variant === 'video' ? 'Add video' : variant === 'audio' ? 'Add audio' : 'Add file'}
      </button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      {value.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((file) => (
            <li key={file.attachmentId} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                {file.contentType.startsWith('image/') ? (
                  // The host supplies access-controlled attachment URLs.
                  <img src={file.url} alt="" className="size-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded bg-bg-subtle text-fg-subtle"><FileUp size={14} /></span>
                )}
                <span className="truncate font-medium text-fg">{file.filename}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((candidate) => candidate.attachmentId !== file.attachmentId))}>
                <Trash2 size={12} className="text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [metadata, encoded] = dataUrl.split(',')
  const mime = metadata?.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const binary = atob(encoded ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], filename, { type: mime })
}
