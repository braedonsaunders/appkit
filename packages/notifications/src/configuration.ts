import type { NotificationChannel } from './index'
import { isValidCron, isValidTimezone } from './schedule'

export type NotificationRoutingCategory = {
  key: string
  label: string
  description: string
  defaultRoles: string[]
  defaultChannels?: NotificationChannel[]
}

export type NotificationRoleOption = { key: string; name: string }
export type NotificationRecipientOption = { value: string; label: string }
export type NotificationEscalationStep = { afterDays: number; roleKeys: string[] }
export type NotificationCategorySetting = {
  category: string
  enabled: boolean
  roleKeys: string[]
  userIds: string[]
  groupIds: string[]
  channels: NotificationChannel[]
  escalation: NotificationEscalationStep[]
}

export type NotificationPolicyInput = {
  digestMode: 'off' | 'daily' | 'weekly'
  digestHourUtc: number
  quietHours: { start: number; end: number } | null
  /** Optional application detection scan governed by the same production policy row. */
  scanEnabled: boolean
  scanCron: string
  scanTimezone: string
}

export type NotificationConfigurationInput = {
  settings: NotificationCategorySetting[]
  policy: NotificationPolicyInput
}

export type NotificationConfigurationAdapter = {
  save(input: NotificationConfigurationInput): Promise<void>
}

export type NotificationConfigurationAllowedValues = {
  categoryKeys: ReadonlySet<string>
  roleKeys: ReadonlySet<string>
  userIds: ReadonlySet<string>
  groupIds: ReadonlySet<string>
}

const CHANNEL_SET = new Set<string>(['in_app', 'email', 'push', 'sms'])

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function normalizeNotificationConfiguration(
  input: NotificationConfigurationInput,
  allowed: NotificationConfigurationAllowedValues,
): NotificationConfigurationInput {
  assertNotificationPolicy(input.policy)
  const seen = new Set<string>()
  const settings = input.settings.map((item) => {
    if (!allowed.categoryKeys.has(item.category) || seen.has(item.category)) throw new Error('One or more notification categories are invalid.')
    seen.add(item.category)
    return {
      category: item.category,
      enabled: Boolean(item.enabled),
      roleKeys: unique(item.roleKeys).filter((key) => allowed.roleKeys.has(key)),
      userIds: unique(item.userIds).filter((id) => allowed.userIds.has(id)),
      groupIds: unique(item.groupIds).filter((id) => allowed.groupIds.has(id)),
      channels: unique(item.channels).filter((channel): channel is NotificationChannel => CHANNEL_SET.has(channel)),
      escalation: normalizeEscalation(item.escalation, allowed.roleKeys),
    }
  })
  return { settings, policy: { ...input.policy, scanCron: input.policy.scanCron.trim() } }
}

export function normalizeEscalation(
  steps: readonly NotificationEscalationStep[],
  allowedRoleKeys?: ReadonlySet<string>,
): NotificationEscalationStep[] {
  return steps
    .map((step) => ({
      afterDays: Math.min(365, Math.max(1, Math.round(step.afterDays || 1))),
      roleKeys: unique(step.roleKeys).filter((key) => !allowedRoleKeys || allowedRoleKeys.has(key)),
    }))
    .filter((step) => step.roleKeys.length > 0)
    .sort((left, right) => left.afterDays - right.afterDays)
}

export function assertNotificationPolicy(input: NotificationPolicyInput): void {
  if (!(['off', 'daily', 'weekly'] as const).includes(input.digestMode)) throw new Error('Choose a valid digest schedule.')
  if (!Number.isInteger(input.digestHourUtc) || input.digestHourUtc < 0 || input.digestHourUtc > 23) {
    throw new Error('Digest hour must be a whole UTC hour from 0 to 23.')
  }
  if (input.quietHours && (!validHour(input.quietHours.start) || !validHour(input.quietHours.end))) {
    throw new Error('Quiet hours must use whole UTC hours from 0 to 23.')
  }
  if (!isValidCron(input.scanCron)) throw new Error('Enter a valid five-part scan schedule.')
  if (!isValidTimezone(input.scanTimezone)) throw new Error('Choose a valid scan timezone.')
}

function validHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 23
}
