// S3-compatible object storage (Cloudflare R2 in prod, MinIO in dev, or AWS).
// Same code path either way — only the endpoint and credentials change.

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
  type LifecycleRule,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { storageObjectTagging, withManagedStorageLifecycleRules, type StorageObjectLifecycle } from './lifecycle'
import { MULTIPART_UPLOAD_PART_SIZE_BYTES, multipartPartCount, shouldUseMultipartUpload } from './multipart'

export * from './keys'
export * from './lifecycle'
export * from './multipart'
export * from './attachments'

export type StorageConfig = {
  /** e.g. http://localhost:9000 (MinIO) or https://{account}.r2.cloudflarestorage.com */
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  /** Path-style addressing (required for MinIO/R2). Default true. */
  forcePathStyle?: boolean
  /** Required for Cloudflare R2 after public development/custom domains are disabled. */
  privateBucketConfirmed?: boolean
  /** Existing client for custom middleware, tracing, or deterministic tests. */
  client?: S3Client
  /** Object tag key used by pending/transient lifecycle rules. */
  stateTagKey?: string
}

export type PutObjectInput = {
  key: string
  body: Uint8Array | Buffer | string
  contentType?: string
  metadata?: Record<string, string>
  contentDisposition?: 'inline' | 'attachment'
  lifecycle?: StorageObjectLifecycle
  tagging?: string
}

export type StoredObjectMetadata = {
  contentLength: number
  contentType: string | null
  contentDisposition: string | null
  metadata: Readonly<Record<string, string>>
  etag: string | null
}

export type Storage = {
  bucket: string
  client: S3Client
  put: (input: PutObjectInput) => Promise<void>
  /** Fetch an object's bytes. */
  getBytes: (key: string) => Promise<Uint8Array>
  delete: (key: string) => Promise<void>
  /** Object metadata; null if it doesn't exist. */
  head: (key: string) => Promise<{ size: number; contentType?: string } | null>
  headObject: (key: string) => Promise<StoredObjectMetadata | null>
  exists: (key: string) => Promise<boolean>
  getRange: (key: string, start: number, end: number, ifMatch?: string) => Promise<Uint8Array>
  getStream: (key: string) => Promise<{ stream: ReadableStream; contentLength?: number; contentType?: string }>
  /** A presigned URL to upload directly (PUT). */
  presignPut: (key: string, opts?: { expiresIn?: number; contentType?: string; metadata?: Record<string, string>; tagging?: string }) => Promise<string>
  /** A presigned URL to download directly (GET). */
  presignGet: (key: string, opts?: { expiresIn?: number }) => Promise<string>
  presignExistingGet: (key: string, opts?: { expiresIn?: number }) => Promise<string | null>
  createMultipartUpload: (input: { key: string; contentType: string; contentDisposition?: 'inline' | 'attachment'; uploadToken?: string; lifecycle?: StorageObjectLifecycle; tagging?: string }) => Promise<string>
  presignMultipartPart: (key: string, uploadId: string, partNumber: number, expiresIn?: number) => Promise<string>
  completeMultipartUpload: (key: string, uploadId: string) => Promise<void>
  abortMultipartUpload: (key: string, uploadId: string) => Promise<void>
  promote: (input: { sourceKey: string; sourceEtag: string; destinationKey: string; contentType: string; contentDisposition: 'inline' | 'attachment' }) => Promise<void>
  /** Idempotently create the bucket, remove anonymous policy, install lifecycle rules, and prove private reads. */
  ensureReady: () => Promise<void>
}

export function createStorage(config: StorageConfig): Storage {
  let endpoint: URL
  try { endpoint = new URL(config.endpoint) } catch { throw new Error('Storage endpoint must be an absolute HTTP(S) URL') }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Storage endpoint must be an absolute HTTP(S) URL without credentials')
  const client = config.client ?? new S3Client({
    region: config.region ?? 'auto',
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket
  const stateTagKey = config.stateTagKey ?? 'appkit-state'

  async function put(input: PutObjectInput): Promise<void> {
    if (typeof input.body !== 'string' && shouldUseMultipartUpload(input.body.byteLength)) {
      const uploadId = await createMultipartUpload({
        key: input.key,
        contentType: input.contentType ?? 'application/octet-stream',
        contentDisposition: input.contentDisposition,
        lifecycle: input.lifecycle,
      })
      try {
        const parts: Array<{ ETag: string; PartNumber: number }> = []
        const count = multipartPartCount(input.body.byteLength)
        for (let partNumber = 1; partNumber <= count; partNumber += 1) {
          const offset = (partNumber - 1) * MULTIPART_UPLOAD_PART_SIZE_BYTES
          const result = await client.send(new UploadPartCommand({ Bucket, Key: input.key, UploadId: uploadId, PartNumber: partNumber, Body: input.body.subarray(offset, Math.min(offset + MULTIPART_UPLOAD_PART_SIZE_BYTES, input.body.byteLength)) }))
          if (!result.ETag) throw new Error(`Storage did not confirm multipart part ${partNumber}`)
          parts.push({ ETag: result.ETag, PartNumber: partNumber })
        }
        await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: input.key, UploadId: uploadId, MultipartUpload: { Parts: parts } }))
      } catch (error) {
        try { await abortMultipartUpload(input.key, uploadId) } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Multipart upload and abort both failed')
        }
        throw error
      }
      return
    }
    await client.send(
      new PutObjectCommand({
        Bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentDisposition: input.contentDisposition ?? 'attachment',
        Metadata: input.metadata,
        Tagging: input.tagging ?? storageObjectTagging(input.lifecycle, stateTagKey),
      }),
    )
  }

  async function getBytes(key: string): Promise<Uint8Array> {
    const res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
    if (!res.Body) throw new Error(`Object ${key} has no body`)
    return await res.Body.transformToByteArray()
  }

  async function del(key: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
  }

  async function head(key: string): Promise<{ size: number; contentType?: string } | null> {
    const metadata = await headObject(key)
    return metadata ? { size: metadata.contentLength, ...(metadata.contentType ? { contentType: metadata.contentType } : {}) } : null
  }

  async function headObject(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
      return { contentLength: res.ContentLength ?? 0, contentType: res.ContentType ?? null, contentDisposition: res.ContentDisposition ?? null, metadata: res.Metadata ?? {}, etag: res.ETag ?? null }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      const name = (error as { name?: string }).name
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return null
      throw error
    }
  }

  async function exists(key: string): Promise<boolean> { return (await headObject(key)) !== null }

  async function getRange(key: string, start: number, end: number, ifMatch?: string): Promise<Uint8Array> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) throw new Error('Invalid object byte range')
    const result = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=${start}-${end}`, IfMatch: ifMatch }))
    if (!result.Body) throw new Error(`Object ${key} has no body`)
    return result.Body.transformToByteArray()
  }

  async function getStream(key: string): Promise<{ stream: ReadableStream; contentLength?: number; contentType?: string }> {
    const result = await client.send(new GetObjectCommand({ Bucket, Key: key }))
    if (!result.Body) throw new Error(`Object ${key} has no body`)
    return { stream: result.Body.transformToWebStream() as ReadableStream, ...(result.ContentLength === undefined ? {} : { contentLength: result.ContentLength }), ...(result.ContentType === undefined ? {} : { contentType: result.ContentType }) }
  }

  function presignPut(key: string, opts?: { expiresIn?: number; contentType?: string; metadata?: Record<string, string>; tagging?: string }): Promise<string> {
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket, Key: key, ContentType: opts?.contentType, Metadata: opts?.metadata, Tagging: opts?.tagging }),
      { expiresIn: opts?.expiresIn ?? 900 },
    )
  }

  function presignGet(key: string, opts?: { expiresIn?: number }): Promise<string> {
    return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
      expiresIn: opts?.expiresIn ?? 900,
    })
  }

  async function presignExistingGet(key: string, opts?: { expiresIn?: number }): Promise<string | null> {
    return (await exists(key)) ? presignGet(key, opts) : null
  }

  async function createMultipartUpload(input: { key: string; contentType: string; contentDisposition?: 'inline' | 'attachment'; uploadToken?: string; lifecycle?: StorageObjectLifecycle; tagging?: string }): Promise<string> {
    const result = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: input.key, ContentType: input.contentType, ContentDisposition: input.contentDisposition ?? 'attachment', Metadata: input.uploadToken ? { 'upload-token': input.uploadToken } : undefined, Tagging: input.tagging ?? (input.uploadToken ? `${stateTagKey}=pending` : storageObjectTagging(input.lifecycle, stateTagKey)) }))
    if (!result.UploadId) throw new Error('Storage did not create a multipart upload')
    return result.UploadId
  }

  function presignMultipartPart(key: string, uploadId: string, partNumber: number, expiresIn = 3_600): Promise<string> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) throw new Error('Multipart part number must be between 1 and 10000')
    return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn })
  }

  async function completeMultipartUpload(key: string, uploadId: string): Promise<void> {
    const parts: Array<{ ETag: string; PartNumber: number }> = []
    let marker: string | undefined
    do {
      const page = await client.send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }))
      for (const part of page.Parts ?? []) {
        if (!part.ETag || !part.PartNumber) throw new Error('Storage returned an incomplete multipart part record')
        parts.push({ ETag: part.ETag, PartNumber: part.PartNumber })
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined
    } while (marker)
    if (!parts.length) throw new Error('Multipart upload contains no parts')
    parts.sort((left, right) => left.PartNumber - right.PartNumber)
    await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }))
  }

  async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }))
  }

  async function promote(input: { sourceKey: string; sourceEtag: string; destinationKey: string; contentType: string; contentDisposition: 'inline' | 'attachment' }): Promise<void> {
    if (!input.sourceEtag.trim()) throw new Error('Verified source ETag is required')
    const source = `${Bucket}/${input.sourceKey}`.split('/').map(encodeURIComponent).join('/')
    await client.send(new CopyObjectCommand({ Bucket, Key: input.destinationKey, CopySource: source, CopySourceIfMatch: input.sourceEtag, ContentType: input.contentType, ContentDisposition: input.contentDisposition, MetadataDirective: 'REPLACE', Metadata: {}, TaggingDirective: 'REPLACE', Tagging: '' }))
  }

  function missingBucket(error: unknown): boolean {
    const value = error as { name?: string; code?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    return value.$metadata?.httpStatusCode === 404 || ['NotFound', 'NoSuchBucket'].includes(value.name ?? value.code ?? value.Code ?? '')
  }

  function missingPolicy(error: unknown): boolean {
    const value = error as { name?: string; code?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    return value.$metadata?.httpStatusCode === 404 || ['NoSuchBucketPolicy', 'NoSuchLifecycleConfiguration', 'NoSuchPolicy', 'NotFound'].includes(value.name ?? value.code ?? value.Code ?? '')
  }

  async function ensureReady(): Promise<void> {
    try { await client.send(new HeadBucketCommand({ Bucket })) }
    catch (error) {
      if (!missingBucket(error)) throw error
      await client.send(new CreateBucketCommand({ Bucket }))
    }
    const hostname = endpoint.hostname.toLowerCase()
    const r2 = hostname === 'r2.cloudflarestorage.com' || hostname.endsWith('.r2.cloudflarestorage.com')
    if (r2) {
      if (config.privateBucketConfirmed !== true) throw new Error('privateBucketConfirmed=true is required after disabling every R2 public development URL and custom domain')
    } else {
      try { await client.send(new DeleteBucketPolicyCommand({ Bucket })) }
      catch (error) { if (!missingPolicy(error)) throw error }
    }
    let existing: LifecycleRule[] = []
    try { existing = (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }))).Rules ?? [] }
    catch (error) { if (!missingPolicy(error)) throw error }
    await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: withManagedStorageLifecycleRules(existing, stateTagKey) } }))

    const probeKey = `_privacy-probe/${randomUUID()}`
    await put({ key: probeKey, body: new Uint8Array([1]), contentType: 'application/octet-stream' })
    try {
      const base = config.endpoint.replace(/\/$/, '')
      const encodedKey = probeKey.split('/').map(encodeURIComponent).join('/')
      const response = await fetch(`${base}/${encodeURIComponent(Bucket)}/${encodedKey}`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) })
      try {
        if (response.status >= 200 && response.status < 400) throw new Error(`Storage privacy verification failed: anonymous read returned HTTP ${response.status}`)
      } finally { await response.body?.cancel() }
    } finally { await del(probeKey) }
  }

  return { bucket: Bucket, client, put, getBytes, delete: del, head, headObject, exists, getRange, getStream, presignPut, presignGet, presignExistingGet, createMultipartUpload, presignMultipartPart, completeMultipartUpload, abortMultipartUpload, promote, ensureReady }
}
