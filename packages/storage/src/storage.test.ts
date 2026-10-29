import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import type { S3Client } from '@aws-sdk/client-s3'
import { assertTenantObjectKey, createStorage, multipartPartCount, newTenantObjectKey, objectKeyFromStorageUrl, shouldUseMultipartUpload } from './index'
import { createStorageFromEnv } from './env'

const TENANT = '10000000-0000-4000-8000-000000000001'

test('tenant object keys preserve source ownership and traversal guards', () => {
  const key = newTenantObjectKey({ tenantId: TENANT, scope: 'document/rendered', filename: 'report one.pdf' })
  assert.match(key, new RegExp(`^t/${TENANT}/document/rendered/`))
  assert.doesNotThrow(() => assertTenantObjectKey({ tenantId: TENANT, key }))
  assert.throws(() => assertTenantObjectKey({ tenantId: TENANT, key: `t/${TENANT}/../secret` }))
})

test('storage URL recovery only accepts the configured origin, path, and bucket', () => {
  const endpoint = 'https://s3.example.test/minio'
  assert.equal(objectKeyFromStorageUrl({ url: `${endpoint}/appkit/t/${TENANT}/branding/logo.png?signature=old`, endpoint, bucket: 'appkit' }), `t/${TENANT}/branding/logo.png`)
  assert.equal(objectKeyFromStorageUrl({ url: 'https://other.test/appkit/logo.png', endpoint, bucket: 'appkit' }), null)
  assert.equal(objectKeyFromStorageUrl({ url: `${endpoint}/appkit/branding%2Flogo.png`, endpoint, bucket: 'appkit' }), null)
})

test('multipart thresholds and part counts match the source behavior', () => {
  assert.equal(shouldUseMultipartUpload(256 * 1024 * 1024), true)
  assert.equal(shouldUseMultipartUpload(255 * 1024 * 1024), false)
  assert.equal(multipartPartCount(129 * 1024 * 1024), 3)
  assert.throws(() => multipartPartCount(0))
})

test('portable environment configuration is strict and application-agnostic', () => {
  const client = { send: async () => ({}) } as unknown as S3Client
  const storage = createStorageFromEnv(
    {
      APPKIT_STORAGE_ENDPOINT: 'https://storage.example.test',
      APPKIT_STORAGE_ACCESS_KEY_ID: 'access',
      APPKIT_STORAGE_SECRET_ACCESS_KEY: 'secret',
      APPKIT_STORAGE_BUCKET: 'documents',
      APPKIT_STORAGE_FORCE_PATH_STYLE: 'false',
      APPKIT_STORAGE_PRIVATE_BUCKET_CONFIRMED: 'true',
    },
    { client },
  )
  assert.equal(storage.bucket, 'documents')
  assert.equal(storage.client, client)
  assert.throws(() => createStorageFromEnv({}, { client }), /APPKIT_STORAGE_ENDPOINT is required/)
  assert.throws(
    () =>
      createStorageFromEnv(
        {
          APPKIT_STORAGE_ENDPOINT: 'https://storage.example.test',
          APPKIT_STORAGE_ACCESS_KEY_ID: 'access',
          APPKIT_STORAGE_SECRET_ACCESS_KEY: 'secret',
          APPKIT_STORAGE_BUCKET: 'documents',
          APPKIT_STORAGE_FORCE_PATH_STYLE: 'sometimes',
        },
        { client },
      ),
    /must be true or false/,
  )
})

test('private-bucket readiness is explicit, idempotent, and verifies anonymous reads without waiting for a response body', { timeout: 2_000 }, async () => {
  const commands: string[] = []
  const client = {
    async send(command: object) {
      commands.push(command.constructor.name)
      if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') return { Rules: [] }
      return {}
    },
  } as unknown as S3Client
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'content-length': '128' })
    response.flushHeaders()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await createStorage({ endpoint: `http://127.0.0.1:${address.port}`, bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client }).ensureReady()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  assert.deepEqual(commands, [
    'HeadBucketCommand',
    'DeleteBucketPolicyCommand',
    'GetBucketLifecycleConfigurationCommand',
    'PutBucketLifecycleConfigurationCommand',
    'PutObjectCommand',
    'DeleteObjectCommand',
  ])
})

test('stream uploads multipart parts in bounded chunks and commits in order', async () => {
  const seen: Array<{ name: string; input: Record<string, unknown> }> = []
  const client = { async send(command: { input: Record<string, unknown> }) {
    const name = command.constructor.name
    seen.push({ name, input: command.input })
    if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload' }
    if (name === 'UploadPartCommand') return { ETag: `part-${command.input.PartNumber}` }
    return {}
  } } as unknown as S3Client
  const storage = createStorage({ endpoint: 'https://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client })
  async function* source() { yield Buffer.alloc(8 * 1024 * 1024, 1); yield Buffer.from('tail') }
  await storage.putStream({ key: 'object', body: source() })
  assert.deepEqual(seen.map((entry) => entry.name), ['CreateMultipartUploadCommand', 'UploadPartCommand', 'UploadPartCommand', 'CompleteMultipartUploadCommand'])
  assert.equal((seen[1]!.input.Body as Buffer).length, 8 * 1024 * 1024)
  assert.equal((seen[2]!.input.Body as Buffer).toString(), 'tail')
  assert.deepEqual((seen[3]!.input.MultipartUpload as { Parts: unknown[] }).Parts, [{ ETag: 'part-1', PartNumber: 1 }, { ETag: 'part-2', PartNumber: 2 }])
})

test('stream upload aborts its multipart object when the producer fails or is cancelled', async () => {
  const seen: string[] = []
  const client = { async send(command: object) {
    const name = command.constructor.name
    seen.push(name)
    if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload' }
    return {}
  } } as unknown as S3Client
  const storage = createStorage({ endpoint: 'https://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client })
  const abort = new AbortController()
  async function* source() { yield Buffer.from('one'); abort.abort(); yield Buffer.from('two') }
  await assert.rejects(storage.putStream({ key: 'object', body: source(), signal: abort.signal }))
  assert.deepEqual(seen, ['CreateMultipartUploadCommand', 'AbortMultipartUploadCommand'])
})

test('empty streaming upload aborts multipart and writes an empty object', async () => {
  const seen: string[] = []
  const client = { async send(command: object) {
    const name = command.constructor.name
    seen.push(name)
    return name === 'CreateMultipartUploadCommand' ? { UploadId: 'upload' } : {}
  } } as unknown as S3Client
  const storage = createStorage({ endpoint: 'https://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client })
  async function* source(): AsyncGenerator<Uint8Array> { return }
  await storage.putStream({ key: 'empty', body: source() })
  assert.deepEqual(seen, ['CreateMultipartUploadCommand', 'AbortMultipartUploadCommand', 'PutObjectCommand'])
})

test('stream download forwards cancellation to object storage', async () => {
  const abort = new AbortController()
  let received: AbortSignal | undefined
  const client = { async send(_command: object, options: { abortSignal?: AbortSignal }) {
    received = options.abortSignal
    return { Body: { transformToWebStream: () => new ReadableStream() } }
  } } as unknown as S3Client
  const storage = createStorage({ endpoint: 'https://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client })
  await storage.getStream('object', { signal: abort.signal })
  assert.equal(received, abort.signal)
})


test('object deletion forwards cancellation to storage', async () => {
  const abort = new AbortController()
  let received: AbortSignal | undefined
  const client = { async send(_command: object, options: { abortSignal?: AbortSignal }) { received = options.abortSignal; return {} } } as unknown as S3Client
  const storage = createStorage({ endpoint: 'https://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client })
  await storage.delete('object', { signal: abort.signal })
  assert.equal(received, abort.signal)
})
