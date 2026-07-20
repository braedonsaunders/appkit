import type { LifecycleRule } from '@aws-sdk/client-s3'

const PENDING_RULE_ID = 'expire-unfinalized-uploads'
const TRANSIENT_RULE_ID = 'expire-transient-artifacts'
const DEFAULT_STATE_TAG_KEY = 'appkit-state'

export type StorageObjectLifecycle = 'durable' | 'transient'

export function storageObjectTagging(
  lifecycle: StorageObjectLifecycle | undefined,
  stateTagKey = DEFAULT_STATE_TAG_KEY,
): string | undefined {
  return lifecycle === 'transient' ? `${stateTagKey}=transient` : undefined
}

export function withManagedStorageLifecycleRules(
  existingRules: readonly LifecycleRule[],
  stateTagKey = DEFAULT_STATE_TAG_KEY,
): LifecycleRule[] {
  return [
    ...existingRules.filter((rule) => rule.ID !== PENDING_RULE_ID && rule.ID !== TRANSIENT_RULE_ID),
    {
      ID: PENDING_RULE_ID,
      Status: 'Enabled',
      Filter: { Tag: { Key: stateTagKey, Value: 'pending' } },
      Expiration: { Days: 1 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
    {
      ID: TRANSIENT_RULE_ID,
      Status: 'Enabled',
      Filter: { Tag: { Key: stateTagKey, Value: 'transient' } },
      Expiration: { Days: 1 },
    },
  ]
}
