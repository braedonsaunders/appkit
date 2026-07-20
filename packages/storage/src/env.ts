import { createStorage, type Storage, type StorageConfig } from './index'

export type StorageEnvironment = Readonly<
  Partial<
    Record<
      | 'APPKIT_STORAGE_ENDPOINT'
      | 'APPKIT_STORAGE_ACCESS_KEY_ID'
      | 'APPKIT_STORAGE_SECRET_ACCESS_KEY'
      | 'APPKIT_STORAGE_BUCKET'
      | 'APPKIT_STORAGE_REGION'
      | 'APPKIT_STORAGE_FORCE_PATH_STYLE'
      | 'APPKIT_STORAGE_PRIVATE_BUCKET_CONFIRMED'
      | 'APPKIT_STORAGE_STATE_TAG_KEY',
      string
    >
  >
>

function required(environment: StorageEnvironment, name: keyof StorageEnvironment): string {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('Storage boolean environment values must be true or false')
}

/**
 * Create the full storage runtime from a portable AppKit environment contract.
 * Applications that use another configuration system should call createStorage directly.
 */
export function createStorageFromEnv(
  environment: StorageEnvironment = process.env,
  overrides: Pick<StorageConfig, 'client'> = {},
): Storage {
  return createStorage({
    endpoint: required(environment, 'APPKIT_STORAGE_ENDPOINT'),
    accessKeyId: required(environment, 'APPKIT_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required(environment, 'APPKIT_STORAGE_SECRET_ACCESS_KEY'),
    bucket: required(environment, 'APPKIT_STORAGE_BUCKET'),
    region: environment.APPKIT_STORAGE_REGION?.trim() || 'auto',
    forcePathStyle: booleanValue(environment.APPKIT_STORAGE_FORCE_PATH_STYLE, true),
    privateBucketConfirmed: booleanValue(
      environment.APPKIT_STORAGE_PRIVATE_BUCKET_CONFIRMED,
      false,
    ),
    stateTagKey: environment.APPKIT_STORAGE_STATE_TAG_KEY?.trim() || 'appkit-state',
    ...overrides,
  })
}
