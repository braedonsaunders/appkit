import assert from 'node:assert/strict'
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

test('private-bucket readiness is explicit, idempotent, and verifies anonymous reads', async () => {
  const commands: string[] = []
  const client = {
    async send(command: object) {
      commands.push(command.constructor.name)
      if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') return { Rules: [] }
      return {}
    },
  } as unknown as S3Client
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 403 })
  try {
    await createStorage({ endpoint: 'http://storage.example.test', bucket: 'private', accessKeyId: 'key', secretAccessKey: 'secret', client }).ensureReady()
  } finally {
    globalThis.fetch = originalFetch
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
