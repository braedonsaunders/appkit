// S3-compatible object storage (Cloudflare R2 in prod, MinIO in dev, or AWS).
// Same code path either way — only the endpoint/credentials change. (Core
// operations copied from the beaconhs storage package, generalized into a
// factory; the R2-specific bucket lifecycle/policy management is left to the app.)

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type StorageConfig = {
  /** e.g. http://localhost:9000 (MinIO) or https://{account}.r2.cloudflarestorage.com */
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  /** Path-style addressing (required for MinIO/R2). Default true. */
  forcePathStyle?: boolean
}

export type PutObjectInput = {
  key: string
  body: Uint8Array | Buffer | string
  contentType?: string
  metadata?: Record<string, string>
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
  /** A presigned URL to upload directly (PUT). */
  presignPut: (key: string, opts?: { expiresIn?: number; contentType?: string }) => Promise<string>
  /** A presigned URL to download directly (GET). */
  presignGet: (key: string, opts?: { expiresIn?: number }) => Promise<string>
}

export function createStorage(config: StorageConfig): Storage {
  const client = new S3Client({
    region: config.region ?? 'auto',
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket

  async function put(input: PutObjectInput): Promise<void> {
    await client.send(
      new PutObjectCommand({
        Bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
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
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
      return { size: res.ContentLength ?? 0, contentType: res.ContentType }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      const name = (error as { name?: string }).name
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return null
      throw error
    }
  }

  function presignPut(key: string, opts?: { expiresIn?: number; contentType?: string }): Promise<string> {
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket, Key: key, ContentType: opts?.contentType }),
      { expiresIn: opts?.expiresIn ?? 900 },
    )
  }

  function presignGet(key: string, opts?: { expiresIn?: number }): Promise<string> {
    return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
      expiresIn: opts?.expiresIn ?? 900,
    })
  }

  return { bucket: Bucket, client, put, getBytes, delete: del, head, presignPut, presignGet }
}
