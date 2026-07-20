export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'push', 'sms'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export type NotificationCategory = { key: string; label: string; description?: string; defaultChannels: NotificationChannel[] }
export type NotificationCatalog = { categories: NotificationCategory[] }
export type NotificationPreference = { category: string; channel: NotificationChannel; enabled: boolean }
export type NotificationRecipient = { userId: string; email?: string | null; phone?: string | null }
export type NotificationEvent = { tenantId: string; sourceId: string; category: string; type: string; title: string; body?: string; linkPath?: string; data?: Record<string, unknown>; critical?: boolean; channels?: NotificationChannel[]; occurredAt?: Date }
export type NotificationRecord = NotificationEvent & { id: string; userId: string; readAt?: Date | null; snoozedUntil?: Date | null }
export type NotificationTenantPolicy = { categoryChannels?: Record<string, NotificationChannel[]>; digestMode?: 'off' | 'daily' | 'weekly'; quietHoursUtc?: { start: number; end: number } | null }
export type NotificationDelivery = { channel: NotificationChannel; recipient: NotificationRecipient; event: NotificationEvent; delayMs: number; deduplicationKey: string }

export type NotificationStore = {
  preferences(tenantId: string, userIds: string[], category: string): Promise<Map<string, Map<NotificationChannel, boolean>>>
  insert(event: NotificationEvent, recipient: NotificationRecipient): Promise<{ record: NotificationRecord; created: boolean }>
}
export type NotificationDeliverer = (delivery: NotificationDelivery) => Promise<void>

export function planNotificationDeliveries(event: NotificationEvent, recipients: readonly NotificationRecipient[], preferences: Map<string, Map<NotificationChannel, boolean>>, policy: NotificationTenantPolicy = {}, now = new Date()): NotificationDelivery[] {
  const configured = policy.categoryChannels?.[event.category]
  const allowed: readonly NotificationChannel[] = configured?.length
    ? configured
    : event.channels?.length
      ? event.channels
      : ['in_app', 'email']
  const quiet = inQuietHours(policy.quietHoursUtc ?? null, now.getUTCHours())
  const deliveries: NotificationDelivery[] = []
  for (const recipient of recipients) {
    for (const channel of allowed) {
      if (preferences.get(recipient.userId)?.get(channel) === false) continue
      if (channel === 'email' && policy.digestMode !== undefined && policy.digestMode !== 'off' && !event.critical) continue
      if (channel === 'push' && quiet && !event.critical) continue
      if (channel === 'sms' && !event.critical) continue
      if (channel === 'email' && !recipient.email) continue
      if (channel === 'sms' && !recipient.phone) continue
      deliveries.push({ channel, recipient, event, delayMs: channel === 'email' && quiet && !event.critical && policy.quietHoursUtc ? millisecondsUntilQuietEnd(policy.quietHoursUtc, now) : 0, deduplicationKey: notificationDeduplicationKey(event, recipient.userId, channel) })
    }
  }
  return deliveries
}

export async function dispatchNotification(input: { event: NotificationEvent; recipients: readonly NotificationRecipient[]; policy?: NotificationTenantPolicy; store: NotificationStore; deliverers?: Partial<Record<NotificationChannel, NotificationDeliverer>>; now?: Date }): Promise<{ records: NotificationRecord[]; deliveries: NotificationDelivery[] }> {
  assertNotificationEvent(input.event)
  const userIds = [...new Set(input.recipients.map((recipient) => recipient.userId))]
  const preferences = await input.store.preferences(input.event.tenantId, userIds, input.event.category)
  const planned = planNotificationDeliveries(input.event, input.recipients, preferences, input.policy, input.now)
  const inAppUsers = new Set(planned.filter((delivery) => delivery.channel === 'in_app').map((delivery) => delivery.recipient.userId))
  const records: NotificationRecord[] = []
  for (const recipient of input.recipients) {
    if (!inAppUsers.has(recipient.userId)) continue
    const result = await input.store.insert(input.event, recipient)
    records.push(result.record)
  }
  for (const delivery of planned) {
    if (delivery.channel === 'in_app') continue
    const deliver = input.deliverers?.[delivery.channel]
    if (!deliver) throw new Error(`Notification channel ${delivery.channel} is enabled but has no delivery adapter`)
    await deliver(delivery)
  }
  return { records, deliveries: planned }
}

export function assertNotificationEvent(event: NotificationEvent): void {
  if (!event.tenantId.trim() || !event.sourceId.trim() || !event.category.trim() || !event.type.trim() || !event.title.trim()) throw new Error('Notification tenant, source, category, type, and title are required')
  if (event.title.length > 200 || (event.body?.length ?? 0) > 2_000 || (event.linkPath?.length ?? 0) > 2_000) throw new Error('Notification content exceeds its bounded limits')
  if (event.linkPath && (!event.linkPath.startsWith('/') || event.linkPath.startsWith('//'))) throw new Error('Notification links must be application-relative paths')
}

export function notificationDeduplicationKey(event: NotificationEvent, userId: string, channel: NotificationChannel): string { return `${event.tenantId}\u0000${event.sourceId}\u0000${userId}\u0000${channel}` }
export function inQuietHours(window: { start: number; end: number } | null, hourUtc: number): boolean { if (!window || window.start === window.end) return false; return window.start < window.end ? hourUtc >= window.start && hourUtc < window.end : hourUtc >= window.start || hourUtc < window.end }
export function millisecondsUntilQuietEnd(window: { start: number; end: number }, now: Date): number { const end = new Date(now); end.setUTCMinutes(0, 0, 0); end.setUTCHours(window.end); if (end <= now) end.setUTCDate(end.getUTCDate() + 1); return end.getTime() - now.getTime() }
